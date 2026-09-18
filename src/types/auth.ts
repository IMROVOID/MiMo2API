/**
 * Authentication and credential types for MiMo2API
 */

export interface XiaomiOAuthCredentials {
  readonly type: "oauth";
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at?: number;
  readonly scope?: string;
  readonly token_type?: string;
}

export interface XiaomiApiCredentials {
  readonly type: "api";
  readonly key: string;
  readonly base_url?: string;
}

export type XiaomiCredentials = XiaomiOAuthCredentials | XiaomiApiCredentials;

export interface MimoAuthFile {
  readonly xiaomi?: XiaomiCredentials;
  readonly [provider: string]: unknown;
}

export interface AccountState {
  readonly id: string;
  readonly refreshToken: string;
  accessToken: string | null;
  expiresAt: number;
  cooldownUntil: number;
  failureCount: number;
  lastUsedAt: number;
}

export interface TokenRefreshResult {
  readonly success: boolean;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly expiresIn?: number;
  readonly error?: string;
}

export interface CooldownInfo {
  readonly isCoolingDown: boolean;
  readonly remainingSeconds: number;
  readonly reason?: string;
}
