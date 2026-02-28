interface InactivityWarningProps {
  secondsLeft: number;
  onStayConnected: () => void;
  onDisconnect: () => void;
}

export function InactivityWarning({ secondsLeft, onStayConnected, onDisconnect }: InactivityWarningProps) {
  return (
    <div className="inactivity-warning" role="alert" aria-live="assertive">
      <div className="inactivity-warning-content">
        <span className="inactivity-warning-icon">⚠</span>
        <span className="inactivity-warning-text">
          Session will disconnect in <strong>{secondsLeft}s</strong> due to inactivity.
        </span>
        <div className="inactivity-warning-actions">
          <button className="btn btn-stay-connected" onClick={onStayConnected}>
            Stay Connected
          </button>
          <button className="btn btn-disconnect-now" onClick={onDisconnect}>
            Disconnect Now
          </button>
        </div>
      </div>
    </div>
  );
}
