import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 38500 + Math.floor(Math.random() * 500);
const URL = `http://127.0.0.1:${PORT}`;

function startChildServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.exited = false;
  child.stderrText = '';
  child.stderr.on('data', (chunk) => {
    child.stderrText += chunk.toString('utf8');
  });
  child.on('exit', () => {
    child.exited = true;
  });
  const listening = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (chunk.toString('utf8').includes('listening')) {
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error(`server exited early (code ${code}): ${child.stderrText}`)));
    setTimeout(() => reject(new Error('server did not start within 10s')), 10000).unref();
  });
  return { child, listening };
}

function connect() {
  const ws = new WebSocket(`${URL}/ws`);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function once(ws, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    ws.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args.length === 1 ? args[0] : args);
    });
  });
}

test('oversized frame is rejected with 1009 and the server survives; HTTP and fresh joins keep working', async (t) => {
  const { child, listening } = startChildServer();
  t.after(() => child.kill('SIGKILL'));
  await listening;

  // 1. Oversized frame: the offending client is rejected with close 1009.
  const oversized = await connect();
  const closed = once(oversized, 'close');
  oversized.send('x'.repeat(1_000_000));
  const [code] = await closed;
  assert.equal(code, 1009, 'oversized payload must close with 1009');

  // 2. The server process must still be alive after the rejected frame.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(child.exited, false, `server crashed: ${child.stderrText}`);

  // 3. HTTP still serves /config.
  const response = await fetch(`${URL}/config`);
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.wsPath, '/ws');

  // 4. A fresh WebSocket client can still join the lobby.
  const fresh = await connect();
  const welcomePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome after oversized rejection')), 3000);
    fresh.on('message', (data) => {
      const message = JSON.parse(data.toString('utf8'));
      if (message.type === 'welcome') {
        clearTimeout(timer);
        resolve(message);
      }
    });
  });
  fresh.send(JSON.stringify({ type: 'join', name: 'Ana' }));
  const welcome = await welcomePromise;
  assert.ok(welcome.playerId);
  assert.equal(child.exited, false, `server crashed later: ${child.stderrText}`);
  fresh.close();
});
