// Server-authoritative multiplayer session state. Transport-agnostic: the
// WebSocket layer in index.js routes messages in and snapshots out. Time is
// injected through advance(now) so the lobby is fully unit-testable.
//
// Phases: lobby -> countdown -> playing -> result (-> countdown ...).
// Clients never send position, score, or identity; the server assigns ids.

import { createGame, tick, isDirection, validTurn } from '../shared/game.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MAX_NAME_CODEPOINTS = 20;
export const CLOSE_CODES = {
  match_in_progress: 4001,
  lobby_full: 4002,
  invalid_name: 4003,
};

function sanitizeName(rawName) {
  const name = String(rawName ?? '').trim();
  if (name === '') return null;
  const chars = [...name];
  return chars.slice(0, MAX_NAME_CODEPOINTS).join('');
}

function serializeGame(game) {
  return {
    width: game.width,
    height: game.height,
    phase: game.phase,
    tick: game.tick,
    food: game.food ? { ...game.food } : null,
    result: game.result ? { winnerIds: [...game.result.winnerIds], draw: game.result.draw } : null,
    snakes: game.snakes.map((snake) => ({
      id: snake.id,
      name: snake.name,
      dir: snake.dir,
      score: snake.score,
      alive: snake.alive,
      segments: snake.segments.map((cell) => ({ x: cell.x, y: cell.y })),
    })),
  };
}

export class Lobby {
  constructor(options = {}) {
    this.countdownMs = Number.isFinite(options.countdownMs) ? options.countdownMs : 3000;
    this.tickMs = Number.isFinite(options.tickMs) ? options.tickMs : 150;
    this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
    this.onMessage = typeof options.onMessage === 'function' ? options.onMessage : () => {};
    this.width = options.width;
    this.height = options.height;
    this.phase = 'lobby';
    this.players = new Map(); // playerId -> { id, connId, name }
    this.order = []; // playerIds in join order; order[0] is the host
    this.connToPlayer = new Map();
    this.game = null;
    this.countdownEndsAt = null;
    this.nextTickAt = null;
    this.clock = 0;
    this.pendingDirs = new Map(); // playerId -> dir waiting for the next tick
    this.dirThisTick = new Set(); // players who already steered this tick
    this.sequence = 0;
  }

  // --- message plumbing -------------------------------------------------

  to(connId, message) {
    this.onMessage(connId, message);
  }

  broadcast(message) {
    for (const connId of this.connToPlayer.keys()) this.to(connId, message);
  }

  fail(connId, code) {
    this.to(connId, { type: 'error', code, message: code });
  }

  hostId() {
    return this.order[0] ?? null;
  }

  viewFor(connId) {
    if (!this.connToPlayer.has(connId)) return null;
    const inMatch = this.game !== null;
    return {
      type: 'state',
      phase: this.phase,
      hostId: this.hostId(),
      players: this.order.map((id) => {
        const player = this.players.get(id);
        const entry = { id: player.id, name: player.name };
        if (inMatch) {
          const snake = this.game.snakes.find((s) => s.id === id);
          entry.score = snake ? snake.score : 0;
          entry.alive = snake ? snake.alive : false;
        }
        return entry;
      }),
      countdownRemainingMs:
        this.phase === 'countdown' ? Math.max(0, this.countdownEndsAt - this.clock) : undefined,
      game: this.game ? serializeGame(this.game) : null,
      result: this.game ? serializeGame(this.game).result : null,
    };
  }

  broadcastState() {
    for (const connId of this.connToPlayer.keys()) this.to(connId, this.viewFor(connId));
  }

  // --- lifecycle events ---------------------------------------------------

  join(connId, rawName, now = this.clock) {
    this.clock = Math.max(this.clock, now ?? this.clock);
    if (this.connToPlayer.has(connId)) return { ok: false, code: 'already_joined' };
    const name = sanitizeName(rawName);
    if (name === null) {
      this.fail(connId, 'invalid_name');
      return { ok: false, code: 'invalid_name' };
    }
    if (this.phase === 'countdown' || this.phase === 'playing') {
      this.fail(connId, 'match_in_progress');
      return { ok: false, code: 'match_in_progress' };
    }
    if (this.players.size >= MAX_PLAYERS) {
      this.fail(connId, 'lobby_full');
      return { ok: false, code: 'lobby_full' };
    }
    this.sequence += 1;
    const id = `p-${connId}`;
    this.players.set(id, { id, connId, name });
    this.order.push(id);
    this.connToPlayer.set(connId, id);
    this.to(connId, { type: 'welcome', playerId: id, hostId: this.hostId() });
    this.broadcastState();
    return { ok: true, playerId: id };
  }

