# CS2 Web RCON — Agent Guidelines

## Build & run

```bash
corepack enable          # activates the bundled Yarn 4
yarn install             # install dependencies
yarn build               # compile TypeScript → dist/
yarn start               # run the server (requires build first)
yarn dev                 # build + watch mode
yarn typecheck           # type-check without emitting
```

## Project layout

- `src/server.ts` — Fastify server (HTTP static files + WebSocket)
- `src/rcon.ts` — Source RCON protocol client (binary TCP)
- `public/index.html` — Frontend (single-file HTML/CSS/JS, no build step)
- `dist/` — Compiled output (git-ignored)

## Conventions

- Language: TypeScript (strict mode), ESM (`"type": "module"`)
- Runtime: Node.js ≥ 20
- Package manager: Yarn 4 via corepack (`packageManager` field in package.json)
- All code, comments, logs, and documentation must be in **English**
