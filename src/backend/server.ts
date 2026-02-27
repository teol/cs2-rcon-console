import Fastify, { FastifyInstance } from "fastify";
import fastifyWebsocket, { SocketStream } from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { RconClient } from "./rcon.js";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "3000", 10);

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
  });

  // Register WebSocket support
  await server.register(fastifyWebsocket);

  // Serve static files (production build of frontend)
  try {
    await server.register(fastifyStatic, {
      root: path.resolve(__dirname, "../../dist"),
      prefix: "/",
    });
  } catch (e) {
    server.log.warn(
      "Static file serving not enabled (dist folder might be missing)",
    );
  }

  server.get("/", { websocket: true }, (connection, req) => {
    let rcon: RconClient | null = null;
    const { socket } = connection as unknown as SocketStream;

    server.log.info("[WS] New client connected");

    socket.on("message", async (raw: any) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return socket.send(
          JSON.stringify({ type: "error", message: "Invalid JSON" }),
        );
      }

      switch (msg.type) {
        case "connect": {
          const { host, port, password } = msg;

          if (!host || !port || !password) {
            return socket.send(
              JSON.stringify({
                type: "error",
                message: "Missing host, port, or password",
              }),
            );
          }

          if (rcon) {
            rcon.disconnect();
          }

          rcon = new RconClient();

          rcon.on("disconnect", () => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ type: "disconnected" }));
            }
          });

          rcon.on("error", (err: Error) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "error",
                  message: err.message,
                }),
              );
            }
          });

          try {
            await rcon.connect(host, parseInt(port, 10), password);
            socket.send(
              JSON.stringify({
                type: "connected",
                message: `Connected to ${host}:${port}`,
              }),
            );
            server.log.info(`[RCON] Connected to ${host}:${port}`);
          } catch (err: any) {
            socket.send(
              JSON.stringify({
                type: "error",
                message: `Connection failed: ${err.message}`,
              }),
            );
            rcon = null;
          }
          break;
        }

        case "command": {
          const { command } = msg;

          if (!rcon || !rcon.isConnected) {
            return socket.send(
              JSON.stringify({
                type: "error",
                message: "Not connected to any server",
              }),
            );
          }

          if (!command || typeof command !== "string") {
            return socket.send(
              JSON.stringify({
                type: "error",
                message: "No command provided",
              }),
            );
          }

          try {
            const response = await rcon.execute(command.trim());
            socket.send(
              JSON.stringify({
                type: "response",
                command: command.trim(),
                body: response || "(no response)",
              }),
            );
            server.log.info(`[RCON] > ${command.trim()}`);
          } catch (err: any) {
            socket.send(
              JSON.stringify({
                type: "error",
                message: `Command failed: ${err.message}`,
              }),
            );
          }
          break;
        }

        case "disconnect": {
          if (rcon) {
            rcon.disconnect();
            rcon = null;
          }
          socket.send(JSON.stringify({ type: "disconnected" }));
          break;
        }

        default:
          socket.send(
            JSON.stringify({
              type: "error",
              message: `Unknown message type: ${msg.type}`,
            }),
          );
      }
    });

    socket.on("close", () => {
      server.log.info("[WS] Client disconnected");
      if (rcon) {
        rcon.disconnect();
        rcon = null;
      }
    });
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await createServer();
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server listening at http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
