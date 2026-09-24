import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick } from '../shared/game.js';
import { Lobby } from '../server/lobby.js';

const players = (count) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

test('default board grows in both dimensions with the player count', () => {
  for (const count of [1, 2, 3, 4]) {
    const game = createGame({ players: players(count), rng: () => 0 });
    assert.equal(game.width, 24 * count);
    assert.equal(game.height, 16 * count);
    assert.equal(game.snakes.length, count);
    assert.ok(game.snakes.every((snake) => snake.segments.every(
      ({ x, y }) => x >= 0 && x < game.width && y >= 0 && y < game.height
    )));
    assert.ok(tick(game).snakes.every((snake) => snake.alive), `safe first tick with ${count} players`);
  }
});

test('explicit board dimensions remain usable for custom games and tests', () => {
  const game = createGame({ players: players(4), width: 20, height: 15, rng: () => 0 });
  assert.deepEqual([game.width, game.height], [20, 15]);
});

test('LAN board stays fixed during a match and recomputes for a rematch roster', () => {
  const lobby = new Lobby({ countdownMs: 0, rng: () => 0 });
  lobby.join('c1', 'Ana', 0);
  lobby.join('c2', 'Bo', 0);
  lobby.requestStart('p-c1', 0);
  lobby.advance(0);
  assert.deepEqual([lobby.game.width, lobby.game.height], [48, 32]);

  lobby.leave('c2');
  assert.deepEqual([lobby.game.width, lobby.game.height], [48, 32]);

  // End the first match, then build the next roster.
  lobby.phase = 'result';
  lobby.join('c3', 'Cy', 0);
  lobby.join('c4', 'Dee', 0);
  lobby.requestStart('p-c1', 0);
  lobby.advance(0);
  assert.deepEqual([lobby.game.width, lobby.game.height], [72, 48]);
});
