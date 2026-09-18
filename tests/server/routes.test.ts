import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { RequestDispatcher } from "../../src/server/routes.js";
import { AccountPoolManager } from "../../src/auth/pool-manager.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerConfig } from "../../src/types/config.js";

function createMockReqRes(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = options.method;
  req.url = options.url;
  req.headers = options.headers ?? {};

  let statusCode = 200;
  const headersWritten: Record<string, string> = {};
  let bodyWritten = "";

  const res = {
    setHeader(key: string, val: string) {
      headersWritten[key.toLowerCase()] = val;
    },
    writeHead(code: number, headers?: Record<string, string>) {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          headersWritten[k.toLowerCase()] = v;
        }
      }
    },
    end(chunk?: string) {
      if (chunk) bodyWritten += chunk;
    },
    write(chunk: unknown) {
      bodyWritten += String(chunk);
    },
  } as unknown as ServerResponse;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getBody: () => bodyWritten,
    getHeaders: () => headersWritten,
  };
}

describe("server-routes", () => {
  const config: ServerConfig = {
    port: 20128,
    host: "127.0.0.1",
    apiKey: "test-secret-key",
    upstreamBaseUrl: "https://api.xiaomimimo.com/v1",
    oauthTokenUrl: "https://account.xiaomi.com/oauth2/token",
  };

  it("handles OPTIONS preflight with CORS headers", async () => {
    const pool = new AccountPoolManager();
    const dispatcher = new RequestDispatcher(config, pool);
    const mock = createMockReqRes({ method: "OPTIONS", url: "/v1/models" });

    await dispatcher.dispatch(mock.req, mock.res);
    assert.equal(mock.getStatusCode(), 204);
    assert.equal(mock.getHeaders()["access-control-allow-origin"], "*");
  });

  it("rejects unauthorized requests when API key is required", async () => {
    const pool = new AccountPoolManager();
    const dispatcher = new RequestDispatcher(config, pool);
    const mock = createMockReqRes({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer wrong-key" },
    });

    await dispatcher.dispatch(mock.req, mock.res);
    assert.equal(mock.getStatusCode(), 401);
  });

  it("serves /v1/health successfully with valid API key", async () => {
    const pool = new AccountPoolManager();
    const dispatcher = new RequestDispatcher(config, pool);
    const mock = createMockReqRes({
      method: "GET",
      url: "/v1/health",
      headers: { authorization: "Bearer test-secret-key" },
    });

    await dispatcher.dispatch(mock.req, mock.res);
    assert.equal(mock.getStatusCode(), 200);

    const body = JSON.parse(mock.getBody()) as Record<string, unknown>;
    assert.equal(body["mode"], "local-daemon");
    assert.equal(body["version"], "1.0.0");
  });

  it("serves /v1/models list", async () => {
    const pool = new AccountPoolManager();
    const dispatcher = new RequestDispatcher(config, pool);
    const mock = createMockReqRes({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer test-secret-key" },
    });

    await dispatcher.dispatch(mock.req, mock.res);
    assert.equal(mock.getStatusCode(), 200);

    const body = JSON.parse(mock.getBody()) as { object: string; data: unknown[] };
    assert.equal(body.object, "list");
    assert.ok(body.data.length >= 4);
  });
});
