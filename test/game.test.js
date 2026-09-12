import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, createGame, tick, validTurn } from '../shared/game.js';

const cells = (snake) => snake.segments.map((s) => `${s.x},${s.y}`);
const byId = (state, id) => state.snakes.find((s) => s.id === id);

function seqRng(start = 0) {
  let n = start;
  return () => {
    n = (n + 1) % 97;
    return n / 97;
  };
}

function soloState(overrides = {}) {
  return createGame({
    width: 20,
    height: 15,
    players: [{ id: 'p1', name: 'Solo' }],
    rng: seqRng(0),
    food: { x: 1, y: 1 },
    ...overrides,
  });
}

function twoSnakes(p1, p2, extra = {}) {
  const base = soloState(extra);
  return {
    ...base,
    snakes: [
      { id: 'p1', name: 'A', score: 0, alive: true, ...p1 },
      { id: 'p2', name: 'B', score: 0, alive: true, ...p2 },
    ],
  };
}

test('createGame exposes board, snakes, food, phase, and scores', () => {
  const state = createGame({
    width: 20,
    height: 15,
    players: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bo' },
    ],
    rng: seqRng(0),
  });
  assert.equal(state.width, 20);
  assert.equal(state.height, 15);
  assert.equal(state.phase, 'playing');
  assert.equal(state.snakes.length, 2);
  assert.deepEqual(
    state.snakes.map((s) => s.score),
    [0, 0]
  );
  assert.equal(state.result, null);
  assert.ok(state.food && Number.isInteger(state.food.x) && Number.isInteger(state.food.y));
});

test('four-player spawns are distinct, in bounds, and safe to move from', () => {
  const state = createGame({
    width: 20,
    height: 15,
    players: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}` })),
    rng: seqRng(0),
  });
  const seen = new Set();
  for (const snake of state.snakes) {
    assert.equal(snake.segments.length, 3);
    for (const cell of snake.segments) {
      assert.ok(cell.x >= 0 && cell.x < 20 && cell.y >= 0 && cell.y < 15);
      const key = `${cell.x},${cell.y}`;
      assert.ok(!seen.has(key), 'spawn cells must not overlap');
      seen.add(key);
    }
  }
  assert.ok(!seen.has(`${state.food.x},${state.food.y}`), 'food must not spawn on a snake');
  const first = tick(state);
  for (const snake of first.snakes) {
    assert.ok(snake.alive, 'no snake should die on the first tick');
  }
});

test('snake moves one cell forward each tick without growing', () => {
  const state = soloState();
  const before = byId(state, 'p1').segments[0];
  const next = tick(state);
  assert.deepEqual(byId(next, 'p1').segments[0], { x: before.x + 1, y: before.y });
  assert.equal(byId(next, 'p1').segments.length, 3);
  assert.equal(DIRECTIONS.east.dx, 1);
  assert.equal(DIRECTIONS.east.dy, 0);
});

test('food is never placed on a snake across many seeds', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const state = createGame({
      width: 16,
      height: 12,
      players: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}` })),
      rng: seqRng(seed),
    });
    const occupied = new Set(state.snakes.flatMap(cells));
    assert.ok(!occupied.has(`${state.food.x},${state.food.y}`));
  }
});

test('eating food grows the snake, scores a point, and places new food', () => {
  const state = soloState({ food: { x: 11, y: 7 } });
  const next = tick(state);
  const snake = byId(next, 'p1');
  assert.equal(snake.segments.length, 4);
  assert.equal(snake.score, 1);
  assert.ok(next.food);
  assert.notEqual(`${next.food.x},${next.food.y}`, '11,7');
  const occupied = new Set(next.snakes.flatMap(cells));
  assert.ok(!occupied.has(`${next.food.x},${next.food.y}`));
});

test('hitting a wall kills the snake and ends a solo game with no winner', () => {
  let state = soloState();
  for (let i = 0; i < 9; i += 1) {
    state = tick(state);
    assert.equal(byId(state, 'p1').alive, true);
    assert.equal(state.phase, 'playing');
  }
  const dead = tick(state);
  assert.equal(byId(dead, 'p1').alive, false);
  assert.equal(dead.phase, 'over');
  assert.deepEqual(dead.result.winnerIds, []);
  assert.equal(dead.result.draw, true);
});

test('hitting its own body kills a snake', () => {
  const state = soloState();
  const looped = {
    ...state,
    snakes: [
      {
        id: 'p1',
        name: 'Solo',
        score: 0,
        alive: true,
        dir: 'south',
        segments: [
          { x: 9, y: 7 },
          { x: 9, y: 8 },
          { x: 8, y: 8 },
          { x: 7, y: 8 },
          { x: 7, y: 7 },
        ],
      },
    ],
  };
  const next = tick(looped);
  assert.equal(next.phase, 'over');
  assert.equal(byId(next, 'p1').alive, false);
});

