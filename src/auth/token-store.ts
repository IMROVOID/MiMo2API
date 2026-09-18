import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { MimoAuthFile, XiaomiCredentials } from "../types/auth.js";

/**
 * Common default paths where MiMo Desktop / CLI persists auth.json
 */
export function getDefaultAuthPaths(): readonly string[] {
  const home = os.homedir();
  const localAppData = process.env["LOCALAPPDATA"] ?? path.join(home, "AppData", "Local");
  const mimoHome = process.env["MIMOCODE_HOME"];

  const candidatePaths: string[] = [];

  if (mimoHome !== undefined && mimoHome.trim() !== "") {
    candidatePaths.push(path.join(mimoHome, "auth.json"));
    candidatePaths.push(path.join(mimoHome, "data", "auth.json"));
  }

  // Windows candidate locations
  candidatePaths.push(path.join(localAppData, "mimocode", "data", "auth.json"));
  candidatePaths.push(path.join(localAppData, "mimocode", "auth.json"));

  // Linux & macOS candidate locations
  candidatePaths.push(path.join(home, ".local", "share", "mimocode", "auth.json"));
  candidatePaths.push(path.join(home, ".mimocode", "auth.json"));

  return candidatePaths;
}

/**
 * Searches for an existing auth.json file across candidate paths
 */
export async function findAuthJsonPath(customPath?: string): Promise<string | null> {
  if (customPath !== undefined && customPath.trim() !== "") {
    try {
      await fs.access(customPath);
      return customPath;
    } catch {
      return null;
    }
  }

  const paths = getDefaultAuthPaths();
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue searching next candidate
    }
  }

  return null;
}

/**
 * Reads and parses the auth.json file
 */
export async function readAuthJson(filePath: string): Promise<MimoAuthFile | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as MimoAuthFile;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts Xiaomi credentials from the parsed auth structure
 */
export function getXiaomiCredentials(authData: MimoAuthFile): XiaomiCredentials | null {
  const xiaomi = authData.xiaomi;
  if (xiaomi === undefined || xiaomi === null) {
    return null;
  }

  if (typeof xiaomi !== "object") {
    return null;
  }

  if (xiaomi.type === "oauth" && typeof xiaomi.access_token === "string") {
    return xiaomi;
  }

  if (xiaomi.type === "api" && typeof xiaomi.key === "string") {
    return xiaomi;
  }

  return null;
}

/**
 * Safely updates access and refresh tokens in auth.json
 */
export async function updateXiaomiTokens(
  filePath: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<boolean> {
  try {
    const current = (await readAuthJson(filePath)) ?? {};
    const existingXiaomi = current.xiaomi;
    const existingRefreshToken =
      existingXiaomi !== undefined && existingXiaomi.type === "oauth"
        ? existingXiaomi.refresh_token
        : "";

    const finalRefreshToken = refreshToken ?? existingRefreshToken;

    const updatedXiaomi: XiaomiCredentials = {
      type: "oauth",
      access_token: accessToken,
      refresh_token: finalRefreshToken,
      ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    };

    const updatedData: MimoAuthFile = {
      ...current,
      xiaomi: updatedXiaomi,
    };

    const serialized = JSON.stringify(updatedData, null, 2);
    // Write via atomic rename pattern
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, serialized, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tmpPath, filePath);

    return true;
  } catch {
    return false;
  }
}
