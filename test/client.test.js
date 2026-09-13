import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_TO_DIRECTION, SoloController, keyToDirection } from '../public/single.js';
import { MultiClient } from '../public/multi.js';
import * as app from '../public/app.js';
import { renderGame } from '../public/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { nextScreen } = app;

class FakeTimer {
  constructor() {
    this.fns = [];
  }
  create(fn) {
    this.fns.push(fn);
    return this.fns.length;
  }
  clear() {}
  fireAll() {
    for (const fn of [...this.fns]) fn();
  }
}

class FakeSocket {
  constructor() {
    this.sent = [];
    this.closed = null;
    this.onmessage = null;
    this.onclose = null;
    this.onopen = null;
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close(code) {
    this.closed = code ?? 1000;
    if (this.onclose) this.onclose({ code: this.closed });
  }
  receive(message) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(message) });
  }
}

class ConnectingSocket extends FakeSocket {
  constructor() {
    super();
    this.readyState = 0;
  }
  send(text) {
    if (this.readyState !== 1) {
      throw new Error('InvalidStateError: WebSocket is already in CLOSING or CLOSED state (simulates CONNECTING)');
    }
    super.send(text);
  }
  open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }
}

test('keyboard map covers arrows and WASD and ignores other keys', () => {
  assert.deepEqual(KEY_TO_DIRECTION, {
    ArrowUp: 'north',
    ArrowDown: 'south',
    ArrowLeft: 'west',
    ArrowRight: 'east',
    KeyW: 'north',
    KeyS: 'south',
    KeyA: 'west',
    KeyD: 'east',
  });
  assert.equal(keyToDirection('ArrowUp'), 'north');
  assert.equal(keyToDirection('KeyD'), 'east');
  assert.equal(keyToDirection('Space'), null);
});

test('mode routing: select leads to solo or multi, back returns to select, unknown is inert', () => {
  assert.equal(nextScreen('select', { type: 'choose-solo' }), 'solo');
  assert.equal(nextScreen('select', { type: 'choose-multi' }), 'multi');
  assert.equal(nextScreen('solo', { type: 'back' }), 'select');
  assert.equal(nextScreen('multi', { type: 'back' }), 'select');
  assert.equal(nextScreen('multi', { type: 'choose-solo' }), 'multi');
  assert.equal(nextScreen('solo', { type: 'nonsense' }), 'solo');
});

test('solo play: steer, score, die, and restart without any WebSocket', async () => {
  const RealWebSocket = globalThis.WebSocket;
  let socketUses = 0;
  globalThis.WebSocket = function Guarded(...args) {
    socketUses += 1;
    return new RealWebSocket(...args);
  };
  try {
    const timer = new FakeTimer();
    const seen = [];
    const solo = new SoloController({
      countdownMs: 0,
      createTimer: (fn) => timer.create(fn),
      clearTimer: () => {},
      onState: (state) => seen.push(state),
      gameConfig: { width: 20, height: 15, rng: () => 0.99 },
    });
    solo.start();
    assert.equal(solo.getState().phase, 'playing');
    assert.equal(solo.getState().snakes[0].score, 0);

    timer.fireAll();
    assert.equal(solo.getState().snakes[0].segments[0].x, 11);
    assert.equal(solo.turn('west'), false, 'reversal rejected');
    assert.equal(solo.turn('north'), true);
    timer.fireAll();
    assert.equal(solo.getState().snakes[0].dir, 'north');

    for (let i = 0; i < 30 && solo.getState().phase === 'playing'; i += 1) timer.fireAll();
    assert.equal(solo.getState().phase, 'over');
    assert.ok(seen.length > 5);
    assert.equal(socketUses, 0, 'single-player must never open a WebSocket');

    solo.restart();
    const fresh = solo.getState();
    assert.equal(fresh.phase, 'playing');
    assert.equal(fresh.snakes[0].score, 0);
    assert.equal(fresh.tick, 0);
    assert.equal(fresh.snakes[0].segments[0].x, 10);
  } finally {
    globalThis.WebSocket = RealWebSocket;
  }
});

