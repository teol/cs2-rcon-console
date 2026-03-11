# CS2 Web RCON — Agent Guidelines

## Build & run

```bash
bun install                                      # install all workspace dependencies
bun run build                                    # build every package (rcon → server → renderer)
bun run dev                                      # start all packages in dev/watch mode
bun run typecheck                                # type-check all packages
bun run test                                     # run tests across all packages
bun run format                                   # format everything with Prettier
bun run format:check                             # check formatting (CI)
```

### Per-workspace commands

```bash
bun run --filter @cs2-rcon/renderer dev          # Vite dev server (HMR)
bun run --filter @cs2-rcon/server dev            # Fastify in watch mode
bun run --filter @cs2-rcon/rcon dev              # tsc watch for RCON lib
bun run --filter @cs2-rcon/renderer build        # build frontend only
bun run --filter @cs2-rcon/server build          # build server only
bun run --filter @cs2-rcon/rcon build            # build RCON lib only
bun run --filter @cs2-rcon/rcon test             # run RCON lib tests
bun run --filter @cs2-rcon/server test           # run server tests
```

## Monorepo structure

```
cs2-rcon-console/
├── packages/
│   ├── rcon/            # @cs2-rcon/rcon  — shared RCON protocol client library
│   │   └── src/index.ts
│   ├── renderer/        # @cs2-rcon/renderer — Vite + React frontend
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── useRcon.ts
│   │   │   ├── commands.ts
│   │   │   └── components/
│   │   └── index.html
│   └── server/          # @cs2-rcon/server — Fastify WebSocket server
│       └── src/index.ts
├── package.json         # workspace root (global scripts, no app code)
├── tsconfig.base.json   # shared TypeScript compiler options
└── tsconfig.json        # project references (rcon, server)
```

### Dependency graph

```
renderer  (Vite + React, standalone — proxies /ws to server in dev)
server    → rcon
```

## Conventions

- Language: TypeScript (strict mode), ESM (`"type": "module"`)
- Package manager & runtime: Bun
- Frontend: Vite + React 19 (bundler module resolution)
- Backend: Fastify 5 (Node16 module resolution)
- Workspaces use `workspace:*` protocol for internal dependencies
- All code, comments, logs, and documentation must be in **English**

## Future workspaces

The monorepo is designed to accommodate additional packages:

- `packages/electron` — Electron shell (will consume `@cs2-rcon/renderer` + Vite)
