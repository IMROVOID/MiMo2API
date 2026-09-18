import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSSELine,
  formatSSEChunk,
  createChunkDelta,
  transformUpstreamChunk,
} from "../../src/proxy/stream-transformer.js";

describe("stream-transformer", () => {
  it("parses single data line in SSE stream", () => {
    const raw = 'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"hello"}}]}';
    const parsed = parseSSELine(raw);
    assert.ok(parsed !== null && parsed !== "[DONE]");
    assert.equal(parsed["id"], "chatcmpl-1");
  });

  it("identifies [DONE] message", () => {
    const parsed = parseSSELine("data: [DONE]");
    assert.equal(parsed, "[DONE]");
  });

  it("formats chunk into valid SSE event string", () => {
    const chunk = createChunkDelta({
      id: "cmpl-abc",
      model: "mimo-x-pro",
      index: 0,
      content: "Hello world",
    });

    const sseText = formatSSEChunk(chunk);
    assert.ok(sseText.startsWith("data: "));
    assert.ok(sseText.endsWith("\n\n"));
    assert.ok(sseText.includes("Hello world"));
    assert.ok(sseText.includes("mimo-x-pro"));
  });

  it("preserves reasoning_content in delta", () => {
    const chunk = createChunkDelta({
      id: "cmpl-reasoning",
      model: "mimo-x-pro",
      index: 0,
      reasoningContent: "Thinking about the solution...",
    });

    assert.equal(chunk.choices[0]?.delta.reasoning_content, "Thinking about the solution...");
  });

  it("transforms upstream JSON chunk and preserves model identity", () => {
    const upstreamJson = {
      id: "upstream-1",
      choices: [{ delta: { content: "Foo", reasoning_content: "Bar" } }],
    };

    const transformed = transformUpstreamChunk(upstreamJson, "mimo-x-pro");
    assert.ok(transformed !== null);
    assert.equal(transformed.model, "mimo-x-pro");
    assert.equal(transformed.choices[0]?.delta.content, "Foo");
    assert.equal(transformed.choices[0]?.delta.reasoning_content, "Bar");
  });
});