  leave(connId) {
    const playerId = this.connToPlayer.get(connId);
    if (playerId === undefined) return;
    this.connToPlayer.delete(connId);
    this.players.delete(playerId);
    this.order = this.order.filter((id) => id !== playerId);
    this.pendingDirs.delete(playerId);
    this.dirThisTick.delete(playerId);
    if (this.phase === 'countdown' && this.players.size < MIN_PLAYERS) {
      this.phase = 'lobby';
      this.countdownEndsAt = null;
    } else if (this.phase === 'playing' && this.game) {
      this.game = {
        ...this.game,
        snakes: this.game.snakes.map((snake) =>
          snake.id === playerId ? { ...snake, alive: false } : snake
        ),
      };
    }
    this.broadcastState();
  }

  requestStart(playerId, now = this.clock) {
    this.clock = Math.max(this.clock, now ?? this.clock);
    if (!this.players.has(playerId)) return;
    if (playerId !== this.hostId()) {
      this.to(this.players.get(playerId).connId, { type: 'error', code: 'not_host', message: 'not_host' });
      return;
    }
    if (this.phase === 'countdown' || this.phase === 'playing') return;
    if (this.players.size < MIN_PLAYERS) {
      this.to(this.players.get(playerId).connId, {
        type: 'error',
        code: 'not_enough_players',
        message: 'not_enough_players',
      });
      return;
    }
    this.phase = 'countdown';
    this.game = null;
    this.pendingDirs.clear();
    this.dirThisTick.clear();
    this.countdownEndsAt = this.clock + this.countdownMs;
    this.broadcastState();
  }

  setDirection(playerId, dir) {
    if (!this.players.has(playerId)) return;
    const connId = this.players.get(playerId).connId;
    if (!isDirection(dir)) {
      this.fail(connId, 'invalid_direction');
      return;
    }
    if (this.phase === 'countdown') {
      this.pendingDirs.set(playerId, dir);
      return;
    }
    if (this.phase !== 'playing') return;
    if (this.dirThisTick.has(playerId)) {
      this.fail(connId, 'direction_limit');
      return;
    }
    const snake = this.game.snakes.find((s) => s.id === playerId);
    if (!snake || !snake.alive) return;
    if (!validTurn(snake.dir, dir)) {
      this.fail(connId, 'invalid_direction');
      return;
    }
    this.pendingDirs.set(playerId, dir);
    this.dirThisTick.add(playerId);
  }

  // --- clock --------------------------------------------------------------

  advance(now) {
    this.clock = Math.max(this.clock, now ?? this.clock);
    if (this.phase === 'countdown' && this.clock >= this.countdownEndsAt) {
      this.startMatch();
    }
    if (this.phase === 'playing') {
      while (this.phase === 'playing' && this.clock >= this.nextTickAt) {
        this.runGameTick();
      }
    }
  }

  startMatch() {
    const config = {
      players: this.order.map((id) => ({ id, name: this.players.get(id).name })),
      rng: this.rng,
    };
    if (this.width) config.width = this.width;
    if (this.height) config.height = this.height;
    this.game = createGame(config);
    this.phase = 'playing';
    this.countdownEndsAt = null;
    this.nextTickAt = this.clock + this.tickMs;
    this.dirThisTick.clear();
    this.broadcastState();
  }

  runGameTick() {
    const intents = Object.fromEntries(this.pendingDirs);
    this.pendingDirs.clear();
    this.dirThisTick.clear();
    this.game = tick(this.game, intents, this.rng);
    this.nextTickAt += this.tickMs;
    if (this.game.phase === 'over') {
      this.phase = 'result';
    }
    this.broadcastState();
  }

  advanceUntilOver(untilNow) {
    let guard = 0;
    while (this.phase !== 'result' && this.clock < untilNow && guard < 1000) {
      const target = this.phase === 'countdown' ? this.countdownEndsAt : this.nextTickAt;
      this.advance(Math.min(untilNow, target));
      guard += 1;
    }
    return this.viewFor(this.connToPlayer.keys().next().value);
  }
}
