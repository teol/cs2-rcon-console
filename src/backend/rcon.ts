import { EventEmitter } from "events";
import * as net from "net";

export enum PacketType {
  SERVERDATA_AUTH = 3,
  SERVERDATA_AUTH_RESPONSE = 2,
  SERVERDATA_EXECCOMMAND = 2,
  SERVERDATA_RESPONSE_VALUE = 0,
}

export interface RconOptions {
  host: string;
  port: number;
  password?: string;
  timeout?: number;
}

interface DecodedPacket {
  size: number;
  id: number;
  type: number;
  body: string;
  totalLength: number;
}

interface PendingRequest {
  resolve: (value: string | boolean) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export class RconClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private authenticated: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private responseBuffer: Buffer = Buffer.alloc(0);

  constructor() {
    super();
  }

  /**
   * Encode a packet following the Source RCON protocol
   */
  public encodePacket(
    type: PacketType,
    body: string,
  ): { id: number; packet: Buffer } {
    const id = ++this.requestId;
    const bodyBuffer = Buffer.from(body, "ascii");
    // Size = 4 (id) + 4 (type) + body length + 1 (body null) + 1 (empty string null)
    const size = 4 + 4 + bodyBuffer.length + 1 + 1;

    const packet = Buffer.alloc(4 + size);
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    bodyBuffer.copy(packet, 12);
    packet.writeUInt8(0, 12 + bodyBuffer.length); // Body null terminator
    packet.writeUInt8(0, 12 + bodyBuffer.length + 1); // Empty string terminator

    return { id, packet };
  }

  /**
   * Decode a single packet from the buffer
   */
  public decodePacket(buffer: Buffer): DecodedPacket | null {
    if (buffer.length < 4) return null;

    const size = buffer.readInt32LE(0);
    const totalLength = size + 4;

    if (buffer.length < totalLength) return null;

    const id = buffer.readInt32LE(4);
    const type = buffer.readInt32LE(8);
    // Body is from byte 12 up to end of size - (id + type + 2 null terminators)
    // Actually the size includes the id and type.
    // The structure is: [Size][ID][Type][Body][Null][Null]
    // The "size" field value = 4 (ID) + 4 (Type) + BodyLen + 1 + 1.
    // So BodyLen = Size - 10.
    // We read body from offset 12 with length (Size - 10).
    const bodyLength = size - 10;
    const body = buffer.toString("ascii", 12, 12 + bodyLength);

    return {
      size,
      id,
      type,
      body,
      totalLength,
    };
  }

  /**
   * Connect to the RCON server
   */
  public connect(
    host: string,
    port: number,
    password?: string,
    timeout: number = 5000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.disconnect();
      }

      this.socket = new net.Socket();
      this.authenticated = false;
      this.requestId = 0;
      this.pendingRequests.clear();
      this.responseBuffer = Buffer.alloc(0);

      const connectTimeout = setTimeout(() => {
        this.disconnect();
        reject(new Error("Connection timed out"));
      }, timeout);

      this.socket.connect(port, host, () => {
        clearTimeout(connectTimeout);
        // Authenticate immediately after connecting if password provided
        if (password) {
          this.authenticate(password)
            .then(() => resolve())
            .catch((err) => reject(err));
        } else {
          resolve();
        }
      });

      this.socket.on("data", (data) => this.handleData(data));

      this.socket.on("error", (err) => {
        clearTimeout(connectTimeout);
        this.emit("error", err);
        // If we were connecting, this rejects the promise.
        // If already connected, the 'error' event is emitted above.
        // We shouldn't reject an already settled promise, but this is safe here
        // because connectTimeout would have fired if promise pending.
        // However, better to handle cleanly.
        // The promise constructor runs synchronously, so listeners are attached.
        // If error happens during connection, reject is called.
      });

      this.socket.on("close", () => {
        this.authenticated = false;
        this.emit("disconnect");
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /**
   * Handle incoming TCP data (may contain multiple or partial packets)
   */
  private handleData(data: Buffer): void {
    // Ensure data is treated as Uint8Array/Buffer for concat.
    // data from net.Socket is Buffer by default if setEncoding is not called, but types might be loose.
    const chunks: Uint8Array[] = [
      this.responseBuffer,
      data as unknown as Uint8Array,
    ];
    this.responseBuffer = Buffer.concat(chunks);

    let packet;
    while ((packet = this.decodePacket(this.responseBuffer)) !== null) {
      this.responseBuffer = this.responseBuffer.slice(packet.totalLength);
      this.handlePacket(packet);
    }
  }

  /**
   * Handle a decoded packet
   */
  private handlePacket(packet: DecodedPacket): void {
    const pending = this.pendingRequests.get(packet.id);
    if (pending) {
      this.pendingRequests.delete(packet.id);
      clearTimeout(pending.timer);

      if (packet.type === PacketType.SERVERDATA_AUTH_RESPONSE) {
        if (packet.id === -1) {
          pending.reject(
            new Error("Authentication failed: wrong RCON password"),
          );
        } else {
          this.authenticated = true;
          pending.resolve(true);
        }
      } else {
        pending.resolve(packet.body);
      }
    }

    this.emit("response", packet);
  }

  /**
   * Send authentication packet
   */
  public authenticate(password: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const { id, packet } = this.encodePacket(
        PacketType.SERVERDATA_AUTH,
        password,
      );

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Authentication timed out"));
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: string | boolean) => void,
        reject,
        timer,
      });

      if (this.socket) {
        this.socket.write(packet);
      } else {
        clearTimeout(timer);
        reject(new Error("Socket not connected"));
      }
    });
  }

  /**
   * Execute an RCON command
   */
  public execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.authenticated) {
        return reject(new Error("Not authenticated"));
      }

      const { id, packet } = this.encodePacket(
        PacketType.SERVERDATA_EXECCOMMAND,
        command,
      );

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Command timed out"));
      }, 10000);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: string | boolean) => void,
        reject,
        timer,
      });

      if (this.socket) {
        this.socket.write(packet);
      } else {
        clearTimeout(timer);
        reject(new Error("Socket not connected"));
      }
    });
  }

  /**
   * Disconnect from the server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.authenticated = false;
    this.pendingRequests.clear();
    this.responseBuffer = Buffer.alloc(0);
  }

  public get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this.authenticated;
  }
}
