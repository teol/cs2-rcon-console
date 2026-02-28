import { useState } from "react";
import type { PlayerInfo } from "../useRcon.ts";

interface PlayerTableProps {
  players: PlayerInfo[];
  maxPlayers: number;
  connected: boolean;
  onCommand: (cmd: string) => void;
}

interface DialogState {
  type: "kick" | "ban";
  player: PlayerInfo;
}

export function PlayerTable({ players, maxPlayers, connected, onCommand }: PlayerTableProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [kickReason, setKickReason] = useState("");
  const [banMinutes, setBanMinutes] = useState("30");

  if (!connected) return null;

  function openKickDialog(player: PlayerInfo) {
    setKickReason("");
    setDialog({ type: "kick", player });
  }

  function openBanDialog(player: PlayerInfo) {
    setBanMinutes("30");
    setDialog({ type: "ban", player });
  }

  function handleKickConfirm() {
    if (!dialog) return;
    const reason = kickReason.trim() || "Kicked by admin";
    onCommand(`kickid ${dialog.player.userid} "${reason}"`);
    setDialog(null);
  }

  function handleBanConfirm() {
    if (!dialog) return;
    const minutes = parseInt(banMinutes, 10) || 30;
    onCommand(`banid ${minutes} ${dialog.player.steamId}`);
    onCommand(`kickid ${dialog.player.userid} "Banned for ${minutes} minutes"`);
    setDialog(null);
  }

  function closeDialog() {
    setDialog(null);
  }

  function getPingClass(ping: number) {
    if (ping <= 50) return "ping-good";
    if (ping <= 100) return "ping-medium";
    return "ping-high";
  }

  return (
    <>
      <div className="player-table-panel">
        <div className="player-table-header">
          <div className="player-table-title">
            <span className="player-table-icon">&#9823;</span>
            Players
            <span className="player-table-count">
              ({players.length}/{maxPlayers})
            </span>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="player-table-empty">No players connected</div>
        ) : (
          <div className="player-table-scroll">
            <table className="player-table">
              <thead>
                <tr>
                  <th className="col-id">#</th>
                  <th className="col-name">Name</th>
                  <th className="col-steam">SteamID</th>
                  <th className="col-ping">Ping</th>
                  <th className="col-time">Time</th>
                  <th className="col-state">State</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.userid}>
                    <td className="col-id">{p.userid}</td>
                    <td className="col-name" title={p.name}>
                      {p.name}
                    </td>
                    <td className="col-steam" title={p.steamId}>
                      <span className="steam-id">{p.steamId}</span>
                    </td>
                    <td className={`col-ping ${getPingClass(p.ping)}`}>{p.ping}ms</td>
                    <td className="col-time">{p.connected}</td>
                    <td className="col-state">
                      <span className={`state-badge${p.state === "active" ? " state-active" : ""}`}>
                        {p.state}
                      </span>
                    </td>
                    <td className="col-actions">
                      <button
                        className="btn btn-action btn-kick"
                        onClick={() => openKickDialog(p)}
                        title={`Kick ${p.name}`}
                      >
                        K
                      </button>
                      <button
                        className="btn btn-action btn-ban"
                        onClick={() => openBanDialog(p)}
                        title={`Ban ${p.name}`}
                      >
                        B
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kick / Ban Dialog */}
      {dialog && (
        <div className="dialog-overlay" onClick={closeDialog}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <span className="dialog-title">
                {dialog.type === "kick" ? "Kick Player" : "Ban Player"}
              </span>
              <button className="dialog-close" onClick={closeDialog}>
                &times;
              </button>
            </div>

            <div className="dialog-body">
              <div className="dialog-player-info">
                <span className="dialog-player-name">{dialog.player.name}</span>
                <span className="dialog-player-steam">{dialog.player.steamId}</span>
              </div>

              {dialog.type === "kick" ? (
                <div className="dialog-field">
                  <label>Reason</label>
                  <input
                    type="text"
                    placeholder="Kicked by admin"
                    value={kickReason}
                    onChange={(e) => setKickReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleKickConfirm();
                    }}
                    autoFocus
                  />
                </div>
              ) : (
                <div className="dialog-field">
                  <label>Duration (minutes)</label>
                  <div className="ban-duration-options">
                    {["5", "15", "30", "60", "1440"].map((val) => (
                      <button
                        key={val}
                        className={`ban-duration-btn${banMinutes === val ? " active" : ""}`}
                        onClick={() => setBanMinutes(val)}
                      >
                        {val === "1440" ? "24h" : `${val}m`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    placeholder="30"
                    value={banMinutes}
                    onChange={(e) => setBanMinutes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleBanConfirm();
                    }}
                  />
                </div>
              )}
            </div>

            <div className="dialog-actions">
              <button className="btn btn-dialog-cancel" onClick={closeDialog}>
                Cancel
              </button>
              <button
                className={`btn btn-dialog-confirm${dialog.type === "ban" ? " btn-danger" : ""}`}
                onClick={dialog.type === "kick" ? handleKickConfirm : handleBanConfirm}
              >
                {dialog.type === "kick" ? "Kick" : "Ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
