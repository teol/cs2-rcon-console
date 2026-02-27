# CS2 Web RCON Console

A web-based RCON console for Counter-Strike 2 servers, inspired by [rcon.srcds.pro](https://rcon.srcds.pro/).

## Architecture

```
┌─────────────┐     WebSocket     ┌──────────────┐     TCP (RCON)     ┌─────────────┐
│   Browser    │ ◄──────────────► │   Node.js    │ ◄───────────────► │  CS2 Server │
│  (Frontend)  │                  │  (Backend)   │                    │    :27015   │
└─────────────┘                   └──────────────┘                    └─────────────┘
```

- **Frontend**: Web interface with interactive console, quick commands, server history
- **Backend**: Express + WebSocket server acting as a TCP proxy
- **RCON**: Pure implementation of the Source RCON protocol (binary TCP packets)

Browsers cannot open raw TCP connections. The Node.js backend bridges the browser's WebSocket to the game server's TCP RCON port.

## Setup

```bash
npm install
npm start
```

Open http://localhost:3000

For development with auto-reload:

```bash
npm run dev
```

## Features

- Connect to any CS2 server via RCON
- Interactive console with command history (↑/↓ arrow keys)
- Quick commands (match control, map changes, cvars)
- Server history persisted in localStorage
- Responsive UI
- Automatic WebSocket reconnection

## Project Structure

```
├── server.js          # Express + WebSocket server
├── rcon.js            # RCON client (Source RCON TCP protocol)
├── package.json
├── public/
│   └── index.html     # Full frontend (HTML/CSS/JS)
└── README.md
```

## RCON Protocol

The Source RCON protocol uses TCP packets with the following structure:

| Field   | Size     | Description                              |
|---------|----------|------------------------------------------|
| Size    | 4 bytes  | Packet size (excluding this field)       |
| ID      | 4 bytes  | Request ID                               |
| Type    | 4 bytes  | 3 = Auth, 2 = Command, 0 = Response     |
| Body    | Variable | Command or response (null-terminated ASCII) |
| Padding | 1 byte   | Empty string terminator                  |

Reference: https://developer.valvesoftware.com/wiki/Source_RCON_Protocol

## Configuration

| Environment Variable | Default | Description      |
|----------------------|---------|------------------|
| `PORT`               | 3000    | Web server port  |

## Security

⚠️ This project is intended for local network or personal use. If you expose it to the internet, consider:

- Adding authentication (HTTP Basic, JWT, etc.)
- Using HTTPS via a reverse proxy (nginx, Caddy)
- Rate limiting RCON connections
