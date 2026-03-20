import { describe, it, expect } from "vitest";
import { parseLogLine } from "./log-parser.js";

describe("parseLogLine", () => {
  // ─── Timestamp extraction ───

  it("extracts the timestamp from a standard log line", () => {
    const event = parseLogLine(
      'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" say "hello"',
    );
    expect(event.timestamp).toBe("03/01/2024 - 12:34:56");
  });

  it("returns an empty timestamp when the log line has no L-prefix", () => {
    const event = parseLogLine("some random text");
    expect(event.timestamp).toBe("");
    expect(event.category).toBe("other");
  });

  // ─── Kill events ───

  it("parses a kill event", () => {
    const raw =
      'L 03/01/2024 - 12:34:56: "Attacker<2><STEAM_0:0:111><CT>" [100 200 300] killed "Victim<3><STEAM_0:0:222><TERRORIST>" [400 500 600] with "ak47"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("kill");
    expect(event.message).toBe("Attacker [CT] killed Victim [TERRORIST] with ak47");
    expect(event.raw).toBe(raw);
  });

  it("parses a headshot kill event", () => {
    const raw =
      'L 03/01/2024 - 12:34:56: "Attacker<2><STEAM_0:0:111><CT>" [100 200 300] killed "Victim<3><STEAM_0:0:222><TERRORIST>" [400 500 600] with "ak47" (headshot)';
    const event = parseLogLine(raw);
    expect(event.category).toBe("kill");
    expect(event.message).toBe("Attacker [CT] killed Victim [TERRORIST] with ak47 (headshot)");
  });

  // ─── Chat events ───

  it("parses a say chat message", () => {
    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" say "hello world"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("chat");
    expect(event.message).toBe("Player [CT]: hello world");
  });

  it("parses a say_team chat message", () => {
    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><TERRORIST>" say_team "rush B"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("chat");
    expect(event.message).toBe("[TEAM] Player [TERRORIST]: rush B");
  });

  it("handles chat from a player with no team", () => {
    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><>" say "hi"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("chat");
    expect(event.message).toBe("Player: hi");
  });

  // ─── Connection events ───

  it("parses a player connection", () => {
    const raw =
      'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><>" connected, address "1.2.3.4:27005"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("connection");
    expect(event.message).toBe("Player connected (STEAM_0:0:123) from 1.2.3.4:27005");
  });

  it("parses a player entering the game", () => {
    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><>" entered the game';
    const event = parseLogLine(raw);
    expect(event.category).toBe("connection");
    expect(event.message).toBe("Player entered the game");
  });

  // ─── Disconnection events ───

  it("parses a player disconnection", () => {
    const raw =
      'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" disconnected (reason "Disconnect")';
    const event = parseLogLine(raw);
    expect(event.category).toBe("disconnection");
    expect(event.message).toBe("Player disconnected (Disconnect)");
  });

  it("parses a kick disconnection", () => {
    const raw =
      'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" disconnected (reason "Kicked by Console")';
    const event = parseLogLine(raw);
    expect(event.category).toBe("disconnection");
    expect(event.message).toBe("Player disconnected (Kicked by Console)");
  });

  // ─── Round events ───

  it("parses Round_Start", () => {
    const raw = 'L 03/01/2024 - 12:34:56: World triggered "Round_Start"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("round");
    expect(event.message).toBe("Round started");
  });

  it("parses Round_End", () => {
    const raw = 'L 03/01/2024 - 12:34:56: World triggered "Round_End"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("round");
    expect(event.message).toBe("Round ended");
  });

  it("parses team win trigger", () => {
    const raw = 'L 03/01/2024 - 12:34:56: Team "CT" triggered "SFUI_Notice_CTs_Win"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("round");
    expect(event.message).toBe("CT: SFUI_Notice_CTs_Win");
  });

  // ─── Other / fallback ───

  it("classifies unknown log lines as other", () => {
    const raw = 'L 03/01/2024 - 12:34:56: server_cvar: "mp_autoteambalance" "1"';
    const event = parseLogLine(raw);
    expect(event.category).toBe("other");
    expect(event.message).toBe('server_cvar: "mp_autoteambalance" "1"');
  });

  it("preserves the raw field for all events", () => {
    const raw = 'L 03/01/2024 - 12:34:56: "Player<2><STEAM_0:0:123><CT>" say "test"';
    const event = parseLogLine(raw);
    expect(event.raw).toBe(raw);
  });
});
