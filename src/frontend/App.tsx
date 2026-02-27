import React, { useEffect, useRef, useState, useCallback } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Console from "./components/Console";
import { ConsoleLine, ServerHistory, WebSocketMessage } from "./types";

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [history, setHistory] = useState<ServerHistory[]>([]);
  const ws = useRef<WebSocket | null>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rcon_history");
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  const addLine = useCallback((content: string, type: ConsoleLine["type"]) => {
    setConsoleLines((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), type, content },
    ]);
  }, []);

  const handleConnect = (host: string, port: string, password: string) => {
    if (!host) {
      addLine("Please enter a server host/IP.", "error");
      return;
    }
    if (!password) {
      addLine("Please enter the RCON password.", "error");
      return;
    }

    if (ws.current) {
      ws.current.close();
    }

    // Determine protocol: if https -> wss, if http -> ws
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev, vite proxy handles /ws or we can connect directly to port 3000 if not proxying
    // We configured proxy in vite.config.ts, so we can connect to current host
    const wsUrl = `${protocol}//${window.location.host}`;

    addLine(`Connecting to ${host}:${port}...`, "system");

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      addLine("WebSocket connected to backend.", "system");
      ws.current?.send(
        JSON.stringify({ type: "connect", host, port, password }),
      );
    };

    ws.current.onmessage = (event) => {
      let msg: WebSocketMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "connected":
          setConnected(true);
          addLine(msg.message || "Connected", "info");
          saveToHistory(host, port);
          break;
        case "disconnected":
          setConnected(false);
          addLine("Disconnected from server.", "info");
          break;
        case "response":
          addLine(msg.command || "", "cmd");
          if (msg.body && msg.body.trim()) {
            addLine(msg.body, "response");
          }
          break;
        case "error":
          addLine(msg.message || "Error", "error");
          break;
      }
    };

    ws.current.onclose = () => {
      if (connected) {
        setConnected(false);
        addLine("WebSocket connection lost.", "error");
      }
    };
  };

  const handleDisconnect = () => {
    if (ws.current) {
      ws.current.send(JSON.stringify({ type: "disconnect" }));
      // We also close locally to be sure
      // ws.current.close();
      // Actually let backend confirm disconnect or just let it close
    }
  };

  const handleCommand = (cmd: string) => {
    if (!connected || !ws.current) {
      addLine("Not connected.", "error");
      return;
    }
    ws.current.send(JSON.stringify({ type: "command", command: cmd }));
  };

  const saveToHistory = (host: string, port: string) => {
    const key = `${host}:${port}`;
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.key !== key);
      const newHistory = [
        { key, host, port, date: Date.now() },
        ...filtered,
      ].slice(0, 10);
      localStorage.setItem("rcon_history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const removeFromHistory = (key: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((h) => h.key !== key);
      localStorage.setItem("rcon_history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  return (
    <>
      <Header connected={connected} />
      <div className="main">
        <Sidebar
          connected={connected}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onCommand={handleCommand}
          history={history}
          onLoadHistory={(h, p) => {
            /* Handled in Sidebar state */
          }}
          onRemoveHistory={removeFromHistory}
        />
        <Console
          lines={consoleLines}
          onCommand={handleCommand}
          onClear={() => setConsoleLines([])}
          connected={connected}
        />
      </div>
    </>
  );
};

export default App;
