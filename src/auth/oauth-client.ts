import type { TokenRefreshResult } from "../types/auth.js";

export const DEFAULT_XIAOMI_OAUTH_TOKEN_URL = "https://account.xiaomi.com/oauth2/token";
export const DEFAULT_MIMO_CLIENT_ID = "mimocode-desktop";

export interface RefreshTokenOptions {
  readonly refreshToken: string;
  readonly clientId?: string | undefined;
  readonly clientSecret?: string | undefined;
  readonly tokenEndpoint?: string | undefined;
}

/**
 * Checks if a token is expired or approaching expiration (< 300 seconds buffer)
 */
export function isTokenExpired(expiresAt: number | undefined, bufferSeconds = 300): boolean {
  if (expiresAt === undefined || expiresAt <= 0) {
    return true;
  }
  const now = Date.now();
  const bufferMs = bufferSeconds * 1000;
  return expiresAt - bufferMs <= now;
}

/**
 * Executes OAuth 2.0 refresh token grant against Xiaomi token endpoint
 */
export async function refreshXiaomiOAuthToken(
  options: RefreshTokenOptions
): Promise<TokenRefreshResult> {
  const {
    refreshToken,
    clientId = DEFAULT_MIMO_CLIENT_ID,
    clientSecret,
    tokenEndpoint = DEFAULT_XIAOMI_OAUTH_TOKEN_URL,
  } = options;

  if (refreshToken.trim() === "") {
    return {
      success: false,
      error: "Refresh token is empty",
    };
  }

  try {
    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", refreshToken);
    params.set("client_id", clientId);
    if (clientSecret !== undefined && clientSecret !== "") {
      params.set("client_secret", clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const responseText = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        error: `Invalid JSON response from token endpoint (${response.status}): ${responseText.slice(0, 150)}`,
      };
    }

    if (!response.ok) {
      const errorDesc =
        (typeof body["error_description"] === "string" ? body["error_description"] : null) ??
        (typeof body["error"] === "string" ? body["error"] : null) ??
        `HTTP ${response.status}`;
      return {
        success: false,
        error: errorDesc,
      };
    }

    const accessToken = typeof body["access_token"] === "string" ? body["access_token"] : undefined;
    const newRefreshToken =
      typeof body["refresh_token"] === "string" ? body["refresh_token"] : refreshToken;
    const expiresIn = typeof body["expires_in"] === "number" ? body["expires_in"] : 7200;

    if (accessToken === undefined || accessToken.trim() === "") {
      return {
        success: false,
        error: "Missing access_token in token endpoint response",
      };
    }

    return {
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network failure refreshing token: ${message}`,
    };
  }
}
