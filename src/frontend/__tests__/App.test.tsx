import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";
import React from "react";

// Mock WebSocket
class MockWebSocket {
  send = vi.fn();
  close = vi.fn();
  onopen = vi.fn();
  onmessage = vi.fn();
  onclose = vi.fn();
  onerror = vi.fn();

  constructor(url: string) {
    // constructor logic if needed
  }
}

global.WebSocket = MockWebSocket as any;

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header and sidebar", () => {
    render(<App />);
    expect(screen.getByText(/CS2 RCON/i)).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
  });

  it("connect button triggers websocket connection", () => {
    render(<App />);
    const hostInput = screen.getByPlaceholderText("127.0.0.1");
    const passInput = screen.getByPlaceholderText("••••••••");
    const connectBtn = screen.getByText("Connect");

    // Simulate input
    fireEvent.change(hostInput, { target: { value: "127.0.0.1" } });
    fireEvent.change(passInput, { target: { value: "password" } });

    // Create a spy on the WebSocket constructor to verify it was called
    const wsSpy = vi.spyOn(global, "WebSocket");

    fireEvent.click(connectBtn);

    expect(wsSpy).toHaveBeenCalled();
  });

  it("displays error if host or password missing", () => {
    render(<App />);
    const connectBtn = screen.getByText("Connect");
    fireEvent.click(connectBtn);

    // Should see error in console output
    expect(
      screen.getByText("Please enter a server host/IP."),
    ).toBeInTheDocument();
  });
});
