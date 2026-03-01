import type { LogEvent } from "@cs2-rcon/shared";

/**
 * Parse a single CS2 log line into a structured LogEvent.
 *
 * CS2 log lines follow the Source engine format:
 * ```
 * L MM/DD/YYYY - HH:MM:SS: <message>
 * ```
 *
 * Supported event categories:
 * - **kill**: player killed another player
 * - **chat**: say / say_team messages
 * - **connection**: player connected / entered the game
 * - **disconnection**: player disconnected
 * - **round**: round start / end / win events
 * - **other**: anything that doesn't match a known pattern
 */
export function parseLogLine(raw: string): LogEvent {
  const trimmed = raw.trim();

  // Extract timestamp: L MM/DD/YYYY - HH:MM:SS:
  const tsMatch = trimmed.match(/^L\s+(\d{2}\/\d{2}\/\d{4}\s+-\s+\d{2}:\d{2}:\d{2}):\s*(.*)/s);
  const timestamp = tsMatch ? tsMatch[1] : "";
  const body = tsMatch ? tsMatch[2] : trimmed;

  // Kill: "Player<uid><steamid><team>" [x y z] killed "Player2<uid><steamid><team>" [x y z] with "weapon"
  if (/killed\s+".*?"\s+.*?with\s+"/.test(body)) {
    const killMatch = body.match(
      /"(.+?)<\d+><.+?><(.+?)>".*killed\s+"(.+?)<\d+><.+?><(.+?)>".*with\s+"(.+?)"/,
    );
    if (killMatch) {
      const [, attacker, attackerTeam, victim, victimTeam, weapon] = killMatch;
      const headshot = /\(headshot\)/.test(body);
      const hs = headshot ? " (headshot)" : "";
      return {
        timestamp,
        category: "kill",
        message: `${attacker} [${attackerTeam}] killed ${victim} [${victimTeam}] with ${weapon}${hs}`,
        raw: trimmed,
      };
    }
  }

  // Chat: "Player<uid><steamid><team>" say "message"
  // Chat: "Player<uid><steamid><team>" say_team "message"
  const chatMatch = body.match(/"(.+?)<\d+><.+?><(.*?)>"\s+(say_team|say)\s+"(.*)"/);
  if (chatMatch) {
    const [, player, team, chatType, message] = chatMatch;
    const prefix = chatType === "say_team" ? `[TEAM] ` : "";
    const teamTag = team ? ` [${team}]` : "";
    return {
      timestamp,
      category: "chat",
      message: `${prefix}${player}${teamTag}: ${message}`,
      raw: trimmed,
    };
  }

  // Connection: "Player<uid><steamid><>" connected, address "ip:port"
  const connectMatch = body.match(/"(.+?)<(\d+)><(.+?)><.*>"\s+connected,\s+address\s+"(.+?)"/);
  if (connectMatch) {
    const [, player, , steamId, address] = connectMatch;
    return {
      timestamp,
      category: "connection",
      message: `${player} connected (${steamId}) from ${address}`,
      raw: trimmed,
    };
  }

  // Entered the game: "Player<uid><steamid><>" entered the game
  const enterMatch = body.match(/"(.+?)<(\d+)><(.+?)><.*>"\s+entered the game/);
  if (enterMatch) {
    const [, player] = enterMatch;
    return {
      timestamp,
      category: "connection",
      message: `${player} entered the game`,
      raw: trimmed,
    };
  }

  // Disconnection: "Player<uid><steamid><team>" disconnected (reason "Disconnect")
  const disconnectMatch = body.match(
    /"(.+?)<(\d+)><(.+?)><.*>"\s+disconnected\s*\(reason\s+"(.+?)"\)/,
  );
  if (disconnectMatch) {
    const [, player, , , reason] = disconnectMatch;
    return {
      timestamp,
      category: "disconnection",
      message: `${player} disconnected (${reason})`,
      raw: trimmed,
    };
  }

  // Round start: World triggered "Round_Start"
  if (/World triggered "Round_Start"/.test(body)) {
    return { timestamp, category: "round", message: "Round started", raw: trimmed };
  }

  // Round end: World triggered "Round_End"
  if (/World triggered "Round_End"/.test(body)) {
    return { timestamp, category: "round", message: "Round ended", raw: trimmed };
  }

  // Team win: Team "CT" triggered "SFUI_Notice_CTs_Win" / Team "TERRORIST" triggered ...
  const teamWinMatch = body.match(/Team "(.+?)"\s+triggered\s+"(.+?)"/);
  if (teamWinMatch) {
    const [, team, event] = teamWinMatch;
    return { timestamp, category: "round", message: `${team}: ${event}`, raw: trimmed };
  }

  // Fallback: any other log line
  return { timestamp, category: "other", message: body, raw: trimmed };
}
