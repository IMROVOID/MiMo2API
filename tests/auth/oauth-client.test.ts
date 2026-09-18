import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTokenExpired, refreshXiaomiOAuthToken } from "../../src/auth/oauth-client.js";

describe("oauth-client", () => {
  it("detects expired or near-expired tokens", () => {
    const now = Date.now();
    // expired 1 second ago
    assert.equal(isTokenExpired(now - 1000), true);
    // expires in 100 seconds (< 300s buffer)
    assert.equal(isTokenExpired(now + 100_000), true);
    // expires in 1 hour (> 300s buffer)
    assert.equal(isTokenExpired(now + 3600_000), false);
    // undefined expiresAt is treated as expired
    assert.equal(isTokenExpired(undefined), true);
  });

  it("handles successful token refresh with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            access_token: "new_refreshed_access",
            refresh_token: "new_refreshed_refresh",
            expires_in: 7200,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const res = await refreshXiaomiOAuthToken({
        refreshToken: "test_refresh_123",
        tokenEndpoint: "https://account.xiaomi.com/oauth2/token",
      });

      assert.equal(res.success, true);
      assert.equal(res.accessToken, "new_refreshed_access");
      assert.equal(res.refreshToken, "new_refreshed_refresh");
      assert.equal(res.expiresIn, 7200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles refresh error from upstream", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token is invalid or expired",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );

      const res = await refreshXiaomiOAuthToken({
        refreshToken: "bad_refresh",
        tokenEndpoint: "https://account.xiaomi.com/oauth2/token",
      });

      assert.equal(res.success, false);
      assert.ok(res.error?.includes("Refresh token is invalid or expired") || res.error?.includes("invalid_grant"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
