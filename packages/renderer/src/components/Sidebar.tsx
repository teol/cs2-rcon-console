import { useState, useRef } from "react";
import { quickCommands } from "../commands.ts";

interface SidebarProps {
  connected: boolean;
  serverHistory: { key: string; host: string; port: string }[];
  onConnect: (host: string, port: string, password: string) => void;
  onDisconnect: () => void;
  onCommand: (cmd: string) => void;
  onRemoveHistory: (key: string) => void;
}

export function Sidebar({
  connected,
  serverHistory,
  onConnect,
  onDisconnect,
  onCommand,
  onRemoveHistory,
}: SidebarProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("27015");
  const [password, setPassword] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(["Match Control"]));
  const passwordRef = useRef<HTMLInputElement>(null);

  function toggleConnection() {
    if (connected) {
      onDisconnect();
    } else {
      onConnect(host.trim(), port.trim() || "27015", password);
    }
  }

  function toggleCategory(label: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function loadServer(h: string, p: string) {
    setHost(h);
    setPort(p);
    passwordRef.current?.focus();
  }

  return (
    <aside className="sidebar">
      {/* Connection */}
      <div className="sidebar-section">
        <div className="sidebar-title">Connection</div>
        <div className="connect-form">
          <div className="input-row">
            <div className="input-group">
              <label>Host / IP</label>
              <input
                type="text"
                placeholder="127.0.0.1"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Port</label>
              <input
                type="number"
                placeholder="27015"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>
          <div className="input-group">
            <label>RCON Password</label>
            <input
              ref={passwordRef}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") toggleConnection();
              }}
            />
          </div>
          <button
            className={`btn btn-connect${connected ? " disconnect" : ""}`}
            onClick={toggleConnection}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>

      {/* Server History */}
      <div className="sidebar-section">
        <div className="sidebar-title">Server History</div>
        <div className="history-list">
          {serverHistory.length === 0 ? (
            <div className="history-empty">No servers yet</div>
          ) : (
            serverHistory.map((h) => (
              <div key={h.key} className="history-item" onClick={() => loadServer(h.host, h.port)}>
                <span>{h.key}</span>
                <button
                  className="history-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveHistory(h.key);
                  }}
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Commands */}
      <div className="sidebar-section">
        <div className="sidebar-title">Quick Commands</div>
        {quickCommands.map((cat) => {
          const isOpen = openCategories.has(cat.label);
          return (
            <div key={cat.label}>
              <div
                className={`cmd-category${isOpen ? " open" : ""}`}
                onClick={() => toggleCategory(cat.label)}
              >
                {cat.label}
              </div>
              <div className={`cmd-group${isOpen ? " open" : ""}`}>
                <ul className="cmd-list">
                  {cat.commands.map((c) => (
                    <li key={c.command} className="cmd-item" onClick={() => onCommand(c.command)}>
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
