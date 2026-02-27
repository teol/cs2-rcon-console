import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RconClient, PacketType } from "../rcon";
import * as net from "net";

// Mock net.Socket
vi.mock("net", () => {
  return {
    Socket: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
      destroyed: false,
    })),
  };
});

describe("RconClient", () => {
  let rcon: RconClient;

  beforeEach(() => {
    rcon = new RconClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should encode packets correctly", () => {
    const { id, packet } = rcon.encodePacket(
      PacketType.SERVERDATA_EXECCOMMAND,
      "status",
    );

    // Size = 4 (id) + 4 (type) + 6 ('status') + 1 + 1 = 16
    const expectedSize = 4 + 4 + 6 + 1 + 1;
    expect(packet.readInt32LE(0)).toBe(expectedSize);
    expect(packet.readInt32LE(4)).toBe(id);
    expect(packet.readInt32LE(8)).toBe(PacketType.SERVERDATA_EXECCOMMAND);
    expect(packet.toString("ascii", 12, 18)).toBe("status");
  });

  it("should decode packets correctly", () => {
    // Construct a fake packet: ID=1, Type=0, Body="hello"
    // Size = 4 + 4 + 5 + 1 + 1 = 15
    const size = 15;
    const packet = Buffer.alloc(4 + size);
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(1, 4);
    packet.writeInt32LE(0, 8);
    packet.write("hello", 12, "ascii");
    packet.writeUInt8(0, 12 + 5);
    packet.writeUInt8(0, 12 + 6);

    const decoded = rcon.decodePacket(packet);
    expect(decoded).not.toBeNull();
    expect(decoded?.size).toBe(size);
    expect(decoded?.id).toBe(1);
    expect(decoded?.type).toBe(0);
    expect(decoded?.body).toBe("hello");
  });

  it("should return null for incomplete packets", () => {
    const buffer = Buffer.alloc(10); // Too small
    buffer.writeInt32LE(100, 0); // Claims size is 100

    const decoded = rcon.decodePacket(buffer);
    expect(decoded).toBeNull();
  });
});
