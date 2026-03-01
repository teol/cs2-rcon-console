import type { LogEvent } from "@cs2-rcon/shared";

// Compiled once at module load — these are on the hot path during log streaming.
const TIMESTAMP_RE = /^L\s+(\d{2}\/\d{2}\/\d{4}\s+-\s+\d{2}:\d{2}:\d{2}):\s*(.*)/s;
const KILL_GUARD_RE = /killed\s+".*?"\s+.*?with\s+"/;
const KILL_RE = /"(.+?)<\d+><.+?><(.+?)>".*killed\s+"(.+?)<\d+><.+?><(.+?)>".*with\s+"(.+?)"/;
const HEADSHOT_RE = /\(headshot\)/;
const CHAT_RE = /"(.+?)<\d+><.+?><(.*?)>"\s+(say_team|say)\s+"(.*)"/;
const CONNECT_RE = /"(.+?)<(\d+)><(.+?)><.*>"\s+connected,\s+address\s+"(.+?)"/;
const ENTER_RE = /"(.+?)<(\d+)><(.+?)><.*>"\s+entered the game/;
const DISCONNECT_RE = /"(.+?)<(\d+)><(.+?)><.*>"\s+disconnected\s*\(reason\s+"(.+?)"\)/;
const ROUND_START_RE = /World triggered "Round_Start"/;
const ROUND_END_RE = /World triggered "Round_End"/;
const TEAM_WIN_RE = /Team "(.+?)"\s+triggered\s+"(.+?)"/;

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
  const tsMatch = trimmed.match(TIMESTAMP_RE);
  const timestamp = tsMatch ? tsMatch[1] : "";
  const body = tsMatch ? tsMatch[2] : trimmed;

  // Kill: "Player<uid><steamid><team>" [x y z] killed "Player2<uid><steamid><team>" [x y z] with "weapon"
  if (KILL_GUARD_RE.test(body)) {
    const killMatch = body.match(KILL_RE);
    if (killMatch) {
      const [, attacker, attackerTeam, victim, victimTeam, weapon] = killMatch;
      const hs = HEADSHOT_RE.test(body) ? " (headshot)" : "";
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
  const chatMatch = body.match(CHAT_RE);
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
  const connectMatch = body.match(CONNECT_RE);
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
  const enterMatch = body.match(ENTER_RE);
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
  const disconnectMatch = body.match(DISCONNECT_RE);
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
  if (ROUND_START_RE.test(body)) {
    return { timestamp, category: "round", message: "Round started", raw: trimmed };
  }

  // Round end: World triggered "Round_End"
  if (ROUND_END_RE.test(body)) {
    return { timestamp, category: "round", message: "Round ended", raw: trimmed };
  }

  // Team win: Team "CT" triggered "SFUI_Notice_CTs_Win" / Team "TERRORIST" triggered ...
  const teamWinMatch = body.match(TEAM_WIN_RE);
  if (teamWinMatch) {
    const [, team, event] = teamWinMatch;
    return { timestamp, category: "round", message: `${team}: ${event}`, raw: trimmed };
  }

  // Fallback: any other log line
  return { timestamp, category: "other", message: body, raw: trimmed };
}
