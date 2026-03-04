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

    const OOB_PREFIX = Buffer.from([0xff, 0xff, 0xff, 0xff]);

    // CS2 prefixes UDP log lines with the OOB header: FF FF FF FF
    // followed by "log" and an optional null terminator. Strip it if present.
    if (buf.length > 4 && buf.subarray(0, 4).equals(OOB_PREFIX)) {
      const LOG_HEADER_NULL = Buffer.from("log\0");
      const LOG_HEADER = Buffer.from("log");
      const payload = buf.subarray(4);

      if (payload.indexOf(LOG_HEADER_NULL) === 0) {
        text = payload.subarray(LOG_HEADER_NULL.length).toString("utf8");
      } else if (payload.indexOf(LOG_HEADER) === 0) {
        text = payload.subarray(LOG_HEADER.length).toString("utf8");
      } else {
        // Fallback for an unknown payload after OOB prefix, e.g. A2S responses.
        // Assume a fixed-size header and try to decode the rest.
        text = payload.subarray(Math.min(4, payload.length)).toString("utf8");
      }
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
