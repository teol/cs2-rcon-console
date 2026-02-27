import React, { useEffect, useRef, useState } from "react";
import { ConsoleLine } from "../types";

interface ConsoleProps {
  lines: ConsoleLine[];
  onCommand: (cmd: string) => void;
  onClear: () => void;
  connected: boolean;
}

const Console: React.FC<ConsoleProps> = ({
  lines,
  onCommand,
  onClear,
  connected,
}) => {
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [localHistory, setLocalHistory] = useState<string[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSend = () => {
    const cmd = input.trim();
    if (!cmd) return;

    onCommand(cmd);
    setLocalHistory((prev) => [cmd, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < localHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(localHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(localHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  return (
    <div className="console-area">
      <div className="console-toolbar">
        <div className="console-title">▸ Console Output</div>
        <button className="btn btn-clear" onClick={onClear}>
          Clear
        </button>
      </div>

      <div className="console-output" ref={outputRef}>
        <div className="console-line system">CS2 Web RCON Console v1.0.0</div>
        <div className="console-line system">
          Enter server details and connect to begin.
        </div>
        {lines.map((line) => (
          <div key={line.id} className={`console-line ${line.type}`}>
            {line.content}
          </div>
        ))}
      </div>

      <div className="console-input-bar">
        <span className="input-prefix">❯</span>
        <input
          type="text"
          id="commandInput"
          placeholder="Enter RCON command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          ref={inputRef}
          autoComplete="off"
        />
        <button
          className="btn btn-send"
          onClick={handleSend}
          disabled={!connected}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Console;
