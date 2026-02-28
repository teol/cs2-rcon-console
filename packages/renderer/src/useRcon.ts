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

// Inactivity timeout: 15 minutes total, warning shown 60 seconds before
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;

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
  const lineId = useRef(2);
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: 0, text: "CS2 Web RCON Console v2.0.0", type: "system" },
    { id: 1, text: "Enter server details and connect to begin.", type: "system" },
  ]);
  const [serverHistory, setServerHistory] = useState<HistoryEntry[]>(loadHistory);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [inactivitySecondsLeft, setInactivitySecondsLeft] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const clearInactivityTimers = useCallback(() => {
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current !== null) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setInactivityWarning(false);
  }, []);

  const startInactivityTimers = useCallback(
    (logFn: (text: string, type: LineType) => void) => {
      clearInactivityTimers();

      const warningDelay = INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS;

      warningTimerRef.current = setTimeout(() => {
        setInactivityWarning(true);
        setInactivitySecondsLeft(WARNING_BEFORE_MS / 1000);

        countdownIntervalRef.current = setInterval(() => {
          setInactivitySecondsLeft((prev) => {
            if (prev <= 1) return 0;
            return prev - 1;
          });
        }, 1000);

        logoutTimerRef.current = setTimeout(() => {
          if (connectedRef.current) {
            wsRef.current?.send(JSON.stringify({ type: "disconnect" }));
            logFn("Session auto-disconnected due to inactivity.", "info");
            clearInactivityTimers();
          }
        }, WARNING_BEFORE_MS);
      }, warningDelay);
    },
    [clearInactivityTimers],
  );

  const resetInactivity = useCallback(() => {
    if (connectedRef.current) {
      startInactivityTimers(log);
    }
  }, [startInactivityTimers, log]);

  // Start/stop inactivity timers based on connection state
  useEffect(() => {
    if (connected) {
      startInactivityTimers(log);
    } else {
      clearInactivityTimers();
    }
    // clearInactivityTimers is stable; startInactivityTimers is stable.
    // log is stable. connected is the only varying dep.
  }, [connected, startInactivityTimers, clearInactivityTimers, log]);

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
      resetInactivity();
    },
    [log, resetInactivity],
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
    inactivityWarning,
    inactivitySecondsLeft,
    log,
    clearConsole,
    connectToServer,
    disconnect,
    sendCommand,
    removeFromHistory,
    resetInactivity,
  };
}
