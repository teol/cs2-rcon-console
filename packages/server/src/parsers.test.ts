import { describe, it, expect } from "vitest";
import { parseStatus, parseStats } from "./parsers.js";

// ---------------------------------------------------------------------------
// parseStatus
// ---------------------------------------------------------------------------

describe("parseStatus", () => {
  const FULL_CS2_STATUS = `hostname: My CS2 Server
version : 1.40.1.0/13994 1373/8948 secure
os      :  Linux
type    :  community dedicated
map     : de_dust2
gotv    :  port 27020, delay 90.0s
players : 8 humans, 2 bots (10/0 max) (not hibernating)

# userid name uniqueid connected ping loss state rate adr
#  2 1 "Alice" STEAM_1:0:12345678 04:23 45 0 active 786432 1.2.3.4:27005
#  3 2 "Bob" STEAM_1:1:87654321 01:15 12 0 active 786432 10.0.0.1:27005`;

  it("parses hostname", () => {
    const { server } = parseStatus(FULL_CS2_STATUS);
    expect(server.hostname).toBe("My CS2 Server");
  });

  it("parses version and detects secure flag", () => {
    const { server } = parseStatus(FULL_CS2_STATUS);
    expect(server.version).toBe("1.40.1.0");
    expect(server.secure).toBe(true);
  });

  it("parses map", () => {
    const { server } = parseStatus(FULL_CS2_STATUS);
    expect(server.map).toBe("de_dust2");
  });

  it("parses server type", () => {
    const { server } = parseStatus(FULL_CS2_STATUS);
    expect(server.type).toBe("community dedicated");
  });

  it("parses player counts", () => {
    const { server } = parseStatus(FULL_CS2_STATUS);
    expect(server.players).toBe(8);
    expect(server.bots).toBe(2);
    expect(server.maxPlayers).toBe(10);
  });

  it("parses CS2 player lines (userid slot name steamid)", () => {
    const { players } = parseStatus(FULL_CS2_STATUS);
    expect(players).toHaveLength(2);
    expect(players[0]).toEqual({
      userid: 2,
      name: "Alice",
      steamId: "STEAM_1:0:12345678",
      connected: "04:23",
      ping: 45,
      loss: 0,
      state: "active",
    });
    expect(players[1]).toEqual({
      userid: 3,
      name: "Bob",
      steamId: "STEAM_1:1:87654321",
      connected: "01:15",
      ping: 12,
      loss: 0,
      state: "active",
    });
  });

  it("parses Source 1 player lines (no slot number)", () => {
    const src1 = `hostname: OldServer
version : 1.39.9.4 secure
map     : de_inferno
players : 1 human, 0 bots (12/0 max)

#  5 "Charlie" STEAM_0:0:99999 02:30:15 88 1 active 196608`;

    const { players } = parseStatus(src1);
    expect(players).toHaveLength(1);
    expect(players[0].userid).toBe(5);
    expect(players[0].name).toBe("Charlie");
    expect(players[0].steamId).toBe("STEAM_0:0:99999");
    expect(players[0].ping).toBe(88);
    expect(players[0].loss).toBe(1);
  });

  it("handles SteamID3 format [U:1:12345]", () => {
    const raw = `hostname: Test
# 10 "Dave" [U:1:12345] 00:05 20 0 active`;

    const { players } = parseStatus(raw);
    expect(players).toHaveLength(1);
    expect(players[0].steamId).toBe("[U:1:12345]");
  });

  it("detects insecure server", () => {
    const raw = `version : 1.40.0.0/13900 1300/8000 insecure`;
    const { server } = parseStatus(raw);
    expect(server.secure).toBe(false);
  });

  it("returns empty results for empty input", () => {
    const { server, players } = parseStatus("");
    expect(Object.keys(server)).toHaveLength(0);
    expect(players).toHaveLength(0);
  });

  it("returns empty results for garbage input", () => {
    const { server, players } = parseStatus("some random text\nnothing useful here");
    expect(players).toHaveLength(0);
  });

  it("handles 1 human singular form", () => {
    const raw = `players : 1 human, 0 bot (16/0 max)`;
    const { server } = parseStatus(raw);
    expect(server.players).toBe(1);
    expect(server.bots).toBe(0);
    expect(server.maxPlayers).toBe(16);
  });

  it("handles player names with special characters", () => {
    const raw = `# 7 1 "Player [TAG] (123)" STEAM_1:0:11111 00:10 30 0 active 786432 1.2.3.4:27005`;
    const { players } = parseStatus(raw);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Player [TAG] (123)");
  });
});

