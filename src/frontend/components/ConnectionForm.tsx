import React, { useState } from "react";

interface ConnectionFormProps {
  connected: boolean;
  onConnect: (host: string, port: string, pass: string) => void;
  onDisconnect: () => void;
  initialHost?: string;
  initialPort?: string;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({
  connected,
  onConnect,
  onDisconnect,
  initialHost = "",
  initialPort = "27015",
}) => {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(initialPort);
  const [password, setPassword] = useState("");

  // Update internal state when props change (e.g. loading from history)
  React.useEffect(() => {
    if (initialHost) setHost(initialHost);
    if (initialPort) setPort(initialPort);
  }, [initialHost, initialPort]);

  const handleConnect = () => {
    if (connected) {
      onDisconnect();
    } else {
      onConnect(host, port, password);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConnect();
    }
  };

  return (
    <div className="connect-form">
      <div className="input-row">
        <div className="input-group">
          <label>Host / IP</label>
          <input
            type="text"
            placeholder="127.0.0.1"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={connected}
          />
        </div>
        <div className="input-group">
          <label>Port</label>
          <input
            type="number"
            placeholder="27015"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={connected}
          />
        </div>
      </div>
      <div className="input-group">
        <label>RCON Password</label>
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={connected}
        />
      </div>
      <button
        className={`btn btn-connect ${connected ? "disconnect" : ""}`}
        onClick={handleConnect}
      >
        {connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
};

export default ConnectionForm;
