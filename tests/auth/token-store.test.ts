import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  readAuthJson,
  getXiaomiCredentials,
  updateXiaomiTokens,
} from "../../src/auth/token-store.js";
import type { MimoAuthFile } from "../../src/types/auth.js";

describe("token-store", () => {
  it("extracts oauth credentials from valid auth structure", () => {
    const authData: MimoAuthFile = {
      xiaomi: {
        type: "oauth",
        access_token: "test_access_token_123",
        refresh_token: "test_refresh_token_456",
        expires_at: 1750000000000,
      },
    };

    const creds = getXiaomiCredentials(authData);
    assert.ok(creds !== null);
    assert.equal(creds.type, "oauth");
    if (creds.type === "oauth") {
      assert.equal(creds.access_token, "test_access_token_123");
      assert.equal(creds.refresh_token, "test_refresh_token_456");
    }
  });

  it("extracts api credentials from valid auth structure", () => {
    const authData: MimoAuthFile = {
      xiaomi: {
        type: "api",
        key: "sk-test-key",
      },
    };

    const creds = getXiaomiCredentials(authData);
    assert.ok(creds !== null);
    assert.equal(creds.type, "api");
    if (creds.type === "api") {
      assert.equal(creds.key, "sk-test-key");
    }
  });

  it("returns null when xiaomi credentials are missing", () => {
    const authData: MimoAuthFile = {};
    assert.equal(getXiaomiCredentials(authData), null);
  });

  it("reads and updates tokens in a temporary file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mimo2api-test-"));
    const tmpFile = path.join(tmpDir, "auth.json");

    try {
      const initial: MimoAuthFile = {
        xiaomi: {
          type: "oauth",
          access_token: "old_access",
          refresh_token: "old_refresh",
          expires_at: 1000,
        },
      };
      await fs.writeFile(tmpFile, JSON.stringify(initial, null, 2), "utf-8");

      const readBack = await readAuthJson(tmpFile);
      assert.ok(readBack !== null);
      assert.equal(readBack.xiaomi?.type, "oauth");

      const updated = await updateXiaomiTokens(tmpFile, "new_access", "new_refresh", 2000);
      assert.equal(updated, true);

      const readUpdated = await readAuthJson(tmpFile);
      assert.ok(readUpdated !== null);
      const creds = getXiaomiCredentials(readUpdated);
      assert.ok(creds !== null && creds.type === "oauth");
      if (creds.type === "oauth") {
        assert.equal(creds.access_token, "new_access");
        assert.equal(creds.refresh_token, "new_refresh");
        assert.equal(creds.expires_at, 2000);
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
