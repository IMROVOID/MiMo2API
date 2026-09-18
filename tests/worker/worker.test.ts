import { describe, it } from "node:test";
import assert from "node:assert/strict";
import worker from "../../src/worker/index.js";
import type { WorkerEnv } from "../../src/types/config.js";

describe("cloudflare-worker", () => {
  const env: WorkerEnv = {
    API_KEY: "secret-token",
    MIMO_REFRESH_TOKEN: "mock_token_1\nmock_token_2",
  };

  it("handles OPTIONS preflight", async () => {
    const req = new Request("https://mimo2api.workers.dev/v1/models", {
      method: "OPTIONS",
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  it("rejects invalid API key", async () => {
    const req = new Request("https://mimo2api.workers.dev/v1/health", {
      headers: { Authorization: "Bearer wrong" },
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
  });

  it("serves /v1/health with pool stats", async () => {
    const req = new Request("https://mimo2api.workers.dev/v1/health", {
      headers: { Authorization: "Bearer secret-token" },
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);

    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["mode"], "cloudflare-worker");
    assert.equal(body["account_count"], 2);
    assert.equal(body["api_key_configured"], true);
  });

  it("serves /v1/models", async () => {
    const req = new Request("https://mimo2api.workers.dev/v1/models", {
      headers: { Authorization: "Bearer secret-token" },
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);

    const body = (await res.json()) as { object: string; data: unknown[] };
    assert.equal(body.object, "list");
    assert.ok(body.data.length >= 4);
  });

  it("returns 404 for unknown paths", async () => {
    const req = new Request("https://mimo2api.workers.dev/unknown/endpoint", {
      headers: { Authorization: "Bearer secret-token" },
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 404);
  });
});
