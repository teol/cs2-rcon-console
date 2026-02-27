# AGENTS.md

## Project Overview

CS2 Web RCON Console is a web-based RCON client for Counter-Strike 2 servers.
It allows users to connect to a CS2 server via RCON and execute commands through a web interface.

## Tech Stack

- **Package Manager**: Yarn 4 (with Corepack)
- **Language**: TypeScript (strict mode)
- **Backend**: Fastify + @fastify/websocket
- **Frontend**: React + Vite
- **Styling**: CSS Modules / global CSS (currently global `index.css`)
- **Testing**: Vitest + React Testing Library

## Development

1. **Install Dependencies**: `yarn install`
2. **Start Dev Server**: `yarn dev` (runs both frontend and backend concurrently)
3. **Run Tests**: `yarn test`
4. **Build**: `yarn build` (generates `dist/` for production)
5. **Start Production**: `yarn start` (serves `dist/` and runs websocket server)

## Coding Standards

- **Language**: Use English for all code, comments, and documentation.
- **Formatting**: Prettier is used. Run `yarn format` to fix issues.
- **Type Safety**: Avoid `any` where possible. Use defined interfaces/types.
- **Testing**: Write unit tests for new features. Ensure `yarn test` passes.
