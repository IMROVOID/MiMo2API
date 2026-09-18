/**
 * Server and runtime configuration types
 */

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly apiKey?: string | undefined;
  readonly authJsonPath?: string | undefined;
  readonly upstreamBaseUrl: string;
  readonly oauthTokenUrl: string;
}

export interface WorkerEnv {
  readonly MIMO_REFRESH_TOKEN?: string | undefined;
  readonly API_KEY?: string | undefined;
  readonly UPSTREAM_BASE_URL?: string | undefined;
  readonly OAUTH_TOKEN_URL?: string | undefined;
}

export interface HealthStatusResponse {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly version: string;
  readonly mode: "local-daemon" | "cloudflare-worker";
  readonly api_key_configured: boolean;
  readonly account_count: number;
  readonly active_accounts: number;
  readonly cooldown_accounts: number;
  readonly supported_models: readonly string[];
}