test('solo turn is validated against the current server-independent rules state', () => {
  const timer = new FakeTimer();
  const solo = new SoloController({
    countdownMs: 0,
    createTimer: (fn) => timer.create(fn),
    clearTimer: () => {},
    gameConfig: { width: 20, height: 15, rng: () => 0.99 },
  });
  solo.start();
  assert.equal(solo.turn('up'), false);
  assert.equal(solo.turn('diagonal'), false);
  assert.equal(solo.turn('east'), true, 'straight ahead is accepted');
});

test('renderGame draws food and every snake cell onto the canvas context', () => {
  const calls = [];
  const ctx = {
    fillStyle: '#000',
    fillRect: (x, y, w, h) => calls.push({ x, y, w, h }),
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    fillText: () => {},
  };
  const state = {
    width: 20,
    height: 15,
    food: { x: 4, y: 4 },
    result: null,
    snakes: [
      { id: 'a', name: 'A', dir: 'east', score: 0, alive: true, segments: [{ x: 1, y: 1 }, { x: 0, y: 1 }] },
      { id: 'b', name: 'B', dir: 'west', score: 2, alive: false, segments: [{ x: 9, y: 9 }] },
    ],
  };
  renderGame(ctx, state, { cell: 10 });
  assert.equal(calls.filter((c) => c.x === 40 && c.y === 40).length, 1, 'food drawn once');
  assert.ok(calls.some((c) => c.x === 10 && c.y === 10), 'live head drawn');
  assert.ok(calls.some((c) => c.x === 90 && c.y === 90), 'dead body still drawn as obstacle');
});

test('special foods render with distinct colors and effect marks', () => {
  const draw = (type) => {
    const cells = [];
    const marks = [];
    const ctx = {
      fillStyle: '#000',
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      fillRect(x, y, width, height) { cells.push({ x, y, width, height, color: this.fillStyle }); },
      fillText(text) { marks.push(text); },
    };
    renderGame(ctx, { width: 24, height: 16, food: { x: 4, y: 4, type }, snakes: [] }, { cell: 20 });
    return { color: cells.find((cell) => cell.x === 80 && cell.y === 80)?.color, marks };
  };
  const normal = draw('normal');
  const triple = draw('triple');
  const shrink = draw('shrink');
  assert.notEqual(normal.color, triple.color);
  assert.notEqual(normal.color, shrink.color);
  assert.notEqual(triple.color, shrink.color);
  assert.ok(triple.marks.includes('3'));
  assert.ok(shrink.marks.includes('−'));
});

test('canvas backing pixels fit all 96×64 cells within a narrow screen', () => {
  assert.equal(typeof app.canvasBackingSize, 'function');
  const size = app.canvasBackingSize(96, 64, 320, 3);
  assert.deepEqual(size, { width: 640, height: 427 });
  assert.deepEqual(app.canvasBackingSize(48, 32, 960, 1), { width: 960, height: 640 });
});

function clientWithFakeSocket() {
  const socket = new FakeSocket();
  const events = [];
  const client = new MultiClient({
    createSocket: () => socket,
    onWelcome: (m) => events.push(['welcome', m]),
    onState: (s) => events.push(['state', s]),
    onError: (e) => events.push(['error', e]),
    onFatal: (f) => events.push(['fatal', f]),
  });
  client.open('ws://host/ws');
  if (socket.onopen) socket.onopen();
  return { client, socket, events };
}

test('multiplayer client joins by name, tracks welcome and lobby state, and sends intent only', () => {
  const { client, socket, events } = clientWithFakeSocket();
  client.join('Ana');
  assert.deepEqual(socket.sent.at(-1), { type: 'join', name: 'Ana' });
  socket.receive({ type: 'welcome', playerId: 'p1', hostId: 'p1' });
  assert.equal(client.playerId, 'p1');
  assert.equal(client.isHost(), true);
  socket.receive({
    type: 'state',
    phase: 'lobby',
    hostId: 'p1',
    players: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bo' }],
    game: null,
    result: null,
  });
  assert.equal(client.getState().phase, 'lobby');
  assert.deepEqual(
    client.getState().players.map((p) => p.name),
    ['Ana', 'Bo']
  );
  client.start();
  assert.deepEqual(socket.sent.at(-1), { type: 'start' });
  client.turn('north');
  assert.deepEqual(socket.sent.at(-1), { type: 'direction', dir: 'north' });
  assert.equal(events[0][0], 'welcome');
});

