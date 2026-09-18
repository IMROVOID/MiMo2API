import type {
  ChatCompletionChunk,
  ChatCompletionChunkChoice,
} from "../types/openai.js";

export interface ChunkDeltaOptions {
  readonly id: string;
  readonly model: string;
  readonly index?: number;
  readonly role?: "assistant";
  readonly content?: string | null;
  readonly reasoningContent?: string | null;
  readonly finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

/**
 * Parses a line from an SSE stream
 */
export function parseSSELine(line: string): Record<string, unknown> | "[DONE]" | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    return "[DONE]";
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON SSE payload
  }
  return null;
}

/**
 * Creates an OpenAI-compliant streaming chunk
 */
export function createChunkDelta(options: ChunkDeltaOptions): ChatCompletionChunk {
  const choice: ChatCompletionChunkChoice = {
    index: options.index ?? 0,
    delta: {
      ...(options.role !== undefined ? { role: options.role } : {}),
      ...(options.content !== undefined ? { content: options.content } : {}),
      ...(options.reasoningContent !== undefined
        ? { reasoning_content: options.reasoningContent }
        : {}),
    },
    finish_reason: options.finishReason ?? null,
  };

  return {
    id: options.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: options.model,
    choices: [choice],
  };
}

/**
 * Transforms an upstream raw JSON chunk to guarantee OpenAI compliance
 */
export function transformUpstreamChunk(
  upstream: Record<string, unknown>,
  requestedModel: string
): ChatCompletionChunk | null {
  const id = typeof upstream["id"] === "string" ? upstream["id"] : `chatcmpl-${Date.now()}`;
  const choicesRaw = Array.isArray(upstream["choices"]) ? upstream["choices"] : [];

  const choices: ChatCompletionChunkChoice[] = [];
  for (let i = 0; i < choicesRaw.length; i++) {
    const rawChoice = choicesRaw[i];
    if (rawChoice !== null && typeof rawChoice === "object") {
      const deltaObj = (rawChoice as Record<string, unknown>)["delta"];
      const finishReason = (rawChoice as Record<string, unknown>)["finish_reason"];

      let content: string | null = null;
      let reasoningContent: string | null = null;
      let role: "assistant" | undefined = undefined;

      if (deltaObj !== null && typeof deltaObj === "object") {
        const d = deltaObj as Record<string, unknown>;
        if (typeof d["content"] === "string") content = d["content"];
        if (typeof d["reasoning_content"] === "string") reasoningContent = d["reasoning_content"];
        if (d["role"] === "assistant") role = "assistant";
      }

      choices.push({
        index: i,
        delta: {
          ...(role !== undefined ? { role } : {}),
          ...(content !== null ? { content } : {}),
          ...(reasoningContent !== null ? { reasoning_content: reasoningContent } : {}),
        },
        finish_reason:
          typeof finishReason === "string"
            ? (finishReason as "stop" | "length" | "tool_calls" | "content_filter")
            : null,
      });
    }
  }

  if (choices.length === 0) {
    return null;
  }

  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices,
  };
}

/**
 * Formats a chunk into an SSE message
 */
export function formatSSEChunk(chunk: ChatCompletionChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export const SSE_DONE_MESSAGE = "data: [DONE]\n\n";
