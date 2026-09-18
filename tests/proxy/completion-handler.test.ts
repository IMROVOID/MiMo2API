import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompletionProxyHandler } from "../../src/proxy/completion-handler.js";
import { AccountPoolManager } from "../../src/auth/pool-manager.js";
import type { ChatCompletionRequest } from "../../src/types/openai.js";

describe("completion-handler", () => {
  it("proxies non-streaming request successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (_url, init) => {
        const initBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        assert.equal(initBody["model"], "MiMo-X-Pro-Preview");
        return new Response(
          JSON.stringify({
            id: "upstream-cmpl-1",
            object: "chat.completion",
            created: 1758234500,
            model: "MiMo-X-Pro-Preview",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Code response" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const pool = new AccountPoolManager();
      pool.addAccount("mock_refresh", "mock_access", Date.now() + 3600_000);

      const handler = new CompletionProxyHandler({
        pool,
        upstreamBaseUrl: "https://api.xiaomimimo.com/v1",
      });

      const request: ChatCompletionRequest = {
        model: "mimo-x-pro",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      };

      const result = await handler.handleCompletion(request);
      assert.equal(result.status, 200);
      assert.equal(result.isStream, false);
      assert.ok(result.jsonResponse !== undefined);
      assert.equal(result.jsonResponse.model, "mimo-x-pro"); // normalized back to requested model
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries with next account when receiving 429 quota exhaustion", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          // First account hits 429
          return new Response(
            JSON.stringify({ error: { message: "Daily free limit reached" } }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        // Second account succeeds
        return new Response(
          JSON.stringify({
            id: "cmpl-ok",
            choices: [{ message: { role: "assistant", content: "Success from acc 2" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const pool = new AccountPoolManager();
      pool.addAccount("acc1_ref", "acc1_acc", Date.now() + 3600_000);
      pool.addAccount("acc2_ref", "acc2_acc", Date.now() + 3600_000);

      const handler = new CompletionProxyHandler({
        pool,
        upstreamBaseUrl: "https://api.xiaomimimo.com/v1",
      });

      const request: ChatCompletionRequest = {
        model: "mimo-x-pro",
        messages: [{ role: "user", content: "Test failover" }],
        stream: false,
      };

      const result = await handler.handleCompletion(request);
      assert.equal(result.status, 200);
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
