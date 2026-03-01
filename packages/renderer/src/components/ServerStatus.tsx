import { Sparkline } from "./Sparkline.tsx";
import type { ServerInfo } from "../useRcon.ts";

interface ServerStatusProps {
  status: ServerInfo | null;
  fpsHistory: number[];
  playerCountHistory: number[];
  autoRefreshInterval: number;
  onRefreshIntervalChange: (seconds: number) => void;
  onManualRefresh: () => void;
}

const REFRESH_OPTIONS = [
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "Off", value: 0 },
];

export function ServerStatus({
  status,
  fpsHistory,
  playerCountHistory,
  autoRefreshInterval,
  onRefreshIntervalChange,
  onManualRefresh,
}: ServerStatusProps) {
  const activeOption = REFRESH_OPTIONS.find((o) => o.value === autoRefreshInterval);

  return (
    <div className="server-status">
      <div className="server-status-header">
        <div className="server-status-title">
          <span className="server-status-icon">&#9673;</span>
          Server Status
        </div>
        <div className="server-status-controls">
          <button className="btn btn-refresh" onClick={onManualRefresh} title="Refresh now">
            &#8635;
          </button>
          <div className="refresh-selector">
            {REFRESH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`refresh-option${opt.value === autoRefreshInterval ? " active" : ""}`}
                onClick={() => onRefreshIntervalChange(opt.value)}
                title={opt.value > 0 ? `Auto-refresh every ${opt.label}` : "Disable auto-refresh"}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {autoRefreshInterval > 0 && (
            <span className="refresh-indicator">&#8635; Auto {activeOption?.label}</span>
          )}
        </div>
      </div>

      {!status ? (
        <div className="server-status-empty">
          <span className="server-status-empty-icon">&#8987;</span>
          Waiting for server data...
        </div>
      ) : (
        <div className="server-status-body">
          <div className="server-status-grid">
            <div className="status-item">
              <span className="status-item-label">Server</span>
              <span className="status-item-value hostname">{status.hostname || "Unknown"}</span>
            </div>
            <div className="status-item">
              <span className="status-item-label">Map</span>
              <span className="status-item-value map">{status.map || "—"}</span>
            </div>
            <div className="status-item">
              <span className="status-item-label">Players</span>
              <span className="status-item-value">
                <span className="player-count">{status.players ?? "—"}</span>
                <span className="player-separator"> / </span>
                <span className="player-max">{status.maxPlayers ?? "—"}</span>
                {(status.bots ?? 0) > 0 && (
                  <span className="player-bots"> (+{status.bots} bots)</span>
                )}
              </span>
            </div>
            <div className="status-item">
              <span className="status-item-label">Version</span>
              <span className="status-item-value">{status.version || "—"}</span>
            </div>
            <div className="status-item">
              <span className="status-item-label">FPS</span>
              <span className="status-item-value fps-value">
                {status.fps ? status.fps.toFixed(1) : "—"}
              </span>
            </div>
            <div className="status-item">
              <span className="status-item-label">CPU</span>
              <span className="status-item-value">
                {status.cpu ? `${status.cpu.toFixed(1)}%` : "—"}
              </span>
            </div>
            <div className="status-item">
              <span className="status-item-label">VAC</span>
              <span
                className={`status-item-value status-tag${status.secure ? " tag-ok" : " tag-warn"}`}
              >
                {status.secure ? "\u2713 Secure" : "\u2717 Insecure"}
              </span>
            </div>
            <div className="status-item">
              <span className="status-item-label">Type</span>
              <span className="status-item-value">{status.type || "—"}</span>
            </div>
          </div>

          <div className="server-status-sparklines">
            <Sparkline
              data={fpsHistory}
              label="FPS"
              color="var(--success)"
              width={140}
              height={36}
            />
            <Sparkline
              data={playerCountHistory}
              label="Players"
              color="var(--accent)"
              width={140}
              height={36}
            />
          </div>
        </div>
      )}
    </div>
  );
}
