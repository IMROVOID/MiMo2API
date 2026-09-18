import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types/openai.js";
import { resolveModelId } from "./model-catalog.js";
import { AccountPoolManager, parseCooldownDuration } from "../auth/pool-manager.js";
import {
  parseSSELine,
  transformUpstreamChunk,
  formatSSEChunk,
  SSE_DONE_MESSAGE,
} from "./stream-transformer.js";

export interface ProxyHandlerOptions {
  readonly pool: AccountPoolManager;
  readonly upstreamBaseUrl?: string | undefined;
  readonly requestTimeoutMs?: number | undefined;
}

export interface ProxyResult {
  readonly status: number;
  readonly isStream: boolean;
  readonly jsonResponse?: ChatCompletionResponse;
  readonly streamResponse?: ReadableStream<Uint8Array>;
  readonly errorResponse?: Record<string, unknown>;
}

export class CompletionProxyHandler {
  private pool: AccountPoolManager;
  private upstreamBaseUrl: string;
  private requestTimeoutMs: number;

  constructor(options: ProxyHandlerOptions) {
    this.pool = options.pool;
    this.upstreamBaseUrl = options.upstreamBaseUrl ?? "https://api.xiaomimimo.com/v1";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  }

  public async handleCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal | undefined
  ): Promise<ProxyResult> {
    if (signal?.aborted) {
      return {
        status: 499,
        isStream: false,
        errorResponse: {
          error: { message: "Client cancelled request.", type: "client_closed_request" },
        },
      };
    }

    const requestedModel = request.model;
    const targetModel = resolveModelId(requestedModel);

    const upstreamPayload = {
      ...request,
      model: targetModel,
    };

    const maxAttempts = Math.max(1, this.pool.getStats().total);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        return {
          status: 499,
          isStream: false,
          errorResponse: {
            error: { message: "Client cancelled request.", type: "client_closed_request" },
          },
        };
      }

      const account = await this.pool.getNextAvailableAccount();
      if (account === null) {
        return {
          status: 429,
          isStream: false,
          errorResponse: {
            error: {
              message: "All MiMo accounts in pool are currently in cooldown or unavailable.",
              type: "rate_limit_error",
              code: "all_accounts_cooling_down",
            },
          },
        };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: request.stream === true ? "text/event-stream" : "application/json",
        Authorization: `Bearer ${account.accessToken}`,
      };

      const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
      const combinedSignal =
        signal !== undefined ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      try {
        const response = await fetch(`${this.upstreamBaseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(upstreamPayload),
          signal: combinedSignal,
        });

        // Check for 429 Quota Exceeded / Rate Limit
        if (response.status === 429) {
          const bodyText = await response.text();
          const retryAfter = response.headers.get("Retry-After");
          const cooldownMs = parseCooldownDuration(retryAfter, bodyText);

          this.pool.markCooldown(account.id, cooldownMs, `HTTP 429: ${bodyText.slice(0, 100)}`);
          continue; // Retry with next account in pool
        }

        if (!response.ok) {
          const errorBody = await response.text();
          let parsedError: Record<string, unknown> = {};
          try {
            parsedError = JSON.parse(errorBody) as Record<string, unknown>;
          } catch {
            parsedError = { error: { message: errorBody, code: response.status } };
          }
          return {
            status: response.status,
            isStream: false,
            errorResponse: parsedError,
          };
        }

        // Handle Streaming
        if (request.stream === true) {
          const stream = this.createTransformedStream(response.body, requestedModel);
          return {
            status: 200,
            isStream: true,
            streamResponse: stream,
          };
        }

        // Handle Non-Streaming JSON
        const rawJson = (await response.json()) as Record<string, unknown>;
        const normalizedJson: ChatCompletionResponse = {
          id: typeof rawJson["id"] === "string" ? rawJson["id"] : `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created:
            typeof rawJson["created"] === "number"
              ? rawJson["created"]
              : Math.floor(Date.now() / 1000),
          model: requestedModel,
          choices: Array.isArray(rawJson["choices"])
            ? (rawJson["choices"] as ChatCompletionResponse["choices"])
            : [],
          ...(rawJson["usage"] !== undefined
            ? { usage: rawJson["usage"] as ChatCompletionResponse["usage"] }
            : {}),
        };

        return {
          status: 200,
          isStream: false,
          jsonResponse: normalizedJson,
        };
      } catch (networkErr) {
        if (signal?.aborted) {
          return {
            status: 499,
            isStream: false,
            errorResponse: {
              error: { message: "Client cancelled request.", type: "client_closed_request" },
            },
          };
        }
        this.pool.markCooldown(account.id, 15_000, String(networkErr));
      }
    }

    return {
      status: 502,
      isStream: false,
      errorResponse: {
        error: {
          message: "Failed to fulfill completion after rotating across available accounts.",
          type: "bad_gateway",
        },
      },
    };
  }

  private createTransformedStream(
    body: ReadableStream<Uint8Array> | null,
    requestedModel: string
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (body === null) {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(SSE_DONE_MESSAGE));
          controller.close();
        },
      });
    }

    let buffer = "";
    const reader = body.getReader();

    return new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            if (buffer.trim().length > 0) {
              const lines = buffer.split("\n");
              for (const line of lines) {
                const parsed = parseSSELine(line);
                if (parsed !== null && parsed !== "[DONE]") {
                  const chunk = transformUpstreamChunk(parsed, requestedModel);
                  if (chunk !== null) {
                    controller.enqueue(encoder.encode(formatSSEChunk(chunk)));
                  }
                }
              }
            }
            controller.enqueue(encoder.encode(SSE_DONE_MESSAGE));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const parsed = parseSSELine(line);
            if (parsed === "[DONE]") {
              controller.enqueue(encoder.encode(SSE_DONE_MESSAGE));
              controller.close();
              return;
            } else if (parsed !== null) {
              const chunk = transformUpstreamChunk(parsed, requestedModel);
              if (chunk !== null) {
                controller.enqueue(encoder.encode(formatSSEChunk(chunk)));
              }
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }
}
