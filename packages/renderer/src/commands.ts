export interface CommandCategory {
  label: string;
  commands: { label: string; command: string }[];
}

export const quickCommands: CommandCategory[] = [
  {
    label: "Match Control",
    commands: [
      { label: "mp_restartgame 1", command: "mp_restartgame 1" },
      { label: "mp_pause_match", command: "mp_pause_match" },
      { label: "mp_unpause_match", command: "mp_unpause_match" },
      { label: "mp_warmup_start", command: "mp_warmup_start" },
      { label: "mp_warmup_end", command: "mp_warmup_end" },
      { label: "mp_scrambleteams", command: "mp_scrambleteams" },
      { label: "mp_swapteams", command: "mp_swapteams" },
    ],
  },
  {
    label: "Maps",
    commands: [
      { label: "de_ancient", command: "changelevel de_ancient" },
      { label: "de_anubis", command: "changelevel de_anubis" },
      { label: "de_dust2", command: "changelevel de_dust2" },
      { label: "de_inferno", command: "changelevel de_inferno" },
      { label: "de_mirage", command: "changelevel de_mirage" },
      { label: "de_nuke", command: "changelevel de_nuke" },
      { label: "de_overpass", command: "changelevel de_overpass" },
      { label: "de_vertigo", command: "changelevel de_vertigo" },
    ],
  },
  {
    label: "Cvars",
    commands: [
      { label: "mp_warmup_pausetimer 1", command: "mp_warmup_pausetimer 1" },
      { label: "mp_warmup_pausetimer 0", command: "mp_warmup_pausetimer 0" },
      { label: "mp_damage_headshot_only 1", command: "mp_damage_headshot_only 1" },
      { label: "mp_damage_headshot_only 0", command: "mp_damage_headshot_only 0" },
      { label: "sv_cheats 1", command: "sv_cheats 1" },
      { label: "sv_cheats 0", command: "sv_cheats 0" },
    ],
  },
  {
    label: "Server Info",
    commands: [
      { label: "status", command: "status" },
      { label: "users", command: "users" },
      { label: "maps *", command: "maps *" },
      { label: "cvarlist", command: "cvarlist" },
    ],
  },
];
