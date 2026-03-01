import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import { RconClient } from "@cs2-rcon/rcon";
import { parseStatus, parseStats } from "./parsers.js";
import type { ServerInfo, PlayerInfo } from "./parsers.js";
import { queryA2SInfo } from "./a2s.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const SERVER_TYPE_MAP: Record<string, string> = {
  d: "dedicated",
  l: "listen",
  p: "proxy",
};

const ENV_MAP: Record<string, string> = {
  l: "Linux",
  w: "Windows",
  m: "Mac",
  o: "Mac",
};

/** JSON messages sent from the browser to the server. */
export interface ClientMessage {
  type: "connect" | "command" | "disconnect" | "request_status";
  host?: string;
  port?: string;
  password?: string;
  command?: string;
}

/** JSON messages sent from the server to the browser. */
export type ServerMessage =
  | { type: "connected"; message: string }
  | { type: "disconnected" }
  | { type: "response"; command: string; body: string }
  | { type: "error"; message: string }
  | { type: "server_status"; server: Partial<ServerInfo> }
  | { type: "player_list"; players: PlayerInfo[] };

export function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

/** Create and configure the Fastify app (without starting it). */
export async function buildApp() {
  const app = Fastify({ logger: false });

  // Serve the Vite-built renderer output
  const rendererDist = path.resolve(__dirname, "..", "..", "renderer", "dist");
  await app.register(fastifyStatic, {
    root: rendererDist,
  });

  await app.register(fastifyWebSocket);

  app.get("/ws", { websocket: true }, (socket) => {
    let rcon: RconClient | null = null;
    let rconHost: string | null = null;
    let rconPort: number | null = null;

    console.log("[WS] New client connected");

    socket.on("message", async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(socket, { type: "error", message: "Invalid JSON" });
      }

      switch (msg.type) {
        case "connect": {
          const { host, port, password } = msg;

          if (!host || !port || !password) {
            return send(socket, {
              type: "error",
              message: "Missing host, port, or password",
            });
          }

          // Disconnect previous connection if any
          if (rcon) {
            rcon.disconnect();
          }

          rcon = new RconClient();

          rcon.on("disconnect", () => {
            send(socket, { type: "disconnected" });
          });

          rcon.on("error", (err: Error) => {
            send(socket, { type: "error", message: err.message });
          });

          try {
            await rcon.connect(host, parseInt(port, 10), password);
            rconHost = host;
            rconPort = parseInt(port, 10);
            send(socket, {
              type: "connected",
              message: `Connected to ${host}:${port}`,
            });
            console.log(`[RCON] Connected to ${host}:${port}`);
          } catch (err) {
            send(socket, {
              type: "error",
              message: `Connection failed: ${(err as Error).message}`,
            });
            rcon = null;
            rconHost = null;
            rconPort = null;
          }
          break;
        }

        case "command": {
          const { command } = msg;

          if (!rcon || !rcon.isConnected) {
            return send(socket, {
              type: "error",
              message: "Not connected to any server",
            });
          }

          if (!command || typeof command !== "string") {
            return send(socket, {
              type: "error",
              message: "No command provided",
            });
          }

          try {
            const response = await rcon.execute(command.trim());
            send(socket, {
              type: "response",
              command: command.trim(),
              body: response || "(no response)",
            });
            console.log(`[RCON] > ${command.trim()}`);
          } catch (err) {
            send(socket, {
              type: "error",
              message: `Command failed: ${(err as Error).message}`,
            });
          }
          break;
        }

        case "disconnect": {
          if (rcon) {
            rcon.disconnect();
            rcon = null;
            rconHost = null;
            rconPort = null;
          }
          send(socket, { type: "disconnected" });
          break;
        }

        case "request_status": {
          if (!rcon || !rcon.isConnected) {
            return send(socket, {
              type: "error",
              message: "Not connected to any server",
            });
          }

          try {
            // Run A2S_INFO (UDP), RCON status (for player list), and
            // RCON stats (for FPS/CPU) in parallel.  A2S provides more
            // reliable static info; if it fails we fall back to RCON.
            const [a2sResult, statusResponse, statsResponse] = await Promise.allSettled([
              rconHost ? queryA2SInfo(rconHost, rconPort!, 3000) : Promise.reject("no host"),
              rcon.execute("status"),
              rcon.execute("stats"),
            ]);

            // Player list always comes from RCON status
            const statusValue = statusResponse.status === "fulfilled" ? statusResponse.value : "";
            const { server: rconServer, players } = parseStatus(statusValue || "");

            // FPS / CPU from RCON stats
            const statsValue = statsResponse.status === "fulfilled" ? statsResponse.value : "";
            const { fps, cpu } = parseStats(statsValue || "");

            // Prefer A2S for static server info, fall back to RCON status
            let serverInfo: Partial<ServerInfo>;
            if (a2sResult.status === "fulfilled") {
              const a2s = a2sResult.value;
              const serverTypeStr = SERVER_TYPE_MAP[a2s.serverType] ?? a2s.serverType;
              const envStr = ENV_MAP[a2s.environment] ?? a2s.environment;
              serverInfo = {
                hostname: a2s.hostname,
                map: a2s.map,
                players: a2s.players,
                maxPlayers: a2s.maxPlayers,
                bots: a2s.bots,
                version: a2s.version,
                type: `${serverTypeStr} (${envStr})`,
                secure: a2s.vac,
                fps,
                cpu,
              };
            } else {
              serverInfo = { ...rconServer, fps, cpu };
            }

            send(socket, {
              type: "server_status",
              server: serverInfo,
            });

            send(socket, {
              type: "player_list",
              players,
            });
          } catch (err) {
            send(socket, {
              type: "error",
              message: `Status request failed: ${(err as Error).message}`,
            });
          }
          break;
        }

        default:
          send(socket, {
            type: "error",
            message: `Unknown message type: ${(msg as ClientMessage).type}`,
          });
      }
    });

    socket.on("close", () => {
      console.log("[WS] Client disconnected");
      if (rcon) {
        rcon.disconnect();
        rcon = null;
        rconHost = null;
        rconPort = null;
      }
    });
  });

  return app;
}

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`CS2 Web RCON running on http://localhost:${PORT}`);
}

// Only auto-start when this file is the entry point (not when imported by tests).
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
