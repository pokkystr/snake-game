import { createGame, tick, validTurn, isDirection } from '../shared/game.js';

export const KEY_TO_DIRECTION = {
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowLeft: 'west',
  ArrowRight: 'east',
  KeyW: 'north',
  KeyS: 'south',
  KeyA: 'west',
  KeyD: 'east',
};

export function keyToDirection(code) {
  return KEY_TO_DIRECTION[code] ?? null;
}

// Local single-player game. Uses the shared pure rules in the browser only;
// it never opens a WebSocket or touches the multiplayer lobby.
export class SoloController {
  constructor(options = {}) {
    this.baseTickMs = Number.isFinite(options.tickMs) && options.tickMs > 0 ? options.tickMs : 150;
    this.tickMs = this.baseTickMs;
    this.countdownMs = Number.isFinite(options.countdownMs) && options.countdownMs >= 0
      ? options.countdownMs : 3000;
    this.now = options.now ?? (() => Date.now());
    this.onState = options.onState ?? (() => {});
    this.createTimer = options.createTimer ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => clearInterval(id));
    this.gameConfig = options.gameConfig ?? {};
    this.rng = this.gameConfig.rng ?? Math.random;
    this.state = null;
    this.pending = null;
    this.timerId = null;
    this.countdownEndsAt = null;
  }

  start() {
    this.stopTimer();
    this.state = createGame({
      ...this.gameConfig,
      tickMs: this.baseTickMs,
      players: [{ id: 'solo', name: 'You' }],
    });
    this.pending = null;
    this.tickMs = this.state.tickMs;
    if (this.countdownMs > 0) {
      this.countdownEndsAt = this.now() + this.countdownMs;
      this.state = { ...this.state, phase: 'countdown', countdownRemainingMs: this.countdownMs };
      this.timerId = this.createTimer(() => this.advanceCountdown(), Math.min(100, this.countdownMs));
    } else {
      this.countdownEndsAt = null;
      this.timerId = this.createTimer(() => this.step(), this.tickMs);
    }
    this.onState(this.state);
    return this.state;
  }

  advanceCountdown() {
    if (!this.state || this.state.phase !== 'countdown') return;
    const remaining = Math.max(0, this.countdownEndsAt - this.now());
    if (remaining > 0) {
      this.state = { ...this.state, countdownRemainingMs: remaining };
      this.onState(this.state);
      return;
    }
    this.stopTimer();
    this.countdownEndsAt = null;
    this.state = { ...this.state, phase: 'playing', countdownRemainingMs: 0 };
    this.timerId = this.createTimer(() => this.step(), this.tickMs);
    this.onState(this.state);
  }

  step() {
    if (!this.state || this.state.phase !== 'playing') return;
    const previousTickMs = this.tickMs;
    const intents = this.pending ? { solo: this.pending } : {};
    this.pending = null;
    this.state = tick(this.state, intents, this.rng);
    this.tickMs = this.state.tickMs;
    if (this.state.phase === 'over') this.stopTimer();
    else if (this.tickMs !== previousTickMs) {
      this.stopTimer();
      this.timerId = this.createTimer(() => this.step(), this.tickMs);
    }
    this.onState(this.state);
  }

  turn(dir) {
    if (!this.state || this.state.phase !== 'playing') return false;
    const snake = this.state.snakes[0];
    if (!isDirection(dir) || !validTurn(snake.dir, dir)) return false;
    this.pending = dir;
    return true;
  }

  restart() {
    return this.start();
  }

  getState() {
    return this.state;
  }

  stopTimer() {
    if (this.timerId !== null) {
      this.clearTimer(this.timerId);
      this.timerId = null;
    }
  }

  stop() {
    this.stopTimer();
    this.countdownEndsAt = null;
  }
}
