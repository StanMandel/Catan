'use strict';
/**
 * Serveur WebSocket minimal (RFC 6455) sans aucune dependance externe.
 * Supporte : handshake, frames texte, fragmentation, ping/pong, close.
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    this.closed = false;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
    this.isAlive = true;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', () => this.destroy());
    socket.on('close', () => this._onClose());
    socket.setTimeout(0);
    socket.setNoDelay(true);
  }

  _onClose() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Protection basique contre les messages absurdes
    if (this.buffer.length > 8 * 1024 * 1024) return this.destroy();
    for (;;) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handleFrame(frame);
      if (this.closed) break;
    }
  }

  _readFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return null;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < offset + 2) return null;
      len = buf.readUInt16BE(offset); offset += 2;
    } else if (len === 127) {
      if (buf.length < offset + 8) return null;
      const big = buf.readBigUInt64BE(offset); offset += 8;
      if (big > 8n * 1024n * 1024n) { this.destroy(); return null; }
      len = Number(big);
    }
    let mask = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      mask = buf.slice(offset, offset + 4); offset += 4;
    }
    if (buf.length < offset + len) return null;
    let payload = buf.slice(offset, offset + len);
    if (masked) {
      const out = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
      payload = out;
    }
    this.buffer = buf.slice(offset + len);
    return { fin, opcode, payload };
  }

  _handleFrame(frame) {
    const { fin, opcode, payload } = frame;
    if (opcode === 0x8) { // close
      this.close();
      return;
    }
    if (opcode === 0x9) { // ping
      this._send(0xA, payload);
      return;
    }
    if (opcode === 0xA) { // pong
      this.isAlive = true;
      return;
    }
    if (opcode === 0x0) { // continuation
      this.fragments.push(payload);
    } else if (opcode === 0x1 || opcode === 0x2) {
      this.fragments = [payload];
      this.fragmentOpcode = opcode;
    } else {
      return;
    }
    if (!fin) return;
    const data = Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.fragmentOpcode === 0x1) {
      let msg = null;
      try { msg = JSON.parse(data.toString('utf8')); } catch (e) { return; }
      this.emit('message', msg);
    }
  }

  _send(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) { this.destroy(); }
  }

  send(obj) {
    this._send(0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
  }

  ping() {
    this.isAlive = false;
    this._send(0x9, Buffer.alloc(0));
  }

  close() {
    if (this.closed) return;
    this._send(0x8, Buffer.alloc(0));
    this.closed = true;
    try { this.socket.end(); } catch (e) {}
    this.emit('close');
  }

  destroy() {
    if (this.closed) { try { this.socket.destroy(); } catch (e) {} return; }
    this.closed = true;
    try { this.socket.destroy(); } catch (e) {}
    this.emit('close');
  }
}

class WSServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.clients = new Set();
    httpServer.on('upgrade', (req, socket, head) => this._upgrade(req, socket, head));
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.isAlive) { c.destroy(); continue; }
        c.ping();
      }
    }, 25000);
    this.heartbeat.unref && this.heartbeat.unref();
  }

  _upgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (req.headers.upgrade !== 'websocket' || !key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    const conn = new WSConnection(socket, req);
    if (head && head.length) conn._onData(head);
    this.clients.add(conn);
    conn.on('close', () => this.clients.delete(conn));
    this.emit('connection', conn, req);
  }
}

module.exports = { WSServer, WSConnection };
