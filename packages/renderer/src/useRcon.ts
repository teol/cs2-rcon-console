import { useState, useEffect, useRef, useCallback } from "react";

export type LineType = "system" | "info" | "cmd" | "response" | "error";

export interface ConsoleLine {
  id: number;
  text: string;
  type: LineType;
}

interface HistoryEntry {
  key: string;
  host: string;
  port: string;
  date: number;
}

const HISTORY_KEY = "rcon_history";

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistHistory(history: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function useRcon() {
  const lineId = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: lineId.current++, text: "CS2 Web RCON Console v2.0.0", type: "system" },
    { id: lineId.current++, text: "Enter server details and connect to begin.", type: "system" },
  ]);
  const [serverHistory, setServerHistory] = useState<HistoryEntry[]>(loadHistory);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);

  const log = useCallback((text: string, type: LineType = "system") => {
    setLines((prev) => [...prev, { id: lineId.current++, text, type }]);
  }, []);

  const clearConsole = useCallback(() => {
    setLines([{ id: lineId.current++, text: "Console cleared.", type: "system" }]);
  }, []);

  // Keep connectedRef in sync
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  // WebSocket connection with exponential backoff
  useEffect(() => {
    let reconnectDelay = 1000;
    const MAX_RECONNECT_DELAY = 30000;

    function connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/ws`);

      ws.onopen = () => {
        reconnectDelay = 1000;
        log("WebSocket connected to backend.", "system");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "connected":
              setConnected(true);
              log(msg.message, "info");
              break;
            case "disconnected":
              setConnected(false);
              log("Disconnected from server.", "info");
              break;
            case "response":
              log(msg.command, "cmd");
              if (msg.body && msg.body.trim()) {
                log(msg.body, "response");
              }
              break;
            case "error":
              log(msg.message, "error");
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
          log("Received malformed message from server.", "error");
        }
      };

      ws.onclose = () => {
        setConnected(false);
        log(`WebSocket connection lost. Reconnecting in ${reconnectDelay / 1000}s...`, "error");
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      };

      ws.onerror = () => {
        log("WebSocket error.", "error");
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [log]);

  const connectToServer = useCallback(
    (host: string, port: string, password: string) => {
      if (!host) {
        log("Please enter a server host/IP.", "error");
        return;
      }
      if (!password) {
        log("Please enter the RCON password.", "error");
        return;
      }
      log(`Connecting to ${host}:${port}...`, "system");
      wsRef.current?.send(JSON.stringify({ type: "connect", host, port, password }));

      // Save to history
      const key = `${host}:${port}`;
      setServerHistory((prev) => {
        let next = prev.filter((h) => h.key !== key);
        next.unshift({ key, host, port, date: Date.now() });
        if (next.length > 10) next = next.slice(0, 10);
        persistHistory(next);
        return next;
      });
    },
    [log],
  );

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "disconnect" }));
  }, []);

  const sendCommand = useCallback(
    (cmd: string) => {
      if (!connectedRef.current || !wsRef.current) {
        log("Not connected.", "error");
        return;
      }
      wsRef.current.send(JSON.stringify({ type: "command", command: cmd }));
      setCommandHistory((prev) => {
        const next = [cmd, ...prev];
        if (next.length > 50) next.pop();
        return next;
      });
    },
    [log],
  );

  const removeFromHistory = useCallback((key: string) => {
    setServerHistory((prev) => {
      const next = prev.filter((h) => h.key !== key);
      persistHistory(next);
      return next;
    });
  }, []);

  return {
    connected,
    lines,
    serverHistory,
    commandHistory,
    log,
    clearConsole,
    connectToServer,
    disconnect,
    sendCommand,
    removeFromHistory,
  };
}
