import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { LogMessage } from "./log-receiver.js";

// ── Mock dgram ──────────────────────────────────────────────────────────
class MockSocket extends EventEmitter {
  bind = vi.fn((_port: number, cb?: () => void) => {
    if (cb) cb();
  });
  close = vi.fn();
}

let mockSocket: MockSocket;

vi.mock("node:dgram", () => ({
  default: {
    createSocket: vi.fn(() => {
      mockSocket = new MockSocket();
      return mockSocket;
    }),
  },
}));

// Import after mock setup
const { LogReceiver } = await import("./log-receiver.js");

describe("LogReceiver", () => {
  let receiver: InstanceType<typeof LogReceiver>;

  beforeEach(() => {
    receiver = new LogReceiver();
  });

  afterEach(() => {
    receiver.stop();
  });

  // ─── Lifecycle ───

  it("starts listening on the given port", async () => {
    await receiver.start(9001);
    expect(receiver.listening).toBe(true);
    expect(receiver.port).toBe(9001);
    expect(mockSocket.bind).toHaveBeenCalledWith(9001, expect.any(Function));
  });

  it("does nothing if already started", async () => {
    await receiver.start(9001);
    const firstSocket = mockSocket;
    await receiver.start(9002);
    // Should still use the first socket, not create a new one
    expect(receiver.port).toBe(9001);
    expect(firstSocket.close).not.toHaveBeenCalled();
  });

  it("stops and cleans up", async () => {
    await receiver.start(9001);
    const socket = mockSocket;
    receiver.stop();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(receiver.listening).toBe(false);
    expect(receiver.port).toBe(0);
  });

  it("stop is a no-op when not started", () => {
    expect(() => receiver.stop()).not.toThrow();
  });

  // ─── Message parsing ───

  it("emits a log event for a plain-text UDP message", async () => {
    await receiver.start(9001);

    const logs: LogMessage[] = [];
    receiver.on("log", (msg: LogMessage) => logs.push(msg));

    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" say "hello"';
    const buf = Buffer.from(raw, "utf8");
    const rinfo = { address: "192.168.1.10", port: 27015, family: "IPv4", size: buf.length };

    mockSocket.emit("message", buf, rinfo);

    expect(logs).toHaveLength(1);
    expect(logs[0].sourceIp).toBe("192.168.1.10");
    expect(logs[0].sourcePort).toBe(27015);
    expect(logs[0].event.category).toBe("chat");
    expect(logs[0].event.message).toBe("Player [CT]: hello");
  });

  it("strips the OOB header (FF FF FF FF log\\0) from CS2 UDP packets", async () => {
    await receiver.start(9001);

    const logs: LogMessage[] = [];
    receiver.on("log", (msg: LogMessage) => logs.push(msg));

    const logText = 'L 03/01/2024 - 12:34:56: World triggered "Round_Start"';
    // Build a packet with the OOB header: FF FF FF FF "log" 00
    const header = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x6c, 0x6f, 0x67, 0x00]);
    const body = Buffer.from(logText, "utf8");
    const buf = Buffer.concat([header, body]);
    const rinfo = { address: "10.0.0.1", port: 27015, family: "IPv4", size: buf.length };

    mockSocket.emit("message", buf, rinfo);

    expect(logs).toHaveLength(1);
    expect(logs[0].event.category).toBe("round");
    expect(logs[0].event.message).toBe("Round started");
  });

  it("handles multiple log lines in a single datagram", async () => {
    await receiver.start(9001);

    const logs: LogMessage[] = [];
    receiver.on("log", (msg: LogMessage) => logs.push(msg));

    const lines = [
      'L 03/01/2024 - 12:34:56: World triggered "Round_Start"',
      'L 03/01/2024 - 12:34:57: "Player<2><STEAM_0:0:123><CT>" say "glhf"',
    ].join("\n");

    const buf = Buffer.from(lines, "utf8");
    const rinfo = { address: "10.0.0.1", port: 27015, family: "IPv4", size: buf.length };

    mockSocket.emit("message", buf, rinfo);

    expect(logs).toHaveLength(2);
    expect(logs[0].event.category).toBe("round");
    expect(logs[1].event.category).toBe("chat");
  });

  it("skips empty lines in multi-line datagrams", async () => {
    await receiver.start(9001);

    const logs: LogMessage[] = [];
    receiver.on("log", (msg: LogMessage) => logs.push(msg));

    const lines = 'L 03/01/2024 - 12:34:56: World triggered "Round_End"\n\n\n';
    const buf = Buffer.from(lines, "utf8");
    const rinfo = { address: "10.0.0.1", port: 27015, family: "IPv4", size: buf.length };

    mockSocket.emit("message", buf, rinfo);

    expect(logs).toHaveLength(1);
  });

  // ─── Error handling ───

  it("re-emits socket errors", async () => {
    await receiver.start(9001);

    const errors: Error[] = [];
    receiver.on("error", (err: Error) => errors.push(err));

    mockSocket.emit("error", new Error("test error"));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("test error");
  });
});
