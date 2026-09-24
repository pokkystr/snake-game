import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick } from '../shared/game.js';

function eatWithScore(score, tickMs = 150) {
  const game = createGame({ players: [{ id: 'solo', name: 'You' }], tickMs });
  game.snakes[0].score = score;
  const head = game.snakes[0].segments[0];
  game.food = { x: head.x + 1, y: head.y };
  return tick(game, {}, () => 0.5);
}

test('new game starts at Lv 1 with a 150 ms movement interval', () => {
  const game = createGame({ players: [{ id: 'solo' }] });
  assert.equal(game.level, 1);
  assert.equal(game.tickMs, 150);
});

test('every third food raises Lv and shortens the next movement interval', () => {
  const before = eatWithScore(1);
  assert.equal(before.level, 1);
  assert.equal(before.tickMs, 150);
  const after = eatWithScore(2);
  assert.equal(after.snakes[0].score, 3);
  assert.equal(after.level, 2);
  assert.equal(after.tickMs, 140);
});

test('level stops at 9 when the movement interval reaches 70 ms', () => {
  const atCap = eatWithScore(23);
  assert.equal(atCap.level, 9);
  assert.equal(atCap.tickMs, 70);
  const beyondCap = eatWithScore(26);
  assert.equal(beyondCap.level, 9);
  assert.equal(beyondCap.tickMs, 70);
});

test('LAN progression uses total scores and preserves faster custom test intervals', () => {
  const game = createGame({ players: [{ id: 'a' }, { id: 'b' }] });
  game.snakes[0].score = 2;
  const head = game.snakes[0].segments[0];
  game.food = { x: head.x + 1, y: head.y };
  const next = tick(game, {}, () => 0.5);
  assert.equal(next.level, 2);
  assert.equal(next.tickMs, 140);

  const faster = eatWithScore(2, 40);
  assert.equal(faster.level, 1);
  assert.equal(faster.tickMs, 40);
});
