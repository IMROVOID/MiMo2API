#!/usr/bin/env node
import { findAuthJsonPath, readAuthJson, getXiaomiCredentials } from "../auth/token-store.js";
import { AccountPoolManager } from "../auth/pool-manager.js";
import { startHttpServer } from "../server/http-server.js";
import type { ServerConfig } from "../types/config.js";

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else if (!result["command"]) {
      result["command"] = arg;
    }
  }
  return result;
}

async function runCheck(customPath?: string): Promise<void> {
  console.log("\n[MiMo2API] Checking local MiMo Desktop authentication...");
  const authPath = await findAuthJsonPath(customPath);

  if (authPath === null) {
    console.error("❌ No auth.json file found in candidate locations.");
    console.error("   Make sure Xiaomi MiMo Desktop is installed and logged in, or pass --auth-path <file>");
    process.exit(1);
  }

  console.log(`✓ Found configuration: ${authPath}`);
  const authData = await readAuthJson(authPath);
  if (authData === null) {
    console.error("❌ Failed to parse auth.json as JSON.");
    process.exit(1);
  }

  const creds = getXiaomiCredentials(authData);
  if (creds === null) {
    console.error("❌ No 'xiaomi' provider credentials found inside auth.json.");
    process.exit(1);
  }

  if (creds.type === "oauth") {
    console.log("✓ Found Xiaomi OAuth credentials:");
    console.log(`  - Access Token: ${creds.access_token.slice(0, 8)}... (${creds.access_token.length} chars)`);
    console.log(`  - Refresh Token: ${creds.refresh_token.slice(0, 8)}... (${creds.refresh_token.length} chars)`);
    if (creds.expires_at) {
      console.log(`  - Expires: ${new Date(creds.expires_at).toISOString()}`);
    }
  } else {
    console.log("✓ Found Xiaomi API key credentials.");
  }
  console.log("🎉 Local authentication check passed!\n");
}

async function runStart(flags: Record<string, string | boolean>): Promise<void> {
  const port = parseInt(String(flags["port"] ?? process.env["PORT"] ?? "20128"), 10);
  const host = String(flags["host"] ?? process.env["HOST"] ?? "127.0.0.1");
  const apiKey = flags["key"] ? String(flags["key"]) : process.env["API_KEY"];
  const customAuthPath = flags["auth-path"] ? String(flags["auth-path"]) : undefined;

  const pool = new AccountPoolManager();

  // Check if MIMO_REFRESH_TOKEN env var is set (supports multi-account)
  const envTokens = process.env["MIMO_REFRESH_TOKEN"];
  if (envTokens !== undefined && envTokens.trim() !== "") {
    pool.initFromTokenList(envTokens);
    console.log(`[MiMo2API] Loaded ${pool.getStats().total} accounts from MIMO_REFRESH_TOKEN env`);
  } else {
    // Read from local auth.json
    const authPath = await findAuthJsonPath(customAuthPath);
    if (authPath !== null) {
      const authData = await readAuthJson(authPath);
      if (authData !== null) {
        const creds = getXiaomiCredentials(authData);
        if (creds?.type === "oauth") {
          pool.addAccount(creds.refresh_token, creds.access_token, creds.expires_at);
          console.log(`[MiMo2API] Loaded credentials from ${authPath}`);
        }
      }
    }
  }

  if (pool.getStats().total === 0) {
    console.warn("⚠️ Warning: No MiMo accounts detected. Router will start in degraded mode.");
    console.warn("   Run 'mimo2api check' or provide MIMO_REFRESH_TOKEN to configure tokens.");
  }

  const config: ServerConfig = {
    port,
    host,
    apiKey,
    upstreamBaseUrl: process.env["UPSTREAM_BASE_URL"] ?? "https://api.xiaomimimo.com/v1",
    oauthTokenUrl: process.env["OAUTH_TOKEN_URL"] ?? "https://account.xiaomi.com/oauth2/token",
  };

  const { url } = await startHttpServer(config, pool);

  console.log("\n========================================================");
  console.log("🚀 MiMo2API Router is running!");
  console.log(`   Local URL:    ${url}/v1`);
  console.log(`   Health Check: ${url}/v1/health`);
  console.log(`   Models:       ${url}/v1/models`);
  if (apiKey) {
    console.log(`   API Key Auth: Enabled (Bearer ${apiKey})`);
  } else {
    console.log("   API Key Auth: Disabled (Open access)");
  }
  console.log("--------------------------------------------------------");
  console.log("💡 Supported Models for Cursor / Claude Code / Cline:");
  console.log("   - mimo-x-pro    (MiMo-X-Pro-Preview, High Reasoning)");
  console.log("   - mimo-x-flash  (MiMo-X-Flash-Preview, Fast Coding)");
  console.log("   - mimo-v2.5-pro (MiMo-V2.5 Base Model)");
  console.log("========================================================\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = parseArgs(args);
  const command = String(flags["command"] ?? "start");

  if (command === "check") {
    await runCheck(flags["auth-path"] ? String(flags["auth-path"]) : undefined);
  } else if (command === "start") {
    await runStart(flags);
  } else {
    console.log(`MiMo2API CLI v1.0.0
Usage:
  mimo2api start [--port 20128] [--host 127.0.0.1] [--key <apiKey>] [--auth-path <path>]
  mimo2api check [--auth-path <path>]
`);
  }
}

main().catch((err) => {
  console.error("[MiMo2API] Fatal error:", err);
  process.exit(1);
});
