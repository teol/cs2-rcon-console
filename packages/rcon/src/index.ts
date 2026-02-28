import net from "node:net";
import { EventEmitter } from "node:events";

/** Source RCON packet types. */
export const PacketType = {
  AUTH: 3,
  AUTH_RESPONSE: 2,
  EXEC_COMMAND: 2,
  RESPONSE_VALUE: 0,
} as const;

export interface RconPacket {
  size: number;
  id: number;
  type: number;
  body: string;
  totalLength: number;
}

interface PendingRequest {
  resolve: (value: string | boolean) => void;
  reject: (error: Error) => void;
}

/**
 * Source RCON protocol client.
 *
 * Implements the binary TCP protocol described at:
 * https://developer.valvesoftware.com/wiki/Source_RCON_Protocol
 *
 * Packet structure:
 *   4 bytes – Packet size  (Int32LE, excludes this field itself)
 *   4 bytes – Request ID   (Int32LE)
 *   4 bytes – Packet type  (Int32LE)
 *   N bytes – Body         (null-terminated ASCII)
 *   1 byte  – Empty string terminator (0x00)
 */
export class RconClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private authenticated = false;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private responseBuffer = Buffer.alloc(0);

  /** Encode a packet following the Source RCON protocol. */
  private encodePacket(type: number, body: string): { id: number; packet: Buffer } {
    const id = ++this.requestId;
    const bodyBuffer = Buffer.from(body, "ascii");
    // size = 4 (id) + 4 (type) + body length + 1 (body null) + 1 (terminator null)
    const size = 4 + 4 + bodyBuffer.length + 1 + 1;

    const packet = Buffer.alloc(4 + size);
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    bodyBuffer.copy(packet, 12);
    packet.writeUInt8(0, 12 + bodyBuffer.length); // body null terminator
    packet.writeUInt8(0, 12 + bodyBuffer.length + 1); // empty string terminator

    return { id, packet };
  }

  /** Decode a single packet from the buffer. Returns `null` if incomplete. */
  private decodePacket(buffer: Buffer): RconPacket | null {
    if (buffer.length < 4) return null;

    const size = buffer.readInt32LE(0);
    const totalLength = size + 4;

    if (buffer.length < totalLength) return null;

    const id = buffer.readInt32LE(4);
    const type = buffer.readInt32LE(8);
    const body = buffer.toString("ascii", 12, 12 + size - 10);

    return { size, id, type, body, totalLength };
  }

  /** Handle incoming TCP data (may contain multiple or partial packets). */
  private handleData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

    let packet: RconPacket | null;
    while ((packet = this.decodePacket(this.responseBuffer)) !== null) {
      this.responseBuffer = this.responseBuffer.subarray(packet.totalLength);
      this.handlePacket(packet);
    }
  }

  /** Route a decoded packet to the matching pending request. */
  private handlePacket(packet: RconPacket): void {
    // Auth failure: the server responds with id = -1, but the pending request
    // was stored under the real request id.  Reject the most recent pending
    // auth request when we see a -1 AUTH_RESPONSE.
    if (packet.type === PacketType.AUTH_RESPONSE && packet.id === -1) {
      const entry = this.pendingRequests.entries().next();
      if (!entry.done) {
        const [key, pending] = entry.value;
        this.pendingRequests.delete(key);
        pending.reject(new Error("Authentication failed: wrong RCON password"));
      }
      this.emit("response", packet);
      return;
    }

    const pending = this.pendingRequests.get(packet.id);
    if (pending) {
      this.pendingRequests.delete(packet.id);

      if (packet.type === PacketType.AUTH_RESPONSE) {
        this.authenticated = true;
        pending.resolve(true);
      } else {
        pending.resolve(packet.body);
      }
    }

    this.emit("response", packet);
  }

  /** Send the authentication packet. */
  private authenticate(password: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const { id, packet } = this.encodePacket(PacketType.AUTH, password);

      const timer = setTimeout(() => {
        reject(new Error(`Authentication timed out`));
      }, 5_000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val as boolean);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.socket!.write(packet);
    });
  }

  /** Connect and authenticate to the RCON server. */
  connect(host: string, port: number, password: string, timeout = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.disconnect();
      }

      this.socket = new net.Socket();
      this.authenticated = false;
      this.requestId = 0;
      this.pendingRequests.clear();
      this.responseBuffer = Buffer.alloc(0);

      const connectTimer = setTimeout(() => {
        this.disconnect();
        reject(new Error("Connection timed out"));
      }, timeout);

      this.socket.connect(port, host, () => {
        clearTimeout(connectTimer);
        this.authenticate(password)
          .then(() => resolve())
          .catch((err) => reject(err));
      });

      this.socket.on("data", (data) => this.handleData(data));

      this.socket.on("error", (err) => {
        clearTimeout(connectTimer);
        this.emit("error", err);
        reject(err);
      });

      this.socket.on("close", () => {
        this.authenticated = false;
        this.emit("disconnect");
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /** Execute an RCON command and return the server response. */
  execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.authenticated) {
        return reject(new Error("Not authenticated"));
      }

      const { id, packet } = this.encodePacket(PacketType.EXEC_COMMAND, command);

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Command timed out"));
      }, 10_000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val as string);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.socket!.write(packet);
    });
  }

  /** Gracefully disconnect from the server. */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.authenticated = false;
    this.pendingRequests.clear();
    this.responseBuffer = Buffer.alloc(0);
  }

  /** Whether the client is currently connected and authenticated. */
  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this.authenticated;
  }
}
