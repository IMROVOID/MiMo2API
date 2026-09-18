import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AccountPoolManager, parseCooldownDuration } from "../../src/auth/pool-manager.js";

describe("pool-manager", () => {
  it("parses retry duration from Retry-After header in seconds", () => {
    assert.equal(parseCooldownDuration("120", null), 120_000);
  });

  it("parses retry duration from text like 'Try again in 2h 30m'", () => {
    const duration = parseCooldownDuration(null, "Rate limited. Try again in 2h 30m.");
    // 2 * 3600 + 30 * 60 = 9000 seconds = 9,000,000 ms
    assert.equal(duration, 9_000_000);
  });

  it("falls back to default cooldown for general quota exhaustion", () => {
    const duration = parseCooldownDuration(null, "Daily free limit reached");
    assert.equal(duration, 3_600_000); // default 1 hour
  });

  it("initializes accounts from newline-delimited token string", () => {
    const manager = new AccountPoolManager();
    manager.initFromTokenList("token_a\ntoken_b\n\ntoken_c\n");

    const stats = manager.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.active, 3);
    assert.equal(stats.inCooldown, 0);
  });

  it("rotates accounts in round-robin order", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ access_token: "mock_acc", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const manager = new AccountPoolManager();
      manager.initFromTokenList("acc1_ref\nacc2_ref");

      const first = await manager.getNextAvailableAccount();
      assert.ok(first !== null);
      assert.equal(first.refreshToken, "acc1_ref");

      const second = await manager.getNextAvailableAccount();
      assert.ok(second !== null);
      assert.equal(second.refreshToken, "acc2_ref");

      const third = await manager.getNextAvailableAccount();
      assert.ok(third !== null);
      assert.equal(third.refreshToken, "acc1_ref");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("skips accounts in cooldown and switches to next", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ access_token: "mock_acc", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const manager = new AccountPoolManager();
      manager.initFromTokenList("acc1\nacc2");

      const first = await manager.getNextAvailableAccount();
      assert.ok(first !== null);
      assert.equal(first.refreshToken, "acc1");

      // Mark acc1 in cooldown for 60 seconds
      manager.markCooldown(first.id, 60_000, "429 Rate Limit");

      const second = await manager.getNextAvailableAccount();
      assert.ok(second !== null);
      assert.equal(second.refreshToken, "acc2");

      // Next call should still return acc2 because acc1 is in cooldown
      const third = await manager.getNextAvailableAccount();
      assert.ok(third !== null);
      assert.equal(third.refreshToken, "acc2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null when all accounts are in cooldown", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ access_token: "mock_acc", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const manager = new AccountPoolManager();
      manager.initFromTokenList("only_one");
      const acc = await manager.getNextAvailableAccount();
      assert.ok(acc !== null);

      manager.markCooldown(acc.id, 60_000);
      const none = await manager.getNextAvailableAccount();
      assert.equal(none, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
