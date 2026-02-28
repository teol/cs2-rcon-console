import { useRef, useEffect, useState, useCallback } from "react";
import type { ConsoleLine } from "../useRcon.ts";

interface ConsoleProps {
  lines: ConsoleLine[];
  connected: boolean;
  commandHistory: string[];
  onCommand: (cmd: string) => void;
  onClear: () => void;
}

export function Console({ lines, connected, commandHistory, onCommand, onClear }: ConsoleProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input when connected
  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  const sendFromInput = useCallback(() => {
    const cmd = inputValue.trim();
    if (!cmd) return;
    onCommand(cmd);
    setInputValue("");
    setHistoryIndex(-1);
  }, [inputValue, onCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        sendFromInput();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          const next = historyIndex + 1;
          setHistoryIndex(next);
          setInputValue(commandHistory[next]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex > 0) {
          const next = historyIndex - 1;
          setHistoryIndex(next);
          setInputValue(commandHistory[next]);
        } else {
          setHistoryIndex(-1);
          setInputValue("");
        }
      }
    },
    [sendFromInput, historyIndex, commandHistory],
  );

  return (
    <div className="console-area">
      <div className="console-toolbar">
        <div className="console-title">{"\u25B8"} Console Output</div>
        <button className="btn btn-clear" onClick={onClear}>
          Clear
        </button>
      </div>

      <div className="console-output" ref={outputRef}>
        {lines.map((line) => (
          <div key={line.id} className={`console-line ${line.type}`}>
            {line.text}
          </div>
        ))}
      </div>

      <div className="console-input-bar">
        <span className="input-prefix">{"\u276F"}</span>
        <input
          type="text"
          id="commandInput"
          ref={inputRef}
          placeholder="Enter RCON command..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button className="btn btn-send" onClick={sendFromInput} disabled={!connected}>
          Send
        </button>
      </div>
    </div>
  );
}
