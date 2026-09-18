import http from "node:http";
import type { ServerConfig } from "../types/config.js";
import { RequestDispatcher } from "./routes.js";
import type { AccountPoolManager } from "../auth/pool-manager.js";

export interface RunningServer {
  readonly server: http.Server;
  readonly url: string;
  readonly stop: () => Promise<void>;
}

/**
 * Creates and starts the local HTTP daemon
 */
export async function startHttpServer(
  config: ServerConfig,
  pool: AccountPoolManager
): Promise<RunningServer> {
  const dispatcher = new RequestDispatcher(config, pool);

  const server = http.createServer(async (req, res) => {
    try {
      await dispatcher.dispatch(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
              type: "internal_error",
            },
          })
        );
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      resolve();
    });
  });

  const url = `http://${config.host}:${config.port}`;

  const stop = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    server,
    url,
    stop,
  };
}
