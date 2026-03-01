import { describe, it, expect, vi } from "vitest";
import { send, type ServerMessage } from "./index.js";

// ---------------------------------------------------------------------------
// send() helper
// ---------------------------------------------------------------------------

describe("send", () => {
  it("serialises the message as JSON and calls ws.send", () => {
    const ws = { send: vi.fn() };
    const msg: ServerMessage = { type: "connected", message: "ok" };

    send(ws, msg);

    expect(ws.send).toHaveBeenCalledOnce();
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual(msg);
  });

  it("serialises error messages", () => {
    const ws = { send: vi.fn() };
    const msg: ServerMessage = { type: "error", message: "boom" };

    send(ws, msg);

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({ type: "error", message: "boom" });
  });

  it("serialises response messages with command and body", () => {
    const ws = { send: vi.fn() };
    const msg: ServerMessage = { type: "response", command: "status", body: "players: 0" };

    send(ws, msg);

    const parsed = JSON.parse(ws.send.mock.calls[0][0]);
    expect(parsed.type).toBe("response");
    expect(parsed.command).toBe("status");
    expect(parsed.body).toBe("players: 0");
  });

  it("serialises disconnected messages", () => {
    const ws = { send: vi.fn() };

    send(ws, { type: "disconnected" });

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({ type: "disconnected" });
  });

  it("serialises log_event messages", () => {
    const ws = { send: vi.fn() };
    const event = {
      timestamp: "03/01/2024 - 12:34:56",
      category: "kill" as const,
      message: "Player killed Victim with ak47",
      raw: 'L 03/01/2024 - 12:34:56: "Player" killed "Victim" with "ak47"',
    };
    const msg: ServerMessage = { type: "log_event", event };

    send(ws, msg);

    const parsed = JSON.parse(ws.send.mock.calls[0][0]);
    expect(parsed.type).toBe("log_event");
    expect(parsed.event.category).toBe("kill");
    expect(parsed.event.message).toBe("Player killed Victim with ak47");
  });

  it("serialises log_streaming messages", () => {
    const ws = { send: vi.fn() };
    const msg: ServerMessage = {
      type: "log_streaming",
      enabled: true,
      message: "Log streaming enabled",
    };

    send(ws, msg);

    const parsed = JSON.parse(ws.send.mock.calls[0][0]);
    expect(parsed.type).toBe("log_streaming");
    expect(parsed.enabled).toBe(true);
    expect(parsed.message).toBe("Log streaming enabled");
  });
});
