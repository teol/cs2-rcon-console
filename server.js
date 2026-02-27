const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { RconClient } = require('./rcon');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

/**
 * WebSocket handler
 * Each browser client gets its own WebSocket connection
 * and its own RCON TCP connection to the game server.
 */
wss.on('connection', (ws) => {
    let rcon = null;

    console.log('[WS] New client connected');

    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }

        switch (msg.type) {
            case 'connect': {
                const { host, port, password } = msg;

                if (!host || !port || !password) {
                    return ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Missing host, port, or password',
                    }));
                }

                // Disconnect previous connection if any
                if (rcon) {
                    rcon.disconnect();
                }

                rcon = new RconClient();

                rcon.on('disconnect', () => {
                    ws.send(JSON.stringify({ type: 'disconnected' }));
                });

                rcon.on('error', (err) => {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: err.message,
                    }));
                });

                try {
                    await rcon.connect(host, parseInt(port, 10), password);
                    ws.send(JSON.stringify({
                        type: 'connected',
                        message: `Connected to ${host}:${port}`,
                    }));
                    console.log(`[RCON] Connected to ${host}:${port}`);
                } catch (err) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Connection failed: ${err.message}`,
                    }));
                    rcon = null;
                }
                break;
            }

            case 'command': {
                const { command } = msg;

                if (!rcon || !rcon.isConnected) {
                    return ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Not connected to any server',
                    }));
                }

                if (!command || typeof command !== 'string') {
                    return ws.send(JSON.stringify({
                        type: 'error',
                        message: 'No command provided',
                    }));
                }

                try {
                    const response = await rcon.execute(command.trim());
                    ws.send(JSON.stringify({
                        type: 'response',
                        command: command.trim(),
                        body: response || '(no response)',
                    }));
                    console.log(`[RCON] > ${command.trim()}`);
                } catch (err) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Command failed: ${err.message}`,
                    }));
                }
                break;
            }

            case 'disconnect': {
                if (rcon) {
                    rcon.disconnect();
                    rcon = null;
                }
                ws.send(JSON.stringify({ type: 'disconnected' }));
                break;
            }

            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown message type: ${msg.type}`,
                }));
        }
    });

    ws.on('close', () => {
        console.log('[WS] Client disconnected');
        if (rcon) {
            rcon.disconnect();
            rcon = null;
        }
    });
});

server.listen(PORT, () => {
    console.log(`CS2 Web RCON running on http://localhost:${PORT}`);
});
