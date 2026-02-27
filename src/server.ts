import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import { RconClient } from "./rcon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

/** JSON messages sent from the browser to the server. */
export interface ClientMessage {
  type: "connect" | "command" | "disconnect";
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
  | { type: "error"; message: string };

export function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

/** Create and configure the Fastify app (without starting it). */
export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
  });

  await app.register(fastifyWebSocket);

  app.get("/ws", { websocket: true }, (socket) => {
    let rcon: RconClient | null = null;

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
          }
          send(socket, { type: "disconnected" });
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