// ---------------------------------------------------------------------------
// parseStats
// ---------------------------------------------------------------------------

describe("parseStats", () => {
  it("parses standard stats output", () => {
    const raw = `CPU    NetIn   NetOut    Uptime  Maps   FPS   Players  Svms    +-ms   ~tick
 10.5    1.2     0.8       5      2   128.00     8      1.50   0.20   0.05`;

    const result = parseStats(raw);
    expect(result.cpu).toBeCloseTo(10.5);
    expect(result.fps).toBeCloseTo(128.0);
  });

  it("parses stats with zero values", () => {
    const raw = `CPU    NetIn   NetOut    Uptime  Maps   FPS   Players  Svms    +-ms   ~tick
  0.0    0.0     0.0       1      1    64.00     0      0.00   0.00   0.00`;

    const result = parseStats(raw);
    expect(result.cpu).toBe(0);
    expect(result.fps).toBe(64);
  });

  it("returns zeros for empty input", () => {
    expect(parseStats("")).toEqual({ fps: 0, cpu: 0 });
  });

  it("returns zeros for unparseable input", () => {
    expect(parseStats("some garbage text")).toEqual({ fps: 0, cpu: 0 });
  });

  it("skips the header line and only parses data", () => {
    const raw = `CPU    NetIn   NetOut    Uptime  Maps   FPS   Players  Svms    +-ms   ~tick
 25.3    3.4     2.1       10     3   128.50     4      2.00   0.50   0.10`;

    const result = parseStats(raw);
    expect(result.cpu).toBeCloseTo(25.3);
    expect(result.fps).toBeCloseTo(128.5);
  });

  it("handles reordered columns", () => {
    const raw = `FPS   NetIn   CPU    NetOut    Uptime  Maps   Players  Svms    +-ms   ~tick
128.00    1.2   10.5     0.8       5      2        8      1.50   0.20   0.05`;

    const result = parseStats(raw);
    expect(result.fps).toBeCloseTo(128.0);
    expect(result.cpu).toBeCloseTo(10.5);
  });

  it("handles extra columns added between CPU and FPS", () => {
    const raw = `CPU    NetIn   NetOut   Extra   Uptime  Maps   FPS   Players
 15.0    1.0     0.5      42       3      1   64.00     2`;

    const result = parseStats(raw);
    expect(result.cpu).toBeCloseTo(15.0);
    expect(result.fps).toBeCloseTo(64.0);
  });

  it("returns zeros when header exists but no data line follows", () => {
    const raw = `CPU    NetIn   NetOut    Uptime  Maps   FPS   Players`;
    expect(parseStats(raw)).toEqual({ fps: 0, cpu: 0 });
  });

  it("handles header without FPS column", () => {
    const raw = `CPU    NetIn   NetOut    Uptime
 10.0    0.0     0.0       1`;

    const result = parseStats(raw);
    expect(result.cpu).toBeCloseTo(10.0);
    expect(result.fps).toBe(0);
  });

  it("skips leading blank lines before header", () => {
    const raw = `

CPU    NetIn   NetOut    Uptime  Maps   FPS   Players
 5.0    0.0     0.0       1      1   128.00     0`;

    const result = parseStats(raw);
    expect(result.cpu).toBeCloseTo(5.0);
    expect(result.fps).toBeCloseTo(128.0);
  });
});
