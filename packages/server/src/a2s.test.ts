import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildA2SInfoRequest, parseA2SInfoResponse, queryA2SInfo } from "./a2s.js";
import dgram from "node:dgram";

// ---------------------------------------------------------------------------
// buildA2SInfoRequest
// ---------------------------------------------------------------------------

describe("buildA2SInfoRequest", () => {
  it("builds a standard A2S_INFO request packet", () => {
    const packet = buildA2SInfoRequest();

    // Header: FF FF FF FF
    expect(packet[0]).toBe(0xff);
    expect(packet[1]).toBe(0xff);
    expect(packet[2]).toBe(0xff);
    expect(packet[3]).toBe(0xff);

    // Type: 0x54 (A2S_INFO)
    expect(packet[4]).toBe(0x54);

    // Payload: "Source Engine Query\0"
    const payload = packet.subarray(5).toString("binary");
    expect(payload).toBe("Source Engine Query\0");
  });

  it("appends challenge bytes when provided", () => {
    const challenge = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const packet = buildA2SInfoRequest(challenge);

    // Should be standard packet + 4 challenge bytes
    const withoutChallenge = buildA2SInfoRequest();
    expect(packet.length).toBe(withoutChallenge.length + 4);

    // Last 4 bytes should be the challenge
    expect(packet[packet.length - 4]).toBe(0x01);
    expect(packet[packet.length - 3]).toBe(0x02);
    expect(packet[packet.length - 2]).toBe(0x03);
    expect(packet[packet.length - 1]).toBe(0x04);
  });
});

// ---------------------------------------------------------------------------
// parseA2SInfoResponse
// ---------------------------------------------------------------------------

describe("parseA2SInfoResponse", () => {
  /** Build a fake S2A_INFO_SRC response buffer. */
  function buildFakeResponse(opts: {
    protocol?: number;
    hostname?: string;
    map?: string;
    folder?: string;
    game?: string;
    appId?: number;
    players?: number;
    maxPlayers?: number;
    bots?: number;
    serverType?: string;
    environment?: string;
    visibility?: number;
    vac?: number;
    version?: string;
  }): Buffer {
    const parts: Buffer[] = [];

    // Header + type
    parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49]));

    // Protocol
    parts.push(Buffer.from([opts.protocol ?? 17]));

    // Strings (null-terminated)
    const str = (s: string) => Buffer.from(s + "\0", "utf8");
    parts.push(str(opts.hostname ?? "Test Server"));
    parts.push(str(opts.map ?? "de_dust2"));
    parts.push(str(opts.folder ?? "csgo"));
    parts.push(str(opts.game ?? "Counter-Strike 2"));

    // AppID (2 bytes LE)
    const appIdBuf = Buffer.alloc(2);
    appIdBuf.writeUInt16LE(opts.appId ?? 730);
    parts.push(appIdBuf);

    // Players, MaxPlayers, Bots
    parts.push(Buffer.from([opts.players ?? 8]));
    parts.push(Buffer.from([opts.maxPlayers ?? 10]));
    parts.push(Buffer.from([opts.bots ?? 0]));

    // Server type, Environment, Visibility, VAC
    parts.push(Buffer.from([opts.serverType?.charCodeAt(0) ?? 0x64])); // 'd'
    parts.push(Buffer.from([opts.environment?.charCodeAt(0) ?? 0x6c])); // 'l'
    parts.push(Buffer.from([opts.visibility ?? 0]));
    parts.push(Buffer.from([opts.vac ?? 1]));

    // Version
    parts.push(str(opts.version ?? "1.40.1.0"));

    return Buffer.concat(parts);
  }

  it("parses a standard A2S_INFO response", () => {
    const buf = buildFakeResponse({
      hostname: "My CS2 Server",
      map: "de_mirage",
      players: 6,
      maxPlayers: 10,
      bots: 1,
      vac: 1,
      version: "1.40.2.0",
    });

    const info = parseA2SInfoResponse(buf);

    expect(info.hostname).toBe("My CS2 Server");
    expect(info.map).toBe("de_mirage");
    expect(info.players).toBe(6);
    expect(info.maxPlayers).toBe(10);
    expect(info.bots).toBe(1);
    expect(info.vac).toBe(true);
    expect(info.version).toBe("1.40.2.0");
    expect(info.serverType).toBe("d");
    expect(info.environment).toBe("l");
    expect(info.appId).toBe(730);
  });

  it("parses an insecure server", () => {
    const buf = buildFakeResponse({ vac: 0 });
    const info = parseA2SInfoResponse(buf);
    expect(info.vac).toBe(false);
  });

  it("parses a Windows listen server", () => {
    const buf = buildFakeResponse({
      serverType: "l",
      environment: "w",
    });
    const info = parseA2SInfoResponse(buf);
    expect(info.serverType).toBe("l");
    expect(info.environment).toBe("w");
  });

  it("parses visibility (private server)", () => {
    const buf = buildFakeResponse({ visibility: 1 });
    const info = parseA2SInfoResponse(buf);
    expect(info.visibility).toBe(true);
  });

  it("handles unicode server names", () => {
    const buf = buildFakeResponse({ hostname: "Server \u2605" });
    const info = parseA2SInfoResponse(buf);
    expect(info.hostname).toBe("Server \u2605");
  });

  it("handles empty strings", () => {
    const buf = buildFakeResponse({
      hostname: "",
      map: "",
      folder: "",
      game: "",
      version: "",
    });
    const info = parseA2SInfoResponse(buf);
    expect(info.hostname).toBe("");
    expect(info.map).toBe("");
  });
});

