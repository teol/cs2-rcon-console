# CS2 Web RCON Console

Web-based RCON console for Counter-Strike 2 servers, inspired by [rcon.srcds.pro](https://rcon.srcds.pro/).

## Architecture

```
┌─────────────┐     WebSocket     ┌──────────────┐     TCP (RCON)     ┌─────────────┐
│   Browser    │ ◄──────────────► │   Node.js    │ ◄───────────────► │  CS2 Server │
│  (Frontend)  │                  │  (Fastify)   │                    │    :27015   │
└─────────────┘                   └──────────────┘                    └─────────────┘
```

- **Frontend** — Static single-file HTML/CSS/JS with interactive console, quick commands, server history
- **Backend** — Fastify + `@fastify/websocket` acting as a TCP proxy
- **RCON** — Pure TypeScript implementation of the [Source RCON protocol](https://developer.valvesoftware.com/wiki/Source_RCON_Protocol)

Browsers cannot open raw TCP connections. The Node.js backend bridges the browser's WebSocket to the game server's TCP RCON port.

## Features

- Connect to any CS2 server via RCON
- Interactive console with command history (↑/↓ arrow keys)
- Quick commands (match control, map changes, cvars)
- Server history persisted in localStorage
- Responsive UI
- Automatic WebSocket reconnection

## Prerequisites

- **Node.js** ≥ 20
- **Corepack** enabled (`corepack enable`) — provides Yarn 4

## Setup

```bash
corepack enable
yarn install
yarn build
yarn start
```

Open <http://localhost:3000>.

For development with auto-rebuild:

```bash
yarn dev
```

## Configuration

| Environment variable | Default | Description     |
|----------------------|---------|-----------------|
| `PORT`               | `3000`  | Web server port |

## Project structure

```
├── src/
│   ├── server.ts        # Fastify + WebSocket server
│   └── rcon.ts          # RCON client (Source RCON TCP protocol)
├── public/
│   └── index.html       # Full frontend (HTML/CSS/JS)
├── dist/                # Compiled output (git-ignored)
├── package.json
├── tsconfig.json
├── .yarnrc.yml
└── .yarn/releases/      # Yarn 4 binary (committed)
```

## Production deployment with Nginx

### 1. Build the application

```bash
corepack enable
yarn install
yarn build
```

### 2. Run with a process manager

Use **systemd** or **pm2** to keep the server running:

```bash
# With pm2
pm2 start dist/server.js --name cs2-rcon

# Or with systemd (create /etc/systemd/system/cs2-rcon.service)
```

Example systemd unit:

```ini
[Unit]
Description=CS2 Web RCON Console
After=network.target

[Service]
Type=simple
User=cs2rcon
WorkingDirectory=/opt/cs2-rcon-console
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### 3. Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name rcon.example.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rcon.example.com;

    ssl_certificate     /etc/letsencrypt/live/rcon.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rcon.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

### 4. HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d rcon.example.com
```

## RCON Protocol

The Source RCON protocol uses TCP packets with the following structure:

| Field   | Size     | Description                                   |
|---------|----------|-----------------------------------------------|
| Size    | 4 bytes  | Packet size (excluding this field)             |
| ID      | 4 bytes  | Request ID                                     |
| Type    | 4 bytes  | 3 = Auth, 2 = Command, 0 = Response           |
| Body    | Variable | Command or response (null-terminated ASCII)    |
| Padding | 1 byte   | Empty string terminator                        |

Reference: <https://developer.valvesoftware.com/wiki/Source_RCON_Protocol>

## Security

> **Warning** — This project is intended for local network or personal use. If you expose it to the internet, consider:

- Adding authentication (HTTP Basic Auth, OAuth, etc.)
- Using HTTPS via a reverse proxy (nginx + Let's Encrypt)
- Restricting access by IP
- Rate-limiting RCON connections

## License

[MIT](LICENSE)
