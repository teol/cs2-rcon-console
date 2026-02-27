# CS2 Web RCON — Agent Guidelines

## Build & run

```bash
corepack enable                                  # activates the bundled Yarn 4
yarn install                                     # install all workspace dependencies
yarn build                                       # build every package (rcon → server → renderer)
yarn dev                                         # start all packages in dev/watch mode
yarn typecheck                                   # type-check all packages
yarn test                                        # run tests across all packages
yarn format                                      # format everything with Prettier
yarn format:check                                # check formatting (CI)
```

### Per-workspace commands

```bash
yarn workspace @cs2-rcon/renderer dev            # Vite dev server (HMR)
yarn workspace @cs2-rcon/server dev              # Fastify in watch mode
yarn workspace @cs2-rcon/rcon dev                # tsc watch for RCON lib
yarn workspace @cs2-rcon/renderer build          # build frontend only
yarn workspace @cs2-rcon/server build            # build server only
yarn workspace @cs2-rcon/rcon build              # build RCON lib only
yarn workspace @cs2-rcon/rcon test               # run RCON lib tests
yarn workspace @cs2-rcon/server test             # run server tests
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
├── tsconfig.json        # project references (rcon, server)
└── .yarnrc.yml          # Yarn 4 config (nodeLinker: node-modules)
```

### Dependency graph

```
renderer  (Vite + React, standalone — proxies /ws to server in dev)
server    → rcon
```

## Conventions

- Language: TypeScript (strict mode), ESM (`"type": "module"`)
- Runtime: Node.js ≥ 20
- Package manager: Yarn 4 via corepack (`packageManager` field in root package.json)
- Frontend: Vite + React 19 (bundler module resolution)
- Backend: Fastify 5 (Node16 module resolution)
- Workspaces use `workspace:*` protocol for internal dependencies
- All code, comments, logs, and documentation must be in **English**

## Future workspaces

The monorepo is designed to accommodate additional packages:

- `packages/electron` — Electron shell (will consume `@cs2-rcon/renderer` + Vite)
