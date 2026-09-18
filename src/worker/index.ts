import type { WorkerEnv } from "../types/config.js";
import type { ChatCompletionRequest } from "../types/openai.js";
import { getModelList } from "../proxy/model-catalog.js";
import { CompletionProxyHandler } from "../proxy/completion-handler.js";
import { AccountPoolManager } from "../auth/pool-manager.js";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

// Global pool instance in worker memory across invocations within the same isolate
let globalPool: AccountPoolManager | null = null;
let lastTokenHash = "";

function getOrCreatePool(env: WorkerEnv): AccountPoolManager {
  const tokens = env.MIMO_REFRESH_TOKEN ?? "";
  if (globalPool === null || lastTokenHash !== tokens) {
    globalPool = new AccountPoolManager(env.OAUTH_TOKEN_URL);
    if (tokens.trim() !== "") {
      globalPool.initFromTokenList(tokens);
    }
    lastTokenHash = tokens;
  }
  return globalPool;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check optional API_KEY secret
    if (env.API_KEY !== undefined && env.API_KEY.trim() !== "") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.API_KEY}`) {
        return jsonResponse(
          {
            error: {
              message: "Invalid API key provided.",
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          },
          401
        );
      }
    }

    const pool = getOrCreatePool(env);

    // Route: GET /v1/health or /health or /
    if (request.method === "GET" && (pathname === "/v1/health" || pathname === "/health" || pathname === "/")) {
      const stats = pool.getStats();
      const isDegraded = stats.total > 0 && stats.active === 0;
      const isUnhealthy = stats.total === 0;

      return jsonResponse({
        status: isUnhealthy ? "unhealthy" : isDegraded ? "degraded" : "healthy",
        version: "1.0.0",
        mode: "cloudflare-worker",
        api_key_configured: env.API_KEY !== undefined && env.API_KEY.trim() !== "",
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
      });
    }

    // Route: GET /v1/models
    if (request.method === "GET" && pathname === "/v1/models") {
      return jsonResponse(getModelList());
    }

    // Route: POST /v1/chat/completions
    if (request.method === "POST" && pathname === "/v1/chat/completions") {
      let body: ChatCompletionRequest;
      try {
        body = (await request.json()) as ChatCompletionRequest;
      } catch {
        return jsonResponse(
          { error: { message: "Malformed JSON payload in request body.", type: "invalid_request_error" } },
          400
        );
      }

      if (!body.model || !Array.isArray(body.messages)) {
        return jsonResponse(
          { error: { message: "Missing required 'model' or 'messages' field.", type: "invalid_request_error" } },
          400
        );
      }

      const handler = new CompletionProxyHandler({
        pool,
        upstreamBaseUrl: env.UPSTREAM_BASE_URL,
      });

      const result = await handler.handleCompletion(body, request.signal);

      if (result.isStream && result.streamResponse !== undefined) {
        return new Response(result.streamResponse, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...CORS_HEADERS,
          },
        });
      }

      if (result.jsonResponse !== undefined) {
        return jsonResponse(result.jsonResponse, result.status);
      }

      return jsonResponse(result.errorResponse ?? {}, result.status);
    }

    // 404 Fallback
    return jsonResponse(
      {
        error: {
          message: `Unknown path: ${pathname}`,
          type: "invalid_request_error",
          code: "resource_not_found",
        },
      },
      404
    );
  },
};
