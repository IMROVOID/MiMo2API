import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerConfig } from "../types/config.js";
import type { ChatCompletionRequest } from "../types/openai.js";
import { getModelList } from "../proxy/model-catalog.js";
import { CompletionProxyHandler } from "../proxy/completion-handler.js";
import type { AccountPoolManager } from "../auth/pool-manager.js";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export class RequestDispatcher {
  private config: ServerConfig;
  private pool: AccountPoolManager;
  private handler: CompletionProxyHandler;

  constructor(config: ServerConfig, pool: AccountPoolManager) {
    this.config = config;
    this.pool = pool;
    this.handler = new CompletionProxyHandler({
      pool,
      upstreamBaseUrl: config.upstreamBaseUrl,
    });
  }

  public async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Add CORS headers to all responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // Check optional Bearer authentication
    if (this.config.apiKey !== undefined && this.config.apiKey.trim() !== "") {
      const authHeader = req.headers.authorization;
      const expected = `Bearer ${this.config.apiKey}`;
      if (authHeader !== expected) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "Invalid API key provided.",
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          })
        );
        return;
      }
    }

    // Route: GET / or GET /v1/health
    if (req.method === "GET" && (pathname === "/v1/health" || pathname === "/health" || pathname === "/")) {
      this.handleHealth(res);
      return;
    }

    // Route: GET /v1/models
    if (req.method === "GET" && pathname === "/v1/models") {
      this.handleModels(res);
      return;
    }

    // Route: POST /v1/chat/completions
    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      await this.handleChatCompletions(req, res);
      return;
    }

    // Fallback: 404 Not Found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Unknown path: ${pathname}`,
          type: "invalid_request_error",
          code: "resource_not_found",
        },
      })
    );
  }

  private handleHealth(res: ServerResponse): void {
    const stats = this.pool.getStats();
    const isDegraded = stats.total > 0 && stats.active === 0;
    const isUnhealthy = stats.total === 0;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          status: isUnhealthy ? "unhealthy" : isDegraded ? "degraded" : "healthy",
          version: "1.0.0",
          mode: "local-daemon",
          api_key_configured: this.config.apiKey !== undefined && this.config.apiKey !== "",
          account_count: stats.total,
          active_accounts: stats.active,
          cooldown_accounts: stats.inCooldown,
          supported_models: [
            "mimo-x-pro",
            "mimo-x-flash",
            "MiMo-X-Pro-Preview",
            "MiMo-X-Flash-Preview",
            "mimo-v2.5-pro",
            "mimo-v2.5-flash",
          ],
        },
        null,
        2
      )
    );
  }

  private handleModels(res: ServerResponse): void {
    const list = getModelList();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(list, null, 2));
  }

  private async handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB
    let rawBody = "";
    req.setEncoding("utf-8");

    for await (const chunk of req) {
      rawBody += chunk;
      if (rawBody.length > MAX_PAYLOAD_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "Payload too large. Maximum supported request size is 10MB.",
              type: "invalid_request_error",
            },
          })
        );
        return;
      }
    }

    let parsedBody: ChatCompletionRequest;
    try {
      parsedBody = JSON.parse(rawBody) as ChatCompletionRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Malformed JSON payload in request body.",
            type: "invalid_request_error",
          },
        })
      );
      return;
    }

    if (!parsedBody.model || !Array.isArray(parsedBody.messages)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Missing required 'model' or 'messages' field.",
            type: "invalid_request_error",
          },
        })
      );
      return;
    }

    const abortController = new AbortController();
    req.on("close", () => {
      abortController.abort();
    });

    const proxyResult = await this.handler.handleCompletion(parsedBody, abortController.signal);

    if (proxyResult.isStream && proxyResult.streamResponse !== undefined) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const reader = proxyResult.streamResponse.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value !== undefined) {
            res.write(Buffer.from(value));
          }
        }
      } finally {
        res.end();
      }
      return;
    }

    if (proxyResult.jsonResponse !== undefined) {
      res.writeHead(proxyResult.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(proxyResult.jsonResponse));
      return;
    }

    res.writeHead(proxyResult.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(proxyResult.errorResponse ?? {}));
  }
}
