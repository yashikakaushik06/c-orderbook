/**
 * ipc-client.js
 * Reads newline-delimited JSON from the C++ engine Unix domain socket.
 * Emits parsed events: 'indicators', 'alert', 'connected', 'disconnected', 'error'
 * Reconnects automatically with exponential backoff.
 */

import net from 'net';
import EventEmitter from 'events';
import { logger } from './logger.js';

const MIN_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 30_000;

export class IpcClient extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPath = socketPath;
    this.socket     = null;
    this.connected  = false;
    this.buffer     = '';
    this.reconnectDelay = MIN_RECONNECT_MS;
    this._destroyed = false;
  }

  connect() {
    if (this._destroyed) return;

    this.socket = net.createConnection(this.socketPath);

    this.socket.on('connect', () => {
      this.connected = true;
      this.reconnectDelay = MIN_RECONNECT_MS;
      this.buffer = '';
      this.emit('connected');
    });

    // Accumulate data and split on newlines (newline-delimited JSON)
    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let nl;
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line.length > 0) this._handleLine(line);
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
      this._scheduleReconnect();
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
      // 'close' will fire after error and trigger reconnect
    });
  }

  disconnect() {
    this._destroyed = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  _handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      logger.warn('IPC: invalid JSON', { line: line.slice(0, 120) });
      return;
    }
    const type = msg.type;
    if (type === 'indicators' || type === 'alert') {
      this.emit(type, msg);
    } else {
      logger.debug('IPC: unknown message type', { type });
    }
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    const delay = this.reconnectDelay;
    logger.info(`IPC: reconnecting in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
  }
}
