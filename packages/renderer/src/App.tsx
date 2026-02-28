import { useRcon } from "./useRcon.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Console } from "./components/Console.tsx";

export function App() {
  const {
    connected,
    lines,
    serverHistory,
    commandHistory,
    clearConsole,
    connectToServer,
    disconnect,
    sendCommand,
    removeFromHistory,
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

      <div className="main">
        <Sidebar
          connected={connected}
          serverHistory={serverHistory}
          onConnect={connectToServer}
          onDisconnect={disconnect}
          onCommand={sendCommand}
          onRemoveHistory={removeFromHistory}
        />
        <Console
          lines={lines}
          connected={connected}
          commandHistory={commandHistory}
          onCommand={sendCommand}
          onClear={clearConsole}
        />
      </div>
    </>
  );
}
