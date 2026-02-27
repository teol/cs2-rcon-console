# CS2 Web RCON Console

A modern, web-based RCON console for Counter-Strike 2 servers.

## Features

- **Connect** to any CS2 server via RCON (TCP)
- **Interactive Console** with command history
- **Quick Commands** for common match/server actions
- **Server History** persisted in local storage
- **Responsive UI** built with React + Vite
- **WebSocket** communication via Fastify backend

## Prerequisites

- Node.js (v18+)
- Yarn 4 (Corepack enabled)

## Installation

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd cs2-web-rcon
   ```

2. Enable Corepack and install dependencies:
   ```bash
   corepack enable
   yarn install
   ```

## Development

Run the development server (frontend + backend concurrently):

```bash
yarn dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

The Vite dev server proxies WebSocket connections (`/ws`) to the backend.

## Production Build

1. Build the frontend:

   ```bash
   yarn build
   ```

   This generates the static files in the `dist/` directory.

2. Start the production server:
   ```bash
   yarn start
   ```
   The backend will serve the static files from `dist/` and handle WebSocket connections on port 3000 (default).

## Deployment (Nginx)

To run in production behind Nginx, use the following configuration as a starting point:

```nginx
server {
    listen 80;
    server_name rcon.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Ensure `yarn start` is running (e.g., via PM2 or Systemd).

## Environment Variables

| Variable | Default | Description                     |
| -------- | ------- | ------------------------------- |
| `PORT`   | 3000    | The port for the backend server |

## License

MIT
