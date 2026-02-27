import { describe, it, expect, vi, beforeEach } from "vitest";
import net from "node:net";
import { RconClient, PacketType } from "./rcon.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Access private methods/fields on RconClient for testing. */
function asAny(client: RconClient): Record<string, unknown> {
  return client as unknown as Record<string, unknown>;
}

/** Build a valid Source RCON response buffer. */
function buildResponsePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "ascii");
  const size = 4 + 4 + bodyBuf.length + 1 + 1;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeUInt8(0, 12 + bodyBuf.length);
  buf.writeUInt8(0, 12 + bodyBuf.length + 1);
  return buf;
}

/** Create a mock net.Socket with controllable behaviour. */
function createMockSocket() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const socket = {
    connect: vi.fn((_port: number, _host: string, cb: () => void) => {
      // Simulate async connection success
      process.nextTick(cb);
      return socket;
    }),
    write: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
      return socket;
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const handler of listeners.get(event) ?? []) handler(...args);
    },
  };

  return { socket, listeners };
}

// ---------------------------------------------------------------------------
// PacketType constants
// ---------------------------------------------------------------------------

describe("PacketType", () => {
  it("has correct values", () => {
    expect(PacketType.AUTH).toBe(3);
    expect(PacketType.AUTH_RESPONSE).toBe(2);
    expect(PacketType.EXEC_COMMAND).toBe(2);
    expect(PacketType.RESPONSE_VALUE).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Packet encoding / decoding
// ---------------------------------------------------------------------------

describe("RconClient packet encoding", () => {
  let client: RconClient;

  beforeEach(() => {
    client = new RconClient();
  });

  it("encodePacket produces a valid RCON packet", () => {
    const encode = (asAny(client) as { encodePacket: Function }).encodePacket.bind(client);
    const { id, packet } = encode(PacketType.AUTH, "password") as {
      id: number;
      packet: Buffer;
    };

    expect(id).toBe(1); // first request id

    // Read back packet fields
    const size = packet.readInt32LE(0);
    const readId = packet.readInt32LE(4);
    const readType = packet.readInt32LE(8);
    const body = packet.toString("ascii", 12, 12 + size - 10);

    expect(readId).toBe(1);
    expect(readType).toBe(PacketType.AUTH);
    expect(body).toBe("password");
    expect(packet.length).toBe(4 + size);
    // Last two bytes should be null terminators
    expect(packet[packet.length - 1]).toBe(0);
    expect(packet[packet.length - 2]).toBe(0);
  });

  it("encodePacket increments request id", () => {
    const encode = (asAny(client) as { encodePacket: Function }).encodePacket.bind(client);
    const first = encode(PacketType.EXEC_COMMAND, "a") as { id: number };
    const second = encode(PacketType.EXEC_COMMAND, "b") as { id: number };
    expect(second.id).toBe(first.id + 1);
  });

  it("encodePacket handles empty body", () => {
    const encode = (asAny(client) as { encodePacket: Function }).encodePacket.bind(client);
    const { packet } = encode(PacketType.EXEC_COMMAND, "") as { packet: Buffer };
    const size = packet.readInt32LE(0);
    // size = 4 (id) + 4 (type) + 0 (body) + 1 + 1 = 10
    expect(size).toBe(10);
  });
});

describe("RconClient packet decoding", () => {
  let client: RconClient;

  beforeEach(() => {
    client = new RconClient();
  });

  it("decodePacket parses a valid packet", () => {
    const decode = (asAny(client) as { decodePacket: Function }).decodePacket.bind(client);
    const buf = buildResponsePacket(1, PacketType.RESPONSE_VALUE, "hello");
    const packet = decode(buf);

    expect(packet).not.toBeNull();
    expect(packet.id).toBe(1);
    expect(packet.type).toBe(PacketType.RESPONSE_VALUE);
    expect(packet.body).toBe("hello");
  });

  it("decodePacket returns null for incomplete data", () => {
    const decode = (asAny(client) as { decodePacket: Function }).decodePacket.bind(client);

    // Too short to read size field
    expect(decode(Buffer.alloc(2))).toBeNull();

    // Has size field but not enough data
    const partial = buildResponsePacket(1, 0, "test");
    expect(decode(partial.subarray(0, 8))).toBeNull();
  });

  it("decodePacket handles empty body", () => {
    const decode = (asAny(client) as { decodePacket: Function }).decodePacket.bind(client);
    const buf = buildResponsePacket(1, PacketType.AUTH_RESPONSE, "");
    const packet = decode(buf);

    expect(packet).not.toBeNull();
    expect(packet.body).toBe("");
  });
});

// ---------------------------------------------------------------------------
// handleData — multi-packet and partial packet handling
// ---------------------------------------------------------------------------

describe("RconClient handleData", () => {
  let client: RconClient;

  beforeEach(() => {
    client = new RconClient();
  });

  it("processes multiple packets in a single buffer", () => {
    const handleData = (asAny(client) as { handleData: Function }).handleData.bind(client);
    const handlePacket = vi.fn();
    (asAny(client) as { handlePacket: Function }).handlePacket = handlePacket;

    const pkt1 = buildResponsePacket(1, PacketType.RESPONSE_VALUE, "aaa");
    const pkt2 = buildResponsePacket(2, PacketType.RESPONSE_VALUE, "bbb");
    const combined = Buffer.concat([pkt1, pkt2]);

    handleData(combined);

    expect(handlePacket).toHaveBeenCalledTimes(2);
    expect(handlePacket.mock.calls[0][0].id).toBe(1);
    expect(handlePacket.mock.calls[1][0].id).toBe(2);
  });

  it("buffers partial packets across calls", () => {
    const handleData = (asAny(client) as { handleData: Function }).handleData.bind(client);
    const handlePacket = vi.fn();
    (asAny(client) as { handlePacket: Function }).handlePacket = handlePacket;

    const full = buildResponsePacket(5, PacketType.RESPONSE_VALUE, "split");
    const half = Math.floor(full.length / 2);

    handleData(full.subarray(0, half));
    expect(handlePacket).not.toHaveBeenCalled();

    handleData(full.subarray(half));
    expect(handlePacket).toHaveBeenCalledTimes(1);
    expect(handlePacket.mock.calls[0][0].id).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// handlePacket — routing to pending requests
// ---------------------------------------------------------------------------

describe("RconClient handlePacket", () => {
  let client: RconClient;

  beforeEach(() => {
    client = new RconClient();
  });

  it("resolves pending request with body for response packets", () => {
    const pendingRequests = asAny(client).pendingRequests as Map<
      number,
      { resolve: Function; reject: Function }
    >;
    const resolve = vi.fn();
    const reject = vi.fn();
    pendingRequests.set(1, { resolve, reject });

    const handlePacket = (asAny(client) as { handlePacket: Function }).handlePacket.bind(client);
    handlePacket({ id: 1, type: PacketType.RESPONSE_VALUE, body: "ok", size: 0, totalLength: 0 });

    expect(resolve).toHaveBeenCalledWith("ok");
    expect(reject).not.toHaveBeenCalled();
    expect(pendingRequests.has(1)).toBe(false);
  });

  it("resolves auth response with true on success", () => {
    const pendingRequests = asAny(client).pendingRequests as Map<
      number,
      { resolve: Function; reject: Function }
    >;
    const resolve = vi.fn();
    const reject = vi.fn();
    pendingRequests.set(1, { resolve, reject });

    const handlePacket = (asAny(client) as { handlePacket: Function }).handlePacket.bind(client);
    handlePacket({ id: 1, type: PacketType.AUTH_RESPONSE, body: "", size: 0, totalLength: 0 });

    expect(resolve).toHaveBeenCalledWith(true);
    expect((asAny(client) as { authenticated: boolean }).authenticated).toBe(true);
  });

  it("rejects auth response when id is -1 (matches first pending request)", () => {
    const pendingRequests = asAny(client).pendingRequests as Map<
      number,
      { resolve: Function; reject: Function }
    >;
    const resolve = vi.fn();
    const reject = vi.fn();
    // The real auth request is stored under the actual request id (e.g. 1),
    // but the server responds with id = -1 on failure.
    pendingRequests.set(1, { resolve, reject });

    const handlePacket = (asAny(client) as { handlePacket: Function }).handlePacket.bind(client);
    handlePacket({ id: -1, type: PacketType.AUTH_RESPONSE, body: "", size: 0, totalLength: 0 });

    expect(reject).toHaveBeenCalled();
    expect(reject.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(reject.mock.calls[0][0].message).toContain("Authentication failed");
  });

  it("emits 'response' event for every packet", () => {
    const spy = vi.fn();
    client.on("response", spy);

    const handlePacket = (asAny(client) as { handlePacket: Function }).handlePacket.bind(client);
    const pkt = { id: 99, type: PacketType.RESPONSE_VALUE, body: "x", size: 0, totalLength: 0 };
    handlePacket(pkt);

    expect(spy).toHaveBeenCalledWith(pkt);
  });

  it("ignores packets with no matching pending request", () => {
    const handlePacket = (asAny(client) as { handlePacket: Function }).handlePacket.bind(client);
    // Should not throw
    expect(() =>
      handlePacket({ id: 42, type: PacketType.RESPONSE_VALUE, body: "", size: 0, totalLength: 0 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// connect — full flow with mocked socket
// ---------------------------------------------------------------------------

describe("RconClient.connect", () => {
  let client: RconClient;

  beforeEach(() => {
    client = new RconClient();
  });

  it("connects and authenticates successfully", async () => {
    const { socket } = createMockSocket();

    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    // When the client writes the AUTH packet, simulate a successful auth response
    socket.write.mockImplementation((buf: Buffer) => {
      const id = buf.readInt32LE(4);
      const response = buildResponsePacket(id, PacketType.AUTH_RESPONSE, "");
      process.nextTick(() => socket.emit("data", response));
    });

    await client.connect("127.0.0.1", 27015, "test_password");

    expect(socket.connect).toHaveBeenCalledWith(27015, "127.0.0.1", expect.any(Function));
    expect(client.isConnected).toBe(true);

    vi.restoreAllMocks();
  });

  it("rejects on authentication failure (id = -1)", async () => {
    const { socket } = createMockSocket();

    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    socket.write.mockImplementation((_buf: Buffer) => {
      const response = buildResponsePacket(-1, PacketType.AUTH_RESPONSE, "");
      process.nextTick(() => socket.emit("data", response));
    });

    await expect(client.connect("127.0.0.1", 27015, "wrong")).rejects.toThrow(
      "Authentication failed",
    );
    expect(client.isConnected).toBe(false);

    vi.restoreAllMocks();
  });

  it("rejects on connection timeout", async () => {
    const { socket } = createMockSocket();
    // Override connect to never call the callback (simulates timeout)
    socket.connect = vi.fn().mockReturnValue(socket);

    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    await expect(client.connect("127.0.0.1", 27015, "pw", 50)).rejects.toThrow(
      "Connection timed out",
    );

    vi.restoreAllMocks();
  });

  it("rejects on socket error", async () => {
    const { socket } = createMockSocket();
    // Override connect to emit error instead of calling callback
    socket.connect = vi.fn((_port: number, _host: string, _cb: () => void) => {
      process.nextTick(() => socket.emit("error", new Error("ECONNREFUSED")));
      return socket;
    });

    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    // Suppress the unhandled 'error' event from EventEmitter
    client.on("error", () => {});

    await expect(client.connect("127.0.0.1", 27015, "pw")).rejects.toThrow("ECONNREFUSED");

    vi.restoreAllMocks();
  });

  it("disconnects previous connection before reconnecting", async () => {
    const { socket: socket1 } = createMockSocket();
    const { socket: socket2 } = createMockSocket();

    let callCount = 0;
    const socketMock = vi.spyOn(net, "Socket").mockImplementation(function () {
      callCount++;
      return (callCount === 1 ? socket1 : socket2) as unknown as net.Socket;
    });

    // Both sockets auto-auth
    for (const s of [socket1, socket2]) {
      s.write.mockImplementation((buf: Buffer) => {
        const id = buf.readInt32LE(4);
        const response = buildResponsePacket(id, PacketType.AUTH_RESPONSE, "");
        process.nextTick(() => s.emit("data", response));
      });
    }

    await client.connect("127.0.0.1", 27015, "pw");
    expect(socket1.destroy).not.toHaveBeenCalled();

    await client.connect("127.0.0.1", 27015, "pw");
    expect(socket1.destroy).toHaveBeenCalled();
    expect(client.isConnected).toBe(true);

    socketMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

describe("RconClient.execute", () => {
  let client: RconClient;

  beforeEach(async () => {
    client = new RconClient();
    const { socket } = createMockSocket();
    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    socket.write.mockImplementation((buf: Buffer) => {
      const id = buf.readInt32LE(4);
      const type = buf.readInt32LE(8);
      if (type === PacketType.AUTH) {
        const response = buildResponsePacket(id, PacketType.AUTH_RESPONSE, "");
        process.nextTick(() => socket.emit("data", response));
      } else {
        const response = buildResponsePacket(id, PacketType.RESPONSE_VALUE, "reply");
        process.nextTick(() => socket.emit("data", response));
      }
    });

    await client.connect("127.0.0.1", 27015, "pw");
  });

  it("sends command and returns response", async () => {
    const result = await client.execute("status");
    expect(result).toBe("reply");

    vi.restoreAllMocks();
  });

  it("rejects when not authenticated", async () => {
    client.disconnect();
    await expect(client.execute("status")).rejects.toThrow("Not authenticated");

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe("RconClient.disconnect", () => {
  it("destroys socket and clears state", async () => {
    const client = new RconClient();
    const { socket } = createMockSocket();
    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    socket.write.mockImplementation((buf: Buffer) => {
      const id = buf.readInt32LE(4);
      const response = buildResponsePacket(id, PacketType.AUTH_RESPONSE, "");
      process.nextTick(() => socket.emit("data", response));
    });

    await client.connect("127.0.0.1", 27015, "pw");
    expect(client.isConnected).toBe(true);

    client.disconnect();

    expect(socket.destroy).toHaveBeenCalled();
    expect(client.isConnected).toBe(false);

    vi.restoreAllMocks();
  });

  it("is safe to call when not connected", () => {
    const client = new RconClient();
    expect(() => client.disconnect()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isConnected
// ---------------------------------------------------------------------------

describe("RconClient.isConnected", () => {
  it("returns false when no socket exists", () => {
    const client = new RconClient();
    expect(client.isConnected).toBe(false);
  });

  it("returns false when socket is destroyed", async () => {
    const client = new RconClient();
    const { socket } = createMockSocket();
    vi.spyOn(net, "Socket").mockImplementation(function () {
      return socket as unknown as net.Socket;
    });

    socket.write.mockImplementation((buf: Buffer) => {
      const id = buf.readInt32LE(4);
      const response = buildResponsePacket(id, PacketType.AUTH_RESPONSE, "");
      process.nextTick(() => socket.emit("data", response));
    });

    await client.connect("127.0.0.1", 27015, "pw");
    socket.destroyed = true;
    expect(client.isConnected).toBe(false);

    vi.restoreAllMocks();
  });
});