test('multiplayer client renders countdown, snapshots, results, and errors without inventing state', () => {
  const { client, socket } = clientWithFakeSocket();
  client.join('Bo');
  socket.receive({ type: 'welcome', playerId: 'p2', hostId: 'p1' });
  assert.equal(client.isHost(), false);
  socket.receive({ type: 'state', phase: 'countdown', hostId: 'p1', players: [], countdownRemainingMs: 2100, game: null, result: null });
  assert.equal(client.getState().phase, 'countdown');
  assert.equal(client.getState().countdownRemainingMs, 2100);
  socket.receive({
    type: 'state',
    phase: 'playing',
    hostId: 'p1',
    players: [],
    result: null,
    game: { width: 20, height: 15, phase: 'playing', tick: 7, food: { x: 2, y: 2 }, result: null, snakes: [] },
  });
  assert.equal(client.getState().game.tick, 7);
  socket.receive({ type: 'error', code: 'direction_limit', message: 'direction_limit' });
  assert.equal(client.lastErrorCode, 'direction_limit');
  socket.receive({
    type: 'state',
    phase: 'result',
    hostId: 'p1',
    players: [],
    result: { winnerIds: ['p1'], draw: false },
    game: { phase: 'over', result: { winnerIds: ['p1'], draw: false } },
  });
  assert.deepEqual(client.getState().result.winnerIds, ['p1']);
});

test('multiplayer client surfaces rejections and closes with a reason', () => {
  const { client, socket, events } = clientWithFakeSocket();
  client.join('Eve');
  socket.receive({ type: 'error', code: 'lobby_full', message: 'lobby_full' });
  socket.close(4002);
  const fatal = events.find((e) => e[0] === 'fatal');
  assert.ok(fatal, 'onFatal invoked');
  assert.equal(fatal[1].code, 4002);
  assert.equal(fatal[1].reason, 'lobby_full');
});

test('multiplayer client detects host transfers from state messages', () => {
  const { client, socket } = clientWithFakeSocket();
  client.join('Bo');
  socket.receive({ type: 'welcome', playerId: 'p2', hostId: 'p1' });
  assert.equal(client.isHost(), false);
  socket.receive({ type: 'state', phase: 'lobby', hostId: 'p2', players: [], game: null, result: null });
  assert.equal(client.isHost(), true);
});

test('LAN join blocker: intents on a CONNECTING socket queue and send exactly once on open', () => {
  const socket = new ConnectingSocket();
  const events = [];
  const client = new MultiClient({
    createSocket: () => socket,
    onWelcome: (m) => events.push(['welcome', m]),
    onState: (s) => events.push(['state', s]),
    onError: (e) => events.push(['error', e]),
    onFatal: (f) => events.push(['fatal', f]),
  });
  client.open('ws://host/ws');
  client.join('Ana');
  client.turn('north');
  assert.deepEqual(socket.sent, [], 'nothing is sent while CONNECTING');
  socket.open();
  assert.deepEqual(socket.sent, [
    { type: 'join', name: 'Ana' },
    { type: 'direction', dir: 'north' },
  ]);
  assert.equal(socket.sent.filter((m) => m.type === 'join').length, 1);
  client.turn('east');
  assert.deepEqual(socket.sent.at(-1), { type: 'direction', dir: 'east' });
});

test('close while still connecting surfaces a disconnect fatal and stops sending', () => {
  const socket = new ConnectingSocket();
  const events = [];
  const client = new MultiClient({
    createSocket: () => socket,
    onFatal: (f) => events.push(['fatal', f]),
  });
  client.open('ws://host/ws');
  client.join('Ana');
  socket.close(1006);
  const fatal = events.find((e) => e[0] === 'fatal');
  assert.ok(fatal, 'onFatal invoked');
  assert.equal(fatal[1].reason, 'disconnected');
  client.turn('north');
  assert.deepEqual(socket.sent, [], 'no sends after the socket closed');
});

test('public client files are served by the HTTP layer', async () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'single.js', 'multi.js', 'render.js']) {
    const stat = await fs.stat(path.join(ROOT, 'public', file));
    assert.ok(stat.isFile(), `${file} exists`);
  }
});
