// Single Node process: static HTTP hosting plus the authoritative multiplayer
// WebSocket server. Binds 0.0.0.0 by default so LAN devices can reach the host,
// and prints local + LAN URLs at startup. Serves only known static files.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby, CLOSE_CODES } from './lobby.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PUBLIC_FILES = new Set([
  '/index.html',
  '/styles.css',
  '/app.js',
  '/single.js',
  '/multi.js',
  '/render.js',
]);
const SHARED_FILES = new Map([['/shared/game.js', path.join(ROOT, 'shared', 'game.js')]]);

function staticFile(urlPath) {
  if (urlPath === '/') return path.join(PUBLIC_DIR, 'index.html');
  if (SHARED_FILES.has(urlPath)) return SHARED_FILES.get(urlPath);
  if (PUBLIC_FILES.has(urlPath)) return path.join(PUBLIC_DIR, urlPath.slice(1));
  return null;
}

function createHandler() {
  return function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('method not allowed');
      return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('bad request');
      return;
    }
    if (urlPath === '/config') {
      const hostHeader = req.headers.host ?? 'localhost:3000';
      const port = hostHeader.includes(':') ? hostHeader.slice(hostHeader.indexOf(':')) : '';
      const lanUrls = lanAddresses().map((ip) => `http://${ip}${port}`);
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify({ wsPath: '/ws', lanUrls, port: Number(port.slice(1) || 0) }));
      return;
    }
    const file = staticFile(urlPath);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  };
}

export function lanAddresses() {
  const found = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) found.push(info.address);
    }
  }
  return found;
}

export function startServer({ port = 0, host = '0.0.0.0', options = {} } = {}) {
  const connections = new Map(); // connId -> WebSocket
  const lobby = new Lobby(options);
  lobby.onMessage = (targetConn, message) => {
    const ws = connections.get(targetConn);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const httpServer = http.createServer(createHandler());
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 2048 });
  wss.on('error', (error) => {
    process.stderr.write(`websocket server error: ${error.message}\n`);
  });

  wss.on('connection', (ws) => {
    const connId = crypto.randomUUID();
    connections.set(connId, ws);
    // Per-socket errors (e.g. maxPayload exceeded, WS_ERR_UNSUPPORTED_MESSAGE_
    // LENGTH after an oversized frame) crash the process when unhandled. ws
    // itself terminates the offending connection with close code 1009; we only
    // need to clean up our bookkeeping and keep serving everyone else.
    ws.on('error', () => {
      connections.delete(connId);
      lobby.leave(connId);
    });
    const send = (message) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };
    const playerId = () => lobby.connToPlayer.get(connId) ?? null;

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        send({ type: 'error', code: 'malformed', message: 'malformed' });
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString('utf8'));
      } catch {
        send({ type: 'error', code: 'malformed', message: 'malformed' });
        return;
      }
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
        send({ type: 'error', code: 'malformed', message: 'malformed' });
        return;
      }
      if (message.type === 'join') {
        const result = lobby.join(connId, message.name, Date.now());
        if (!result.ok && CLOSE_CODES[result.code]) ws.close(CLOSE_CODES[result.code], result.code);
        return;
      }
      const id = playerId();
      if (id === null) {
        send({ type: 'error', code: 'not_joined', message: 'not_joined' });
        return;
      }
      switch (message.type) {
        case 'start':
          lobby.requestStart(id, Date.now());
          break;
        case 'direction':
          lobby.setDirection(id, message.dir);
          break;
        case 'leave':
          lobby.leave(connId);
          ws.close(1000, 'leave');
          break;
        default:
          send({ type: 'error', code: 'unknown_type', message: 'unknown_type' });
      }
    });
    ws.on('close', () => {
      connections.delete(connId);
      lobby.leave(connId);
    });
  });

  const timer = setInterval(
    () => lobby.advance(Date.now()),
    Math.max(10, Math.floor(Math.min(lobby.tickMs, 70) / 2))
  );

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      const actual = httpServer.address().port;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      const url = `http://${displayHost}:${actual}`;
      resolve({
        lobby,
        httpServer,
        url,
        port: actual,
        close() {
          clearInterval(timer);
          for (const client of wss.clients) client.terminate();
          wss.close();
          return new Promise((done) => httpServer.close(done));
        },
      });
    });
  });
}

export function printAccessUrls(port) {
  const lines = [`Local:   http://localhost:${port}`];
  for (const ip of lanAddresses()) lines.push(`LAN:     http://${ip}:${port}`);
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  startServer({ port, options: { countdownMs: Number(process.env.SNAKE_COUNTDOWN_MS ?? 3000), tickMs: Number(process.env.SNAKE_TICK_MS ?? 150) } })
    .then((server) => {
      process.stdout.write(`Snake server listening on ${process.env.HOST ?? '0.0.0.0'}:${port}\n${printAccessUrls(port)}\n`);
      void server;
    })
    .catch((error) => {
      process.stderr.write(`failed to start: ${error.message}\n`);
      process.exitCode = 1;
    });
}
