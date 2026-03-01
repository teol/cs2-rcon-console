/**
 * A2S_INFO — Valve Source Query Protocol (UDP).
 *
 * This module implements the A2S_INFO query which retrieves public server
 * information (hostname, map, player counts, version, etc.) without needing
 * RCON authentication.  It is intentionally kept separate from the RCON
 * client because it uses a completely different transport (UDP vs TCP) and
 * protocol framing.
 *
 * Reference: https://developer.valvesoftware.com/wiki/Server_queries#A2S_INFO
 */

import dgram from "node:dgram";

/* ─── Response type ─── */

export interface A2SInfoResponse {
  protocol: number;
  hostname: string;
  map: string;
  folder: string;
  game: string;
  appId: number;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: string; // 'd' = dedicated, 'l' = listen, 'p' = proxy
  environment: string; // 'l' = Linux, 'w' = Windows, 'm' / 'o' = Mac
  visibility: boolean; // true = private
  vac: boolean;
  version: string;
}

/* ─── Constants ─── */

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO_TYPE = 0x54;
const A2S_INFO_PAYLOAD = "Source Engine Query\0";

// Response headers
const S2A_INFO_SRC = 0x49; // Source engine response
const S2C_CHALLENGE = 0x41; // Challenge response

const DEFAULT_TIMEOUT_MS = 3000;

/* ─── Helpers ─── */

/** Build the A2S_INFO request packet, optionally including a challenge token. */
export function buildA2SInfoRequest(challenge?: Buffer): Buffer {
  const payload = Buffer.from(A2S_INFO_PAYLOAD, "binary");
  if (challenge) {
    return Buffer.concat([HEADER, Buffer.from([A2S_INFO_TYPE]), payload, challenge]);
  }
  return Buffer.concat([HEADER, Buffer.from([A2S_INFO_TYPE]), payload]);
}

/** Read a null-terminated string from `buf` starting at `offset`. */
function readString(buf: Buffer, offset: number): { value: string; next: number } {
  const end = buf.indexOf(0x00, offset);
  if (end === -1) return { value: "", next: buf.length };
  return { value: buf.toString("utf8", offset, end), next: end + 1 };
}

/** Parse a raw S2A_INFO_SRC (0x49) response buffer into structured data. */
export function parseA2SInfoResponse(buf: Buffer): A2SInfoResponse {
  // Skip the 4-byte header (0xFFFFFFFF) and the 1-byte type (0x49)
  let offset = 5;

  const protocol = buf.readUInt8(offset);
  offset += 1;

  const hostname = readString(buf, offset);
  offset = hostname.next;

  const map = readString(buf, offset);
  offset = map.next;

  const folder = readString(buf, offset);
  offset = folder.next;

  const game = readString(buf, offset);
  offset = game.next;

  const appId = buf.readUInt16LE(offset);
  offset += 2;

  const players = buf.readUInt8(offset);
  offset += 1;

  const maxPlayers = buf.readUInt8(offset);
  offset += 1;

  const bots = buf.readUInt8(offset);
  offset += 1;

  const serverType = String.fromCharCode(buf.readUInt8(offset));
  offset += 1;

  const environment = String.fromCharCode(buf.readUInt8(offset));
  offset += 1;

  const visibility = buf.readUInt8(offset) === 1;
  offset += 1;

  const vac = buf.readUInt8(offset) === 1;
  offset += 1;

  const version = readString(buf, offset);

  return {
    protocol,
    hostname: hostname.value,
    map: map.value,
    folder: folder.value,
    game: game.value,
    appId,
    players,
    maxPlayers,
    bots,
    serverType,
    environment,
    visibility,
    vac,
    version: version.value,
  };
}

/**
 * Query a Source engine server for A2S_INFO data.
 *
 * Handles the challenge/response handshake automatically: if the server
 * replies with S2C_CHALLENGE (0x41), the request is re-sent with the
 * challenge token appended.
 */
export function queryA2SInfo(
  host: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<A2SInfoResponse> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        reject(new Error(`A2S_INFO query timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.close();
    }

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    socket.on("message", (msg) => {
      if (msg.length < 5) return; // too short

      const type = msg.readUInt8(4);

      if (type === S2C_CHALLENGE) {
        // Server returned a challenge — resend with the 4-byte token
        if (msg.length < 9) return;
        const challenge = msg.subarray(5, 9);
        const retryPacket = buildA2SInfoRequest(challenge);
        socket.send(retryPacket, 0, retryPacket.length, port, host);
        return;
      }

      if (type === S2A_INFO_SRC) {
        if (!settled) {
          settled = true;
          try {
            const info = parseA2SInfoResponse(msg);
            cleanup();
            resolve(info);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
        return;
      }
    });

    const packet = buildA2SInfoRequest();
    socket.send(packet, 0, packet.length, port, host);
  });
}
