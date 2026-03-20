import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import { RconClient } from "@cs2-rcon/rcon";
import { parseStatus, parseStats } from "./parsers.js";
import type { ServerInfo, PlayerInfo } from "./parsers.js";
import { queryA2SInfo } from "./a2s.js";
import { LogReceiver } from "./log-receiver.js";
import type { LogMessage } from "./log-receiver.js";
import type { LogEvent } from "@cs2-rcon/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const LOG_PORT = process.env.LOG_PORT ? Number(process.env.LOG_PORT) : 0;

/** Only allow valid IP addresses or hostnames to prevent RCON command injection. */
const VALID_ADDRESS_RE = /^[a-zA-Z0-9]+([-.][a-zA-Z0-9]+)*$/;
const LOG_ADDRESS = (() => {
  const raw = process.env.LOG_ADDRESS || "";
  if (raw && !VALID_ADDRESS_RE.test(raw)) {
    console.error(
      `[LOG] Invalid LOG_ADDRESS "${raw}" — must be a valid IP or hostname. Log streaming disabled.`,
    );
    return "";
  }
  return raw;
})();

const IPV4_MAPPED_PREFIX = "::ffff:";

/**
 * Strip the IPv4-mapped IPv6 prefix so that `::ffff:192.168.1.1` and
 * `192.168.1.1` compare as equal.
 */
export function normalizeIp(ip: string): string {
  if (ip.startsWith(IPV4_MAPPED_PREFIX)) {
    return ip.slice(IPV4_MAPPED_PREFIX.length);
  }
  return ip;
}

/**
 * Resolve a hostname to its IP addresses so log source matching works
 * regardless of whether the user connected via hostname or IP.
 * Returns a Set of normalized IP strings.
 */
export async function resolveHostIps(host: string): Promise<Set<string>> {
  const ips = new Set<string>();
  // If the host already looks like an IP address, use it directly
  ips.add(normalizeIp(host));
  try {
    // dns.lookup returns the OS-resolved address (respects /etc/hosts)
    const { address } = await dns.lookup(host);
    ips.add(normalizeIp(address));
  } catch {
    // Resolution failed — the raw host value is still in the set
  }
  return ips;
}

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
  type: "connect" | "command" | "disconnect" | "request_status" | "enable_logs" | "disable_logs";
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
  | { type: "player_list"; players: PlayerInfo[] }
  | { type: "log_event"; event: LogEvent }
  | { type: "log_streaming"; enabled: boolean; message: string };

export function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

/**
 * Tracks how many WS clients are actively streaming logs from each
 * game server.  The `logaddress_del` RCON command is only sent when
 * the count for a server drops to zero, preventing one client from
 * killing another client's log stream.
 */
export const logRefCounts = new Map<string, number>();

function logRefKey(host: string, port: number): string {
  return `${host}:${port}`;
}

/** Create and configure the Fastify app (without starting it). */
export async function buildApp(logReceiver?: LogReceiver) {
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
    let logListener: ((msg: LogMessage) => void) | null = null;
    let logServerKey: string | null = null;

    /** Remove the current log listener and decrement the ref count.
     *  When the last subscriber for a server is removed, sends
     *  `logaddress_del` to stop the game server from sending logs. */
    function cleanupLogListener() {
      if (logListener && logReceiver) {
        logReceiver.removeListener("log", logListener);
        logListener = null;
      }
      if (logServerKey) {
        const key = logServerKey;
        const prevCount = logRefCounts.get(key) ?? 0;
        if (prevCount <= 1) {
          logRefCounts.delete(key);
          // Last subscriber — tell the game server to stop sending logs
          if (rcon && rcon.isConnected && logReceiver?.listening) {
            rcon.execute(`logaddress_del "${LOG_ADDRESS}:${logReceiver.port}"`).catch((err) => {
              console.warn(`[LOG] Failed to remove logaddress for ${key}:`, (err as Error).message);
            });
          }
        } else {
          logRefCounts.set(key, prevCount - 1);
        }
        logServerKey = null;
      }
    }

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

          // Clean up previous log listener if switching servers
          cleanupLogListener();

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

        case "enable_logs": {
          // Remove any pre-existing listener for this client to prevent leaks
          // when the client calls enable_logs multiple times without disabling.
          cleanupLogListener();

          if (!logReceiver || !logReceiver.listening) {
            return send(socket, {
              type: "log_streaming",
              enabled: false,
              message:
                "Log streaming is not configured on this server (set LOG_PORT and LOG_ADDRESS env vars)",
            });
          }

          if (!rcon || !rcon.isConnected || !rconHost || rconPort === null) {
            return send(socket, {
              type: "error",
              message: "Not connected to any server",
            });
          }

          const targetHost = rconHost;
          const targetPort = rconPort;
          const key = logRefKey(targetHost, targetPort);
          const isFirstSubscriber = (logRefCounts.get(key) ?? 0) === 0;

          try {
            // Resolve hostname → IP(s) upfront so the log listener can match
            // incoming UDP packets regardless of whether the user connected
            // via hostname, raw IP, or IPv4-mapped IPv6 address.
            // NOTE: UDP source addresses can be spoofed. This IP-based check
            // is not a security boundary — it only routes logs to the correct
            // client. Do not rely on it for authentication.
            const allowedIps = await resolveHostIps(targetHost);

            // Only send logaddress_add when this is the first subscriber
            // for this game server, so we don't spam redundant RCON commands.
            if (isFirstSubscriber) {
              await rcon.execute(`logaddress_add "${LOG_ADDRESS}:${logReceiver.port}"`);
            }
            logListener = (logMsg: LogMessage) => {
              if (allowedIps.has(normalizeIp(logMsg.sourceIp)) && logMsg.sourcePort === targetPort) {
                send(socket, { type: "log_event", event: logMsg.event });
              }
            };
            logReceiver.on("log", logListener);
            logServerKey = key;
            logRefCounts.set(key, (logRefCounts.get(key) ?? 0) + 1);
            send(socket, {
              type: "log_streaming",
              enabled: true,
              message: "Log streaming enabled",
            });
            console.log(
              `[LOG] Streaming enabled for ${targetHost} (refs: ${logRefCounts.get(key)})`,
            );
          } catch (err) {
            send(socket, {
              type: "error",
              message: `Failed to enable log streaming: ${(err as Error).message}`,
            });
          }
          break;
        }

        case "disable_logs": {
          cleanupLogListener();
          send(socket, {
            type: "log_streaming",
            enabled: false,
            message: "Log streaming disabled",
          });
          console.log("[LOG] Streaming disabled");
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
      cleanupLogListener();
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
  let logReceiver: LogReceiver | undefined;

  if (LOG_PORT > 0 && LOG_ADDRESS) {
    logReceiver = new LogReceiver();
    await logReceiver.start(LOG_PORT);
    console.log(`[LOG] UDP log receiver listening on port ${LOG_PORT} (address: ${LOG_ADDRESS})`);
  }

  const app = await buildApp(logReceiver);
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
