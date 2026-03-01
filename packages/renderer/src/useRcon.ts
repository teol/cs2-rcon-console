import { useState, useEffect, useRef, useCallback } from "react";
import type { ServerInfo, PlayerInfo } from "@cs2-rcon/shared";

export type { ServerInfo, PlayerInfo };

export type LineType = "system" | "info" | "cmd" | "response" | "error" | "log";

export interface ConsoleLine {
  id: number;
  text: string;
  type: LineType;
  timestamp: number;
}

interface HistoryEntry {
  key: string;
  host: string;
  port: string;
  date: number;
}

export const MAX_CONSOLE_LINES = 1000;
const MAX_SPARKLINE_POINTS = 30;
const AUTO_REFRESH_KEY = "rcon_auto_refresh";
const SHOW_TIMESTAMPS_KEY = "rcon_show_timestamps";
const LOG_STREAMING_KEY = "rcon_log_streaming";

const HISTORY_KEY = "rcon_history";

// Inactivity timeout: 15 minutes total, warning shown 60 seconds before
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;

/** Format a timestamp (Date.now() value) as HH:MM:SS. */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

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

/** Trim lines array to the maximum, keeping the most recent entries. */
function trimLines(lines: ConsoleLine[]): ConsoleLine[] {
  if (lines.length <= MAX_CONSOLE_LINES) return lines;
  return lines.slice(lines.length - MAX_CONSOLE_LINES);
}

export function useRcon() {
  const lineId = useRef(2);
  const now = Date.now();
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: 0, text: "CS2 Web RCON Console v2.0.0", type: "system", timestamp: now },
    { id: 1, text: "Enter server details and connect to begin.", type: "system", timestamp: now },
  ]);
  const [serverHistory, setServerHistory] = useState<HistoryEntry[]>(loadHistory);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [inactivitySecondsLeft, setInactivitySecondsLeft] = useState(0);
  const [serverStatus, setServerStatus] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const [playerCountHistory, setPlayerCountHistory] = useState<number[]>([]);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(() => {
    const value = parseInt(localStorage.getItem(AUTO_REFRESH_KEY) ?? "invalid", 10);
    return isNaN(value) ? 5 : value;
  });
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() => {
    return localStorage.getItem(SHOW_TIMESTAMPS_KEY) === "true";
  });
  const [logStreaming, setLogStreaming] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((text: string, type: LineType = "system") => {
    setLines((prev) =>
      trimLines([...prev, { id: lineId.current++, text, type, timestamp: Date.now() }]),
    );
  }, []);

  const clearConsole = useCallback(() => {
    setLines([
      { id: lineId.current++, text: "Console cleared.", type: "system", timestamp: Date.now() },
    ]);
  }, []);

  const toggleTimestamps = useCallback(() => {
    setShowTimestamps((prev) => {
      const next = !prev;
      localStorage.setItem(SHOW_TIMESTAMPS_KEY, String(next));
      return next;
    });
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

  const startInactivityTimers = useCallback(() => {
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
          log("Session auto-disconnected due to inactivity.", "info");
          clearInactivityTimers();
        }
      }, WARNING_BEFORE_MS);
    }, warningDelay);
  }, [clearInactivityTimers, log]);

  const resetInactivity = useCallback(() => {
    if (connectedRef.current) {
      startInactivityTimers();
    }
  }, [startInactivityTimers]);

  // Start/stop inactivity timers based on connection state
  useEffect(() => {
    if (connected) {
      startInactivityTimers();
    } else {
      clearInactivityTimers();
    }
    // clearInactivityTimers and startInactivityTimers are stable.
    // connected is the only varying dep.
  }, [connected, startInactivityTimers, clearInactivityTimers]);

  // Reset inactivity timer on any global user interaction while connected
  useEffect(() => {
    if (!connected) return;

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    function handleActivity() {
      if (throttleTimer !== null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        resetInactivity();
      }, 500);
    }

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);

    return () => {
      if (throttleTimer !== null) clearTimeout(throttleTimer);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
    };
  }, [connected, resetInactivity]);

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
              setLogStreaming(false);
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
            case "server_status":
              setServerStatus(msg.server);
              if (typeof msg.server.fps === "number") {
                setFpsHistory((prev) => [...prev, msg.server.fps].slice(-MAX_SPARKLINE_POINTS));
              }
              if (typeof msg.server.players === "number") {
                setPlayerCountHistory((prev) =>
                  [...prev, msg.server.players].slice(-MAX_SPARKLINE_POINTS),
                );
              }
              break;
            case "player_list":
              setPlayers(msg.players);
              break;
            case "log_event":
              log(msg.event.message, "log");
              break;
            case "log_streaming":
              setLogStreaming(msg.enabled);
              log(msg.message, "info");
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
          log("Received malformed message from server.", "error");
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setLogStreaming(false);
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

  const requestStatus = useCallback(() => {
    if (!connectedRef.current || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "request_status" }));
  }, []);

  const updateAutoRefreshInterval = useCallback((seconds: number) => {
    setAutoRefreshInterval(seconds);
    localStorage.setItem(AUTO_REFRESH_KEY, String(seconds));
  }, []);

  const toggleLogStreaming = useCallback(() => {
    if (!connectedRef.current || !wsRef.current) {
      log("Not connected.", "error");
      return;
    }
    const type = logStreaming ? "disable_logs" : "enable_logs";
    wsRef.current.send(JSON.stringify({ type }));
  }, [logStreaming, log]);

  // Auto-enable log streaming on connect if previously enabled
  useEffect(() => {
    if (connected && localStorage.getItem(LOG_STREAMING_KEY) === "true" && wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "enable_logs" }));
    }
  }, [connected]);

  // Persist log streaming preference
  useEffect(() => {
    localStorage.setItem(LOG_STREAMING_KEY, String(logStreaming));
  }, [logStreaming]);

  // Auto-refresh status when connected
  useEffect(() => {
    if (connected && autoRefreshInterval > 0) {
      // Initial fetch
      requestStatus();
      autoRefreshRef.current = setInterval(requestStatus, autoRefreshInterval * 1000);
    }

    if (!connected) {
      setServerStatus(null);
      setPlayers([]);
      setFpsHistory([]);
      setPlayerCountHistory([]);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [connected, autoRefreshInterval, requestStatus]);

  return {
    connected,
    lines,
    serverHistory,
    commandHistory,
    inactivityWarning,
    inactivitySecondsLeft,
    serverStatus,
    players,
    fpsHistory,
    playerCountHistory,
    autoRefreshInterval,
    showTimestamps,
    logStreaming,
    log,
    clearConsole,
    connectToServer,
    disconnect,
    sendCommand,
    removeFromHistory,
    resetInactivity,
    requestStatus,
    updateAutoRefreshInterval,
    toggleTimestamps,
    toggleLogStreaming,
  };
}
