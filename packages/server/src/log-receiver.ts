import { EventEmitter } from "node:events";
import dgram from "node:dgram";
import type { LogEvent } from "@cs2-rcon/shared";
import { parseLogLine } from "./log-parser.js";

export interface LogMessage {
  sourceIp: string;
  sourcePort: number;
  event: LogEvent;
}

/**
 * Listens for CS2 log data over UDP.
 *
 * CS2's `logaddress_add "ip:port"` command tells the game server to send
 * log lines as UDP datagrams.  Each datagram contains one or more
 * newline-separated log lines prefixed with `\xFF\xFF\xFF\xFFlog\x00`
 * (the 4-byte OOB header followed by "log\0") or sometimes just the
 * raw log text.
 *
 * Usage:
 * ```ts
 * const receiver = new LogReceiver();
 * receiver.on("log", (msg: LogMessage) => { ... });
 * await receiver.start(9001);
 * // later
 * receiver.stop();
 * ```
 */
export class LogReceiver extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private _port = 0;

  get port(): number {
    return this._port;
  }

  get listening(): boolean {
    return this.socket !== null;
  }

  async start(port: number): Promise<void> {
    if (this.socket) return;

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");

      socket.on("message", (buf: Buffer, rinfo: dgram.RemoteInfo) => {
        this.handleMessage(buf, rinfo);
      });

      socket.on("error", (err) => {
        this.emit("error", err);
      });

      socket.bind(port, () => {
        this._port = port;
        this.socket = socket;
        resolve();
      });

      socket.once("error", reject);
    });
  }

  stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this._port = 0;
    }
  }

  private handleMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    let text: string;

    // CS2 prefixes UDP log lines with the OOB header: FF FF FF FF
    // followed by "log" and an optional null terminator. Strip it if present.
    if (
      buf.length > 4 &&
      buf[0] === 0xff &&
      buf[1] === 0xff &&
      buf[2] === 0xff &&
      buf[3] === 0xff
    ) {
      let offset = 4; // Start after OOB prefix
      if (buf.length > offset + 3 && buf.toString("ascii", offset, offset + 3) === "log") {
        offset += 3; // "log" is 3 bytes
        if (buf.length > offset && buf[offset] === 0x00) {
          offset += 1; // Optional null terminator
        }
      } else {
        // Fallback for an unknown payload: assume an 8-byte header.
        offset = 8;
      }
      text = buf.subarray(Math.min(offset, buf.length)).toString("utf8");
    } else {
      text = buf.toString("utf8");
    }

    // A single datagram may contain multiple newline-separated log lines
    const lines = text.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const event = parseLogLine(line);
      const msg: LogMessage = {
        sourceIp: rinfo.address,
        sourcePort: rinfo.port,
        event,
      };
      this.emit("log", msg);
    }
  }
}
