import test from 'node:test';
import assert from 'node:assert/strict';
import { SoloController } from '../public/single.js';

class FakeClock {
  now = 0;
  nextId = 1;
  timers = new Map();

  setInterval = (fn, ms) => {
    const id = this.nextId++;
    this.timers.set(id, { fn, ms, due: this.now + ms });
    return id;
  };

  clearInterval = (id) => this.timers.delete(id);

  advance(ms) {
    const target = this.now + ms;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      this.now = timer.due;
      timer.due += timer.ms;
      if (this.timers.has(id)) timer.fn();
    }
    this.now = target;
  }
}

function createSolo(clock, options = {}) {
  return new SoloController({
    now: () => clock.now,
    createTimer: clock.setInterval,
    clearTimer: clock.clearInterval,
    gameConfig: { width: 20, height: 15, rng: () => 0.5 },
    ...options,
  });
}

test('solo waits through 3-2-1 before its first movement tick', () => {
  const clock = new FakeClock();
  const solo = createSolo(clock);
  solo.start();
  const head = { ...solo.getState().snakes[0].segments[0] };
  assert.equal(solo.getState().phase, 'countdown');
  assert.equal(solo.getState().countdownRemainingMs, 3000);
  clock.advance(2999);
  assert.equal(solo.getState().phase, 'countdown');
  assert.equal(solo.getState().tick, 0);
  assert.deepEqual(solo.getState().snakes[0].segments[0], head);
  clock.advance(1);
  assert.equal(solo.getState().phase, 'playing');
  assert.equal(solo.getState().tick, 0);
  clock.advance(149);
  assert.equal(solo.getState().tick, 0);
  clock.advance(1);
  assert.equal(solo.getState().tick, 1);
});

test('solo restart resets countdown and level without leaving an old timer active', () => {
  const clock = new FakeClock();
  const solo = createSolo(clock);
  solo.start();
  clock.advance(1000);
  solo.restart();
  assert.equal(solo.getState().level, 1);
  assert.equal(solo.getState().tickMs, 150);
  clock.advance(2000);
  assert.equal(solo.getState().phase, 'countdown');
  assert.equal(solo.getState().tick, 0);
  clock.advance(1000);
  assert.equal(solo.getState().phase, 'playing');
  assert.equal(clock.timers.size, 1);
  solo.stop();
  assert.equal(clock.timers.size, 0);
});

test('solo changes its real timer interval when food raises the level', () => {
  const clock = new FakeClock();
  const solo = createSolo(clock, { countdownMs: 0 });
  solo.start();
  assert.equal(solo.getState().phase, 'playing');
  solo.state.snakes[0].score = 2;
  const head = solo.state.snakes[0].segments[0];
  solo.state.food = { x: head.x + 1, y: head.y };
  clock.advance(150);
  assert.equal(solo.getState().level, 2);
  assert.equal(solo.getState().tickMs, 140);
  assert.equal(solo.getState().tick, 1);
  clock.advance(139);
  assert.equal(solo.getState().tick, 1);
  clock.advance(1);
  assert.equal(solo.getState().tick, 2);
});
