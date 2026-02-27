export interface ServerHistory {
  key: string;
  host: string;
  port: string;
  date: number;
}

export type MessageType =
  | "connect"
  | "connected"
  | "disconnected"
  | "command"
  | "response"
  | "error";

export interface WebSocketMessage {
  type: MessageType;
  message?: string;
  command?: string;
  body?: string;
  host?: string;
  port?: string;
  password?: string;
}

export interface ConsoleLine {
  id: number;
  type: "cmd" | "response" | "error" | "info" | "system";
  content: string;
}
