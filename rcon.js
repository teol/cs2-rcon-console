/**
 * Source RCON Protocol Implementation
 * @see https://developer.valvesoftware.com/wiki/Source_RCON_Protocol
 *
 * Packet structure:
 * - 4 bytes: Packet size (Int32LE)
 * - 4 bytes: Request ID (Int32LE)
 * - 4 bytes: Packet type (Int32LE)
 * - N bytes: Body (null-terminated ASCII string)
 * - 1 byte:  Empty string terminator (0x00)
 */

const net = require('net');
const { EventEmitter } = require('events');

const PACKET_TYPE = {
    SERVERDATA_AUTH: 3,
    SERVERDATA_AUTH_RESPONSE: 2,
    SERVERDATA_EXECCOMMAND: 2,
    SERVERDATA_RESPONSE_VALUE: 0,
};

class RconClient extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.authenticated = false;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.responseBuffer = Buffer.alloc(0);
    }

    /**
     * Encode a packet following the Source RCON protocol
     */
    encodePacket(type, body) {
        const id = ++this.requestId;
        const bodyBuffer = Buffer.from(body, 'ascii');
        // Size = 4 (id) + 4 (type) + body length + 1 (body null) + 1 (empty string null)
        const size = 4 + 4 + bodyBuffer.length + 1 + 1;

        const packet = Buffer.alloc(4 + size);
        packet.writeInt32LE(size, 0);
        packet.writeInt32LE(id, 4);
        packet.writeInt32LE(type, 8);
        bodyBuffer.copy(packet, 12);
        packet.writeUInt8(0, 12 + bodyBuffer.length);     // Body null terminator
        packet.writeUInt8(0, 12 + bodyBuffer.length + 1);  // Empty string terminator

        return { id, packet };
    }

    /**
     * Decode a single packet from the buffer
     */
    decodePacket(buffer) {
        if (buffer.length < 4) return null;

        const size = buffer.readInt32LE(0);
        const totalLength = size + 4;

        if (buffer.length < totalLength) return null;

        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString('ascii', 12, 12 + size - 10);

        return {
            size,
            id,
            type,
            body,
            totalLength,
        };
    }

    /**
     * Connect to the RCON server
     */
    connect(host, port, password, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (this.socket) {
                this.disconnect();
            }

            this.socket = new net.Socket();
            this.authenticated = false;
            this.requestId = 0;
            this.pendingRequests.clear();
            this.responseBuffer = Buffer.alloc(0);

            const connectTimeout = setTimeout(() => {
                this.disconnect();
                reject(new Error('Connection timed out'));
            }, timeout);

            this.socket.connect(port, host, () => {
                clearTimeout(connectTimeout);
                // Authenticate immediately after connecting
                this.authenticate(password)
                    .then(() => resolve())
                    .catch((err) => reject(err));
            });

            this.socket.on('data', (data) => this.handleData(data));

            this.socket.on('error', (err) => {
                clearTimeout(connectTimeout);
                this.emit('error', err);
                reject(err);
            });

            this.socket.on('close', () => {
                this.authenticated = false;
                this.emit('disconnect');
                // Reject all pending requests
                for (const [id, pending] of this.pendingRequests) {
                    pending.reject(new Error('Connection closed'));
                }
                this.pendingRequests.clear();
            });
        });
    }

    /**
     * Handle incoming TCP data (may contain multiple or partial packets)
     */
    handleData(data) {
        this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

        let packet;
        while ((packet = this.decodePacket(this.responseBuffer)) !== null) {
            this.responseBuffer = this.responseBuffer.slice(packet.totalLength);
            this.handlePacket(packet);
        }
    }

    /**
     * Handle a decoded packet
     */
    handlePacket(packet) {
        const pending = this.pendingRequests.get(packet.id);
        if (pending) {
            this.pendingRequests.delete(packet.id);
            if (packet.type === PACKET_TYPE.SERVERDATA_AUTH_RESPONSE) {
                if (packet.id === -1) {
                    pending.reject(new Error('Authentication failed: wrong RCON password'));
                } else {
                    this.authenticated = true;
                    pending.resolve(true);
                }
            } else {
                pending.resolve(packet.body);
            }
        }

        this.emit('response', packet);
    }

    /**
     * Send authentication packet
     */
    authenticate(password) {
        return new Promise((resolve, reject) => {
            const { id, packet } = this.encodePacket(PACKET_TYPE.SERVERDATA_AUTH, password);

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Authentication timed out'));
            }, 5000);

            this.pendingRequests.set(id, {
                resolve: (val) => { clearTimeout(timeout); resolve(val); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
            });

            this.socket.write(packet);
        });
    }

    /**
     * Execute an RCON command
     */
    execute(command) {
        return new Promise((resolve, reject) => {
            if (!this.authenticated) {
                return reject(new Error('Not authenticated'));
            }

            const { id, packet } = this.encodePacket(PACKET_TYPE.SERVERDATA_EXECCOMMAND, command);

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Command timed out'));
            }, 10000);

            this.pendingRequests.set(id, {
                resolve: (val) => { clearTimeout(timeout); resolve(val); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
            });

            this.socket.write(packet);
        });
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.authenticated = false;
        this.pendingRequests.clear();
        this.responseBuffer = Buffer.alloc(0);
    }

    get isConnected() {
        return this.socket !== null && !this.socket.destroyed && this.authenticated;
    }
}

module.exports = { RconClient, PACKET_TYPE };
