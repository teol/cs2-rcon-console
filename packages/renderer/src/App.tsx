import { useRcon } from "./useRcon.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Console } from "./components/Console.tsx";
import { InactivityWarning } from "./components/InactivityWarning.tsx";
import { ServerStatus } from "./components/ServerStatus.tsx";
import { PlayerTable } from "./components/PlayerTable.tsx";

export function App() {
  const {
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
  } = useRcon();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">
            CS2 RCON <span>Console</span>
          </div>
        </div>
        <div className={`status-badge${connected ? " connected" : ""}`}>
          <div className="status-dot" />
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </header>

      {inactivityWarning && (
        <InactivityWarning
          secondsLeft={inactivitySecondsLeft}
          onStayConnected={resetInactivity}
          onDisconnect={disconnect}
        />
      )}

      <div className="main">
        <Sidebar
          connected={connected}
          serverHistory={serverHistory}
          onConnect={connectToServer}
          onDisconnect={disconnect}
          onCommand={sendCommand}
          onRemoveHistory={removeFromHistory}
        />
        <div className="content-area">
          {connected && (
            <>
              <ServerStatus
                status={serverStatus}
                fpsHistory={fpsHistory}
                playerCountHistory={playerCountHistory}
                autoRefreshInterval={autoRefreshInterval}
                onRefreshIntervalChange={updateAutoRefreshInterval}
                onManualRefresh={requestStatus}
              />
              <PlayerTable
                players={players}
                maxPlayers={serverStatus?.maxPlayers ?? 0}
                connected={connected}
                onCommand={sendCommand}
              />
            </>
          )}
          <Console
            lines={lines}
            connected={connected}
            commandHistory={commandHistory}
            showTimestamps={showTimestamps}
            logStreaming={logStreaming}
            onCommand={sendCommand}
            onClear={clearConsole}
            onToggleTimestamps={toggleTimestamps}
            onToggleLogStreaming={toggleLogStreaming}
          />
        </div>
      </div>
    </>
  );
}
