/** Structured server information parsed from the `status` and `stats` RCON commands. */
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

/** Structured player information parsed from the `status` RCON command. */
export interface PlayerInfo {
  userid: number;
  name: string;
  steamId: string;
  connected: string;
  ping: number;
  loss: number;
  state: string;
}

/**
 * Parse the output of the CS2 `status` RCON command.
 *
 * Example output:
 * ```
 * hostname: MyCS2Server
 * version : 1.40.1.0/13994 1373/8948 secure
 * os      :  Linux
 * type    :  community dedicated
 * map     : de_dust2
 * players : 8 humans, 0 bots (10/0 max) (not hibernating)
 *
 * # userid name uniqueid connected ping loss state rate adr
 * #  2 1 "Player1" STEAM_1:0:12345678 04:23 45 0 active 786432 1.2.3.4:27005
 * ```
 */
export function parseStatus(raw: string): {
  server: Partial<ServerInfo>;
  players: PlayerInfo[];
} {
  const server: Partial<ServerInfo> = {};
  const players: PlayerInfo[] = [];

  const lines = raw.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // hostname: MyServer
    const hostnameMatch = trimmed.match(/^hostname:\s*(.+)/);
    if (hostnameMatch) {
      server.hostname = hostnameMatch[1].trim();
      continue;
    }

    // version : 1.40.1.0/13994 ... secure
    const versionMatch = trimmed.match(/^version\s*:\s*(.+)/);
    if (versionMatch) {
      const ver = versionMatch[1].trim();
      server.version = ver.split(/[\s/]/)[0];
      server.secure = /\bsecure\b/i.test(ver) && !/\binsecure\b/i.test(ver);
      continue;
    }

    // map     : de_dust2
    const mapMatch = trimmed.match(/^map\s*:\s*(\S+)/);
    if (mapMatch) {
      server.map = mapMatch[1];
      continue;
    }

    // type    :  community dedicated
    const typeMatch = trimmed.match(/^type\s*:\s*(.+)/);
    if (typeMatch) {
      server.type = typeMatch[1].trim();
      continue;
    }

    // players : 8 humans, 0 bots (10/0 max) (not hibernating)
    const playersMatch = trimmed.match(/^players\s*:\s*(\d+)\s*humans?,\s*(\d+)\s*bots?\s*\((\d+)/);
    if (playersMatch) {
      server.players = parseInt(playersMatch[1], 10);
      server.bots = parseInt(playersMatch[2], 10);
      server.maxPlayers = parseInt(playersMatch[3], 10);
      continue;
    }

    // Player lines (CS2 and Source 1 formats):
    // CS2:     # 2 1 "Player1" STEAM_1:0:12345678 04:23 45 0 active 786432 1.2.3.4:27005
    // Source1: #  2 "Player1" STEAM_0:0:12345 01:23:45 12 0 active 196608
    const playerMatch = trimmed.match(
      /^#\s*(\d+)\s+(?:\d+\s+)?"(.+?)"\s+(STEAM_\S+|\[U:\d+:\d+\])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\w+)/,
    );
    if (playerMatch) {
      players.push({
        userid: parseInt(playerMatch[1], 10),
        name: playerMatch[2],
        steamId: playerMatch[3],
        connected: playerMatch[4],
        ping: parseInt(playerMatch[5], 10),
        loss: parseInt(playerMatch[6], 10),
        state: playerMatch[7],
      });
    }
  }

  return { server, players };
}

/**
 * Parse the output of the CS2 `stats` RCON command.
 *
 * Example output:
 * ```
 * CPU    NetIn   NetOut    Uptime  Maps   FPS   Players  Svms    +-ms   ~tick
 * 10.0    0.0     0.0       1      1   128.00     2      1.00   0.10   0.00
 * ```
 */
export function parseStats(raw: string): { fps: number; cpu: number } {
  const lines = raw.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.trim().match(/^([\d.]+)\s+[\d.]+\s+[\d.]+\s+\d+\s+\d+\s+([\d.]+)/);
    if (match) {
      return {
        cpu: parseFloat(match[1]),
        fps: parseFloat(match[2]),
      };
    }
  }
  return { fps: 0, cpu: 0 };
}
