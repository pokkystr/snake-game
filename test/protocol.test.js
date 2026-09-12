import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

function waitReady(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

class Client {
  constructor(ws) {
    this.ws = ws;
    this.messages = [];
    this.waiters = [];
    this.closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
    ws.on('message', (raw) => {
      this.messages.push(JSON.parse(raw.toString('utf8')));
      for (const waiter of [...this.waiters]) {
        const found = this.messages.find(waiter.predicate);
        if (found) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(found);
        }
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await waitReady(ws);
    return new Client(ws);
  }

  send(object) {
    this.ws.send(JSON.stringify(object));
  }

  sendRaw(text) {
    this.ws.send(text);
  }

  waitFor(predicate, label, timeoutMs = 2000) {
    const found = this.messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(entry);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`timed out waiting for ${label}; got ${JSON.stringify(this.messages)}`));
      }, timeoutMs);
      const entry = {
        predicate,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      };
      this.waiters.push(entry);
    });
  }

  waitForState(phase, timeoutMs = 2000) {
    return this.waitFor(
      (m) => m.type === 'state' && m.phase === phase,
      `state ${phase}`,
      timeoutMs
    );
  }

  waitForError(code, timeoutMs = 2000) {
    return this.waitFor((m) => m.type === 'error' && m.code === code, `error ${code}`, timeoutMs);
  }

  close() {
    this.ws.close();
  }
}

async function withServer(run) {
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    options: { countdownMs: 150, tickMs: 40, quiet: true },
  });
  try {
    await run(server.url);
  } finally {
    await server.close();
  }
}

test('mode boundary: joining is opt-in, welcome assigns identity, lobby renders players', async () => {
  await withServer(async (url) => {
    const a = await Client.connect(`${url}/ws`);
    a.send({ type: 'join', name: 'Ana' });
    const welcomeA = await a.waitFor((m) => m.type === 'welcome', 'welcome A');
    assert.ok(welcomeA.playerId);
    assert.equal(welcomeA.hostId, welcomeA.playerId);
    const lobbyA = await a.waitForState('lobby');
    assert.deepEqual(lobbyA.players.map((p) => p.name), ['Ana']);

    const b = await Client.connect(`${url}/ws`);
    b.send({ type: 'join', name: 'Bo' });
    const welcomeB = await b.waitFor((m) => m.type === 'welcome', 'welcome B');
    assert.notEqual(welcomeA.playerId, welcomeB.playerId);
    const lobbyB = await b.waitForState('lobby');
    assert.deepEqual(lobbyB.players.map((p) => p.name), ['Ana', 'Bo']);
    assert.equal(lobbyB.hostId, welcomeA.playerId);
    a.close();
    b.close();
  });
});

test('full server-authoritative match: countdown, ticks, direction, elimination', async () => {
  await withServer(async (url) => {
    const a = await Client.connect(`${url}/ws`);
    a.send({ type: 'join', name: 'Ana' });
    const welcomeA = await a.waitFor((m) => m.type === 'welcome', 'welcome A');
    const b = await Client.connect(`${url}/ws`);
    b.send({ type: 'join', name: 'Bo' });
    await b.waitFor((m) => m.type === 'welcome', 'welcome B');

    b.send({ type: 'start' });
    await b.waitForError('not_host');
    a.send({ type: 'start' });
    await a.waitForState('countdown');

    const playing = await a.waitForState('playing', 4000);
    assert.equal(playing.game.phase, 'playing');
    const snakeA = playing.game.snakes.find((s) => s.id === welcomeA.playerId);
    assert.equal(snakeA.dir, 'east');
    a.send({ type: 'direction', dir: 'north' });
    a.send({ type: 'direction', dir: 'north' });
    await a.waitForError('direction_limit');
    const turned = await a.waitFor(
      (m) => m.type === 'state' && m.game?.snakes?.find((s) => s.id === welcomeA.playerId)?.dir === 'north',
      'north turn'
    );
    assert.ok(turned.game.tick >= 1);

    a.send({ type: 'direction', dir: 'north' });
    const crashed = await a.waitForState('result', 4000);
    assert.deepEqual(crashed.result.winnerIds, [crashed.game.snakes.find((s) => s.alive).id]);
    assert.notEqual(crashed.result.winnerIds[0], welcomeA.playerId);
    a.close();
    b.close();
  });
});

test('late join during a match is rejected and closed', async () => {
  await withServer(async (url) => {
    const a = await Client.connect(`${url}/ws`);
    a.send({ type: 'join', name: 'Ana' });
    const b = await Client.connect(`${url}/ws`);
    b.send({ type: 'join', name: 'Bo' });
    await b.waitFor((m) => m.type === 'welcome', 'welcome B');
    a.send({ type: 'start' });
    await a.waitForState('playing', 4000);
    const c = await Client.connect(`${url}/ws`);
    c.send({ type: 'join', name: 'Cy' });
    await c.waitForError('match_in_progress');
    assert.equal(await c.closed, 4001);
    a.close();
    b.close();
  });
});

test('a fifth lobby member is rejected and closed', async () => {
  await withServer(async (url) => {
    const clients = [];
    for (const name of ['A', 'B', 'C', 'D']) {
      const client = await Client.connect(`${url}/ws`);
      client.send({ type: 'join', name });
      await client.waitForState('lobby');
      clients.push(client);
    }
    const extra = await Client.connect(`${url}/ws`);
    extra.send({ type: 'join', name: 'Eve' });
    await extra.waitForError('lobby_full');
    assert.equal(await extra.closed, 4002);
    for (const client of clients) client.close();
  });
});

test('malformed JSON, unknown message types, and pre-join messages get bounded errors', async () => {
  await withServer(async (url) => {
    const a = await Client.connect(`${url}/ws`);
    a.send({ type: 'direction', dir: 'north' });
    await a.waitForError('not_joined');
    a.sendRaw('{"type":"join",name broken');
    await a.waitForError('malformed');
    a.sendRaw('');
    await a.waitFor((m) => m.type === 'error' && m.code === 'malformed', 'second malformed');
    a.send({ type: 'direction', dir: 'west' });
    await a.waitFor((m) => m.type === 'error' && m.code === 'not_joined', 'pre-join not_joined');
    a.send({ type: 'join', name: 'Ana' });
    await a.waitFor((m) => m.type === 'welcome', 'welcome after recovery');
    a.send({ type: 'teleport', x: 5, y: 5 });
    await a.waitForError('unknown_type');
    a.close();
  });
});

test('disconnect during lobby removes the member and transfers host over the wire', async () => {
  await withServer(async (url) => {
    const a = await Client.connect(`${url}/ws`);
    a.send({ type: 'join', name: 'Ana' });
    await a.waitForState('lobby');
    const b = await Client.connect(`${url}/ws`);
    b.send({ type: 'join', name: 'Bo' });
    const welcomeB = await b.waitFor((m) => m.type === 'welcome', 'welcome B');
    a.close();
    const state = await b.waitFor(
      (m) => m.type === 'state' && m.players.length === 1 && m.phase === 'lobby',
      'solo lobby'
    );
    assert.equal(state.hostId, welcomeB.playerId);
    b.close();
  });
});
