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
    this.tickMs = options.tickMs ?? 150;
    this.onState = options.onState ?? (() => {});
    this.createTimer = options.createTimer ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => clearInterval(id));
    this.gameConfig = options.gameConfig ?? {};
    this.rng = this.gameConfig.rng ?? Math.random;
    this.state = null;
    this.pending = null;
    this.timerId = null;
  }

  start() {
    this.stopTimer();
    this.state = createGame({
      ...this.gameConfig,
      players: [{ id: 'solo', name: 'You' }],
    });
    this.pending = null;
    this.timerId = this.createTimer(() => this.step(), this.tickMs);
    this.onState(this.state);
    return this.state;
  }

  step() {
    if (!this.state) return;
    const intents = this.pending ? { solo: this.pending } : {};
    this.pending = null;
    this.state = tick(this.state, intents, this.rng);
    this.onState(this.state);
    if (this.state.phase === 'over') this.stopTimer();
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
  }
}
