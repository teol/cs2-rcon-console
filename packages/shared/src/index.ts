/** Structured server information shared between the backend and frontend. */
export interface ServerInfo {
  hostname: string;
  map: string;
  players: number;
  maxPlayers: number;
  bots: number;
  version: string;
  type: string;
  secure: boolean;
  fps: number;
  cpu: number;
}

/** Structured player information shared between the backend and frontend. */
export interface PlayerInfo {
  userid: number;
  name: string;
  steamId: string;
  connected: string;
  ping: number;
  loss: number;
  state: string;
}
