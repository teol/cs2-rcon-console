import React, { useState } from "react";
import ConnectionForm from "./ConnectionForm";
import { ServerHistory } from "../types";

interface SidebarProps {
  connected: boolean;
  onConnect: (host: string, port: string, pass: string) => void;
  onDisconnect: () => void;
  onCommand: (cmd: string) => void;
  history: ServerHistory[];
  onLoadHistory: (host: string, port: string) => void;
  onRemoveHistory: (key: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  connected,
  onConnect,
  onDisconnect,
  onCommand,
  history,
  onLoadHistory,
  onRemoveHistory,
}) => {
  const [openCategories, setOpenCategories] = useState<string[]>([
    "Match Control",
  ]);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("27015");

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const handleLoadHistory = (h: string, p: string) => {
    setHost(h);
    setPort(p);
  };

  const renderCommandGroup = (
    title: string,
    commands: { label: string; cmd: string }[],
  ) => {
    const isOpen = openCategories.includes(title);
    return (
      <>
        <div
          className={`cmd-category ${isOpen ? "open" : ""}`}
          onClick={() => toggleCategory(title)}
        >
          {title}
        </div>
        <div className={`cmd-group ${isOpen ? "open" : ""}`}>
          <ul className="cmd-list">
            {commands.map((c, i) => (
              <li key={i} className="cmd-item" onClick={() => onCommand(c.cmd)}>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  };

  return (
    <aside className="sidebar">
      {/* Connection */}
      <div className="sidebar-section">
        <div className="sidebar-title">Connection</div>
        <ConnectionForm
          connected={connected}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          initialHost={host}
          initialPort={port}
        />
      </div>

      {/* Server History */}
      <div className="sidebar-section">
        <div className="sidebar-title">Server History</div>
        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">No servers yet</div>
          ) : (
            history.map((h) => (
              <div
                key={h.key}
                className="history-item"
                onClick={() => handleLoadHistory(h.host, h.port)}
              >
                <span>{h.key}</span>
                <span
                  className="history-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveHistory(h.key);
                  }}
                >
                  ×
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Commands */}
      <div className="sidebar-section">
        <div className="sidebar-title">Quick Commands</div>

        {renderCommandGroup("Match Control", [
          { label: "mp_restartgame 1", cmd: "mp_restartgame 1" },
          { label: "mp_pause_match", cmd: "mp_pause_match" },
          { label: "mp_unpause_match", cmd: "mp_unpause_match" },
          { label: "mp_warmup_start", cmd: "mp_warmup_start" },
          { label: "mp_warmup_end", cmd: "mp_warmup_end" },
          { label: "mp_scrambleteams", cmd: "mp_scrambleteams" },
          { label: "mp_swapteams", cmd: "mp_swapteams" },
        ])}

        {renderCommandGroup("Maps", [
          { label: "de_ancient", cmd: "changelevel de_ancient" },
          { label: "de_anubis", cmd: "changelevel de_anubis" },
          { label: "de_dust2", cmd: "changelevel de_dust2" },
          { label: "de_inferno", cmd: "changelevel de_inferno" },
          { label: "de_mirage", cmd: "changelevel de_mirage" },
          { label: "de_nuke", cmd: "changelevel de_nuke" },
          { label: "de_overpass", cmd: "changelevel de_overpass" },
          { label: "de_vertigo", cmd: "changelevel de_vertigo" },
        ])}

        {renderCommandGroup("Cvars", [
          { label: "mp_warmup_pausetimer 1", cmd: "mp_warmup_pausetimer 1" },
          { label: "mp_warmup_pausetimer 0", cmd: "mp_warmup_pausetimer 0" },
          {
            label: "mp_damage_headshot_only 1",
            cmd: "mp_damage_headshot_only 1",
          },
          {
            label: "mp_damage_headshot_only 0",
            cmd: "mp_damage_headshot_only 0",
          },
          { label: "sv_cheats 1", cmd: "sv_cheats 1" },
          { label: "sv_cheats 0", cmd: "sv_cheats 0" },
        ])}

        {renderCommandGroup("Server Info", [
          { label: "status", cmd: "status" },
          { label: "users", cmd: "users" },
          { label: "maps *", cmd: "maps *" },
          { label: "cvarlist", cmd: "cvarlist" },
        ])}
      </div>
    </aside>
  );
};

export default Sidebar;
