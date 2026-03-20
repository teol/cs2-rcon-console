import type { LogEvent } from "@cs2-rcon/shared";

// Compiled once at module load — these are on the hot path during log streaming.
// Character classes like [^<]+ and [^>]+ are used instead of .+? to prevent
// catastrophic backtracking (ReDoS) on crafted input.
const TIMESTAMP_RE = /^L\s+(\d{2}\/\d{2}\/\d{4}\s+-\s+\d{2}:\d{2}:\d{2}):\s*(.*)/;
const HEADSHOT_RE = /\(headshot\)/;

interface LogPattern {
  category: LogEvent["category"];
  guard?: RegExp;
  re: RegExp;
  handler: (match: RegExpMatchArray, body: string) => string;
}

const PATTERNS: LogPattern[] = [
  {
    category: "kill",
    guard: /killed\s+"[^"]*"[^"]*with\s+"/,
    re: /"([^<]+)<\d+><[^>]+><([^>]*)>"[^"]*killed\s+"([^<]+)<\d+><[^>]+><([^>]*)>"[^"]*with\s+"([^"]+)"/,
    handler: (match, body) => {
      const [, attacker, attackerTeam, victim, victimTeam, weapon] = match;
      const hs = HEADSHOT_RE.test(body) ? " (headshot)" : "";
      return `${attacker} [${attackerTeam}] killed ${victim} [${victimTeam}] with ${weapon}${hs}`;
    },
  },
  {
    category: "chat",
    re: /"([^<]+)<\d+><[^>]+><([^>]*)>"\s+(say_team|say)\s+"(.*)"$/,
    handler: (match) => {
      const [, player, team, chatType, message] = match;
      const prefix = chatType === "say_team" ? "[TEAM] " : "";
      const teamTag = team ? ` [${team}]` : "";
      return `${prefix}${player}${teamTag}: ${message}`;
    },
  },
  {
    category: "connection",
    re: /"([^<]+)<(\d+)><([^>]+)><[^>]*>"\s+connected,\s+address\s+"([^"]+)"/,
    handler: (match) => {
      const [, player, , steamId, address] = match;
      return `${player} connected (${steamId}) from ${address}`;
    },
  },
  {
    category: "connection",
    re: /"([^<]+)<(\d+)><([^>]+)><[^>]*>"\s+entered the game/,
    handler: (match) => {
      const [, player] = match;
      return `${player} entered the game`;
    },
  },
  {
    category: "disconnection",
    re: /"([^<]+)<(\d+)><([^>]+)><[^>]*>"\s+disconnected\s*\(reason\s+"([^"]+)"\)/,
    handler: (match) => {
      const [, player, , , reason] = match;
      return `${player} disconnected (${reason})`;
    },
  },
  {
    category: "round",
    re: /World triggered "Round_Start"/,
    handler: () => "Round started",
  },
  {
    category: "round",
    re: /World triggered "Round_End"/,
    handler: () => "Round ended",
  },
  {
    category: "round",
    re: /Team "([^"]+)"\s+triggered\s+"([^"]+)"/,
    handler: (match) => {
      const [, team, event] = match;
      return `${team}: ${event}`;
    },
  },
];

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

  for (const pattern of PATTERNS) {
    if (pattern.guard && !pattern.guard.test(body)) {
      continue;
    }
    const match = body.match(pattern.re);
    if (match) {
      return {
        timestamp,
        category: pattern.category,
        message: pattern.handler(match, body),
        raw: trimmed,
      };
    }
  }

  // Fallback: any other log line
  return { timestamp, category: "other", message: body, raw: trimmed };
}