test('validTurn rejects reversals and unknown directions but accepts turns and straight', () => {
  assert.equal(validTurn('east', 'west'), false);
  assert.equal(validTurn('west', 'east'), false);
  assert.equal(validTurn('north', 'south'), false);
  assert.equal(validTurn('south', 'north'), false);
  assert.equal(validTurn('east', 'north'), true);
  assert.equal(validTurn('east', 'east'), true);
  assert.equal(validTurn('east', 'up'), false);
  assert.equal(validTurn('east', 'diagonal'), false);
});

test('a reversal intent is rejected and the snake keeps its direction', () => {
  const state = soloState();
  const next = tick(state, { p1: 'west' });
  assert.equal(byId(next, 'p1').dir, 'east');
  assert.ok(byId(next, 'p1').alive);
});

test('moving into a cell vacated by a non-eating tail is allowed', () => {
  const state = twoSnakes(
    { dir: 'west', segments: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }] },
    { dir: 'west', segments: [{ x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }] }
  );
  const next = tick(state);
  assert.equal(byId(next, 'p1').alive, true);
  assert.equal(byId(next, 'p2').alive, true);
  assert.deepEqual(byId(next, 'p2').segments[0], { x: 6, y: 4 });
});

test('a snake eating food keeps its tail so a follower dies', () => {
  // p1 moves north onto food at (7,6); because it eats, its tail at (7,9)
  // stays occupied. p2 follows north into (7,9) and dies on that tail.
  const state = twoSnakes(
    { dir: 'north', segments: [{ x: 7, y: 7 }, { x: 7, y: 8 }, { x: 7, y: 9 }] },
    { dir: 'north', segments: [{ x: 7, y: 10 }, { x: 7, y: 11 }, { x: 7, y: 12 }] },
    { food: { x: 7, y: 6 } }
  );
  const next = tick(state);
  assert.equal(byId(next, 'p1').alive, true);
  assert.equal(byId(next, 'p1').segments.length, 4);
  assert.equal(byId(next, 'p1').score, 1);
  assert.equal(byId(next, 'p2').alive, false);
});

test('colliding with another snake body kills the mover only', () => {
  const state = twoSnakes(
    { dir: 'north', segments: [{ x: 9, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 9 }] },
    { dir: 'east', segments: [{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }] }
  );
  const next = tick(state);
  assert.equal(byId(next, 'p1').alive, false);
  assert.equal(byId(next, 'p2').alive, true);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result.winnerIds, ['p2']);
});

test('simultaneous head-to-head into one cell eliminates both snakes and draws', () => {
  const state = twoSnakes(
    { dir: 'east', segments: [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }] },
    { dir: 'west', segments: [{ x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }] }
  );
  const next = tick(state);
  assert.equal(byId(next, 'p1').alive, false);
  assert.equal(byId(next, 'p2').alive, false);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result.winnerIds, []);
  assert.equal(next.result.draw, true);
});

test('head-to-head pass-through (swap) eliminates both snakes', () => {
  const state = twoSnakes(
    { dir: 'east', segments: [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }] },
    { dir: 'west', segments: [{ x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }] }
  );
  const next = tick(state);
  assert.equal(byId(next, 'p1').alive, false);
  assert.equal(byId(next, 'p2').alive, false);
});

test('last survivor wins and the game ends', () => {
  const base = createGame({
    width: 20,
    height: 15,
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rng: seqRng(0),
    food: { x: 1, y: 1 },
  });
  const doomed = {
    ...base,
    snakes: [
      { ...base.snakes[0], id: 'a' },
      { id: 'b', name: 'B', score: 0, alive: true, dir: 'east', segments: [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }] },
      { id: 'c', name: 'C', score: 0, alive: true, dir: 'north', segments: [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }] },
    ],
  };
  const next = tick(doomed);
  assert.equal(byId(next, 'b').alive, false);
  assert.equal(byId(next, 'c').alive, false);
  assert.equal(byId(next, 'a').alive, true);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result.winnerIds, ['a']);
  assert.equal(next.result.draw, false);
});

test('dead snakes stay in place as obstacles and keep their score', () => {
  const state = twoSnakes(
    { dir: 'south', segments: [{ x: 8, y: 6 }, { x: 8, y: 5 }, { x: 7, y: 5 }] },
    { dir: 'east', score: 1, alive: false, segments: [{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }] }
  );
  const next = tick(state);
  assert.deepEqual(byId(next, 'p2').segments, byId(state, 'p2').segments);
  assert.equal(byId(next, 'p2').score, 1);
  assert.equal(byId(next, 'p1').alive, false, 'walking into a dead snake body is fatal');
});

test('tick does not mutate the input state', () => {
  const state = soloState({ food: { x: 11, y: 7 } });
  const snapshot = JSON.parse(JSON.stringify(state));
  const second = createGame({
    width: 20,
    height: 15,
    players: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    rng: seqRng(3),
  });
  const secondSnapshot = JSON.parse(JSON.stringify(second));
  tick(state, { p1: 'north' });
  tick(second, { a: 'south' });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), secondSnapshot);
});

test('over games ignore further ticks', () => {
  const base = soloState();
  const over = {
    ...base,
    phase: 'over',
    result: { winnerIds: [], draw: true },
    snakes: [{ ...base.snakes[0], alive: false }],
  };
  assert.equal(tick(over, { p1: 'north' }), over);
});
