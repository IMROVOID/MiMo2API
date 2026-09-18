import esbuild from "esbuild";
import fs from "node:fs/promises";

async function build(): Promise<void> {
  console.log("[MiMo2API] Starting build...");

  await fs.mkdir("dist", { recursive: true });
  await fs.mkdir("worker", { recursive: true });

  // 1. Build CLI executable for Node.js
  console.log("[MiMo2API] Bundling CLI daemon (dist/cli.js)...");
  await esbuild.build({
    entryPoints: ["src/cli/index.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: "dist/cli.js",
    sourcemap: true,
  });

  // 2. Build standalone zero-dependency Cloudflare Worker (worker/worker.js)
  console.log("[MiMo2API] Bundling standalone Cloudflare Worker (worker/worker.js)...");
  await esbuild.build({
    entryPoints: ["src/worker/index.ts"],
    bundle: true,
    platform: "neutral",
    target: "es2022",
    format: "esm",
    outfile: "worker/worker.js",
    minify: false,
    sourcemap: false,
  });

  const workerStats = await fs.stat("worker/worker.js");
  const cliStats = await fs.stat("dist/cli.js");

  console.log(`✓ CLI bundled: dist/cli.js (${(cliStats.size / 1024).toFixed(1)} KB)`);
  console.log(`✓ Worker bundled: worker/worker.js (${(workerStats.size / 1024).toFixed(1)} KB)`);
  console.log("[MiMo2API] Build completed successfully!\n");
}

build().catch((err) => {
  console.error("[MiMo2API] Build failed:", err);
  process.exit(1);
});
