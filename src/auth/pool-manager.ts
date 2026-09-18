import type { AccountState } from "../types/auth.js";
import { isTokenExpired, refreshXiaomiOAuthToken } from "./oauth-client.js";

const DEFAULT_COOLDOWN_MS = 3_600_000; // 1 hour

/**
 * Extracts cooldown duration in milliseconds from HTTP response headers or body
 */
export function parseCooldownDuration(
  retryAfterHeader?: string | null,
  bodyText?: string | null
): number {
  if (retryAfterHeader !== null && retryAfterHeader !== undefined && retryAfterHeader.trim() !== "") {
    const seconds = parseInt(retryAfterHeader.trim(), 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  if (bodyText !== null && bodyText !== undefined) {
    // Check for "Try again in Xh Ym" or similar patterns
    const timeMatch = /try again in (?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i.exec(bodyText);
    if (timeMatch !== null) {
      const hours = parseInt(timeMatch[1] ?? "0", 10);
      const minutes = parseInt(timeMatch[2] ?? "0", 10);
      const seconds = parseInt(timeMatch[3] ?? "0", 10);
      const totalSec = hours * 3600 + minutes * 60 + seconds;
      if (totalSec > 0) {
        return totalSec * 1000;
      }
    }
  }

  return DEFAULT_COOLDOWN_MS;
}

export interface PoolStats {
  readonly total: number;
  readonly active: number;
  readonly inCooldown: number;
}

/**
 * Manages an in-memory pool of accounts with round-robin rotation and cooldown backoff
 */
export class AccountPoolManager {
  private accounts: AccountState[] = [];
  private currentIndex = 0;
  private tokenEndpoint?: string | undefined;

  constructor(tokenEndpoint?: string | undefined) {
    this.tokenEndpoint = tokenEndpoint;
  }

  public initFromTokenList(tokensInput: string): void {
    const lines = tokensInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    this.accounts = lines.map((token, index) => ({
      id: `acc_${index + 1}`,
      refreshToken: token,
      accessToken: null,
      expiresAt: 0,
      cooldownUntil: 0,
      failureCount: 0,
      lastUsedAt: 0,
    }));
    this.currentIndex = 0;
  }

  public addAccount(refreshToken: string, initialAccessToken?: string, expiresAt?: number): void {
    const id = `acc_${this.accounts.length + 1}`;
    this.accounts.push({
      id,
      refreshToken,
      accessToken: initialAccessToken ?? null,
      expiresAt: expiresAt ?? 0,
      cooldownUntil: 0,
      failureCount: 0,
      lastUsedAt: 0,
    });
  }

  public markCooldown(accountId: string, durationMs: number, reason?: string): void {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account !== undefined) {
      account.cooldownUntil = Date.now() + durationMs;
      account.failureCount += 1;
      if (reason !== undefined && reason.trim() !== "") {
        console.warn(
          `[MiMo2API] Account ${accountId} entered cooldown (${Math.round(durationMs / 1000)}s): ${reason}`
        );
      }
    }
  }

  public async getNextAvailableAccount(): Promise<AccountState | null> {
    const total = this.accounts.length;
    if (total === 0) {
      return null;
    }

    const now = Date.now();
    for (let i = 0; i < total; i++) {
      const idx = (this.currentIndex + i) % total;
      const candidate = this.accounts[idx];
      if (candidate === undefined) {
        continue;
      }

      if (now < candidate.cooldownUntil) {
        continue;
      }

      // Check if access token needs refresh
      if (candidate.accessToken === null || isTokenExpired(candidate.expiresAt)) {
        const refreshResult = await refreshXiaomiOAuthToken({
          refreshToken: candidate.refreshToken,
          tokenEndpoint: this.tokenEndpoint,
        });

        if (refreshResult.success && refreshResult.accessToken !== undefined) {
          candidate.accessToken = refreshResult.accessToken;
          const expiresIn = refreshResult.expiresIn ?? 7200;
          candidate.expiresAt = now + expiresIn * 1000;
          candidate.failureCount = 0;
        } else {
          // Token refresh failed, put account on short cooldown and try next
          this.markCooldown(candidate.id, 60_000, refreshResult.error);
          continue;
        }
      }

      this.currentIndex = (idx + 1) % total;
      candidate.lastUsedAt = now;
      return candidate;
    }

    return null;
  }

  public getStats(): PoolStats {
    const now = Date.now();
    let active = 0;
    let inCooldown = 0;

    for (const account of this.accounts) {
      if (now < account.cooldownUntil) {
        inCooldown++;
      } else {
        active++;
      }
    }

    return {
      total: this.accounts.length,
      active,
      inCooldown,
    };
  }
}
