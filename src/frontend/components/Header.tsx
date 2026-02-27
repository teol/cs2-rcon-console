import React from "react";

interface HeaderProps {
  connected: boolean;
}

const Header: React.FC<HeaderProps> = ({ connected }) => {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          CS2 RCON <span>Console</span>
        </div>
      </div>
      <div
        className={`status-badge ${connected ? "connected" : ""}`}
        id="statusBadge"
      >
        <div className="status-dot"></div>
        <span id="statusText">{connected ? "Connected" : "Disconnected"}</span>
      </div>
    </header>
  );
};

export default Header;
