import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick } from '../shared/game.js';
import { Lobby } from '../server/lobby.js';

const solo = (food) => createGame({
  players: [{ id: 'solo', name: 'You' }],
  food: { x: 13, y: 8, ...food },
  rng: () => 0,
});

test('food types use an 80/10/10 random choice after choosing a free cell', () => {
  for (const [sample, expected] of [[0.1, 'normal'], [0.85, 'triple'], [0.95, 'shrink']]) {
    let calls = 0;
    const rng = () => (++calls === 1 ? 0 : sample);
    const game = createGame({ players: [{ id: 'solo', name: 'You' }], rng });
    assert.equal(game.food.type, expected);
    assert.equal(calls, 2);
    assert.ok(!game.snakes[0].segments.some(({ x, y }) => x === game.food.x && y === game.food.y));
  }
});

test('legacy food without a type behaves like normal food', () => {
  const next = tick(solo({}));
  assert.equal(next.snakes[0].score, 1);
  assert.equal(next.snakes[0].segments.length, 4);
});

test('triple food grants three points, grows once, and advances the level', () => {
  const next = tick(solo({ type: 'triple' }));
  assert.equal(next.snakes[0].score, 3);
  assert.equal(next.snakes[0].segments.length, 4);
  assert.equal(next.level, 2);
  assert.equal(next.tickMs, 140);
});

test('shrink food grants one point and removes one body cell down to length two', () => {
  const first = tick(solo({ type: 'shrink' }));
  assert.equal(first.snakes[0].score, 1);
  assert.equal(first.snakes[0].segments.length, 2);

  const second = tick({ ...first, food: { x: 14, y: 8, type: 'shrink' } });
  assert.equal(second.snakes[0].score, 2);
  assert.equal(second.snakes[0].segments.length, 2);
});

test('a snake may enter either tail cell vacated by a shrinking snake', () => {
  const base = createGame({
    players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    width: 20,
    height: 15,
    food: { x: 6, y: 6, type: 'shrink' },
  });
  const state = {
    ...base,
    snakes: [
      { ...base.snakes[0], dir: 'south', segments: [
        { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 },
      ] },
      { ...base.snakes[1], dir: 'east', segments: [
        { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 },
      ] },
    ],
  };
  const next = tick(state);
  assert.equal(next.snakes[0].alive, true);
  assert.equal(next.snakes[0].segments.length, 3);
  assert.equal(next.snakes[1].alive, true);
  assert.deepEqual(next.snakes[1].segments[0], { x: 6, y: 3 });
});

test('head-to-head collision on special food awards no bonus', () => {
  const base = createGame({
    players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    width: 20,
    height: 15,
    food: { x: 6, y: 6, type: 'triple' },
  });
  const next = tick({ ...base, snakes: [
    { ...base.snakes[0], dir: 'east', segments: [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }] },
    { ...base.snakes[1], dir: 'west', segments: [{ x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 }] },
  ] });
  assert.deepEqual(next.snakes.map((snake) => snake.score), [0, 0]);
  assert.deepEqual(next.snakes.map((snake) => snake.alive), [false, false]);
});

test('LAN snapshots carry the server-selected food type', () => {
  const lobby = new Lobby({ countdownMs: 0, rng: () => 0.85 });
  lobby.join('c1', 'Ana', 0);
  lobby.join('c2', 'Bo', 0);
  lobby.requestStart('p-c1', 0);
  lobby.advance(0);
  assert.equal(lobby.viewFor('c1').game.food.type, 'triple');
  assert.deepEqual(lobby.viewFor('c1').game.food, lobby.viewFor('c2').game.food);
});