// ---------------------------------------------------------------------------
// queryA2SInfo (integration with mocked dgram socket)
// ---------------------------------------------------------------------------

describe("queryA2SInfo", () => {
  let mockSocket: {
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    _handlers: Record<string, ((...args: unknown[]) => void)[]>;
    _emit: (event: string, ...args: unknown[]) => void;
  };

  beforeEach(() => {
    mockSocket = {
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      _handlers: {},
      _emit(event: string, ...args: unknown[]) {
        for (const h of this._handlers[event] || []) h(...args);
      },
    };

    // Capture handlers
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!mockSocket._handlers[event]) mockSocket._handlers[event] = [];
      mockSocket._handlers[event].push(handler);
    });

    vi.spyOn(dgram, "createSocket").mockReturnValue(mockSocket as unknown as dgram.Socket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Build a minimal valid S2A_INFO_SRC buffer. */
  function buildResponse(): Buffer {
    const parts: Buffer[] = [];
    parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49]));
    parts.push(Buffer.from([17])); // protocol
    const str = (s: string) => Buffer.from(s + "\0", "utf8");
    parts.push(str("TestServer"));
    parts.push(str("de_dust2"));
    parts.push(str("csgo"));
    parts.push(str("CS2"));
    const appId = Buffer.alloc(2);
    appId.writeUInt16LE(730);
    parts.push(appId);
    parts.push(Buffer.from([4, 10, 0, 0x64, 0x6c, 0, 1]));
    parts.push(str("1.40.0.0"));
    return Buffer.concat(parts);
  }

  it("resolves with parsed info on a direct response", async () => {
    const promise = queryA2SInfo("127.0.0.1", 27015, 2000);

    // Simulate a direct response (no challenge)
    const response = buildResponse();
    mockSocket._emit("message", response);

    const info = await promise;
    expect(info.hostname).toBe("TestServer");
    expect(info.map).toBe("de_dust2");
    expect(info.players).toBe(4);
    expect(info.maxPlayers).toBe(10);
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("handles the challenge/response flow", async () => {
    const promise = queryA2SInfo("127.0.0.1", 27015, 2000);

    // First response: challenge
    const challengeResponse = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 0xaa, 0xbb, 0xcc, 0xdd]);
    mockSocket._emit("message", challengeResponse);

    // Verify it re-sent with challenge
    expect(mockSocket.send).toHaveBeenCalledTimes(2); // initial + retry

    // Now send the real response
    const response = buildResponse();
    mockSocket._emit("message", response);

    const info = await promise;
    expect(info.hostname).toBe("TestServer");
  });

  it("rejects on timeout", async () => {
    const promise = queryA2SInfo("127.0.0.1", 27015, 50);

    await expect(promise).rejects.toThrow("timed out");
  });

  it("rejects on socket error", async () => {
    const promise = queryA2SInfo("127.0.0.1", 27015, 2000);

    mockSocket._emit("error", new Error("ECONNREFUSED"));

    await expect(promise).rejects.toThrow("ECONNREFUSED");
  });

  it("ignores packets that are too short", async () => {
    const promise = queryA2SInfo("127.0.0.1", 27015, 200);

    // Send a too-short packet — should be ignored
    mockSocket._emit("message", Buffer.from([0xff, 0xff]));

    // Then timeout since no valid response was received
    await expect(promise).rejects.toThrow("timed out");
  });
});
