import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/lobby.js';

function harness(options = {}) {
  const messages = [];
  const lobby = new Lobby({
    countdownMs: 3000,
    tickMs: 100,
    onMessage: (connId, message) => messages.push({ connId, message }),
    ...options,
  });
  const forPlayer = (connId) => messages.filter((m) => m.connId === connId).map((m) => m.message);
  const states = (connId) => forPlayer(connId).filter((m) => m.type === 'state');
  const errors = (connId) => forPlayer(connId).filter((m) => m.type === 'error');
  const latest = (connId) => {
    const list = states(connId);
    assert.ok(list.length > 0, `no state sent to ${connId}`);
    return list[list.length - 1];
  };
  return { lobby, messages, forPlayer, states, errors, latest };
}

test('2-4 joins are accepted; lobby state lists players and the first is host', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.join('c3', 'Cy', 1002);
  const state = latest('c3');
  assert.equal(state.phase, 'lobby');
  assert.equal(state.hostId, 'p-c1');
  assert.deepEqual(state.players.map((p) => p.name), ['Ana', 'Bo', 'Cy']);
  lobby.join('c4', 'Dee', 1003);
  assert.equal(latest('c4').players.length, 4);
});

test('welcome identifies the joining player', () => {
  const { lobby, forPlayer } = harness();
  lobby.join('c1', 'Ana', 1000);
  const welcome = forPlayer('c1').find((m) => m.type === 'welcome');
  assert.ok(welcome);
  assert.equal(welcome.playerId, 'p-c1');
});

test('fifth join is rejected with lobby_full', () => {
  const { lobby, latest, errors } = harness();
  for (const name of ['a', 'b', 'c', 'd']) lobby.join(`c-${name}`, name, 1000);
  lobby.join('c-e', 'Eve', 1001);
  assert.equal(latest('c-a').players.length, 4);
  assert.deepEqual(
    errors('c-e').map((e) => e.code),
    ['lobby_full']
  );
});

test('names are trimmed and capped at 20 visible characters', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', '   Ana ', 1000);
  lobby.join('c2', 'x'.repeat(30), 1001);
  assert.deepEqual(latest('c2').players.map((p) => p.name), ['Ana', 'x'.repeat(20)]);
});

test('emoji names are capped by code points, not UTF-16 units', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', '🐍'.repeat(25), 1000);
  assert.equal([...latest('c1').players[0].name].length, 20);
});

test('blank names are rejected with invalid_name and create no member', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', '   ', 1000);
  assert.deepEqual(
    errors('c1').map((e) => e.code),
    ['invalid_name']
  );
  lobby.join('c2', 'ok', 1001);
  assert.equal(latest('c2').players.length, 1);
});

test('only the host can start, and starting enters a visible countdown with no ticks', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c2', 1002);
  assert.equal(errors('c2').at(-1).code, 'not_host');
  assert.equal(latest('c1').phase, 'lobby');
  lobby.requestStart('p-c1', 1002);
  const state = latest('c1');
  assert.equal(state.phase, 'countdown');
  assert.ok(state.countdownRemainingMs > 0);
  lobby.advance(1003);
  assert.equal(latest('c1').phase, 'countdown');
  assert.equal(latest('c1').game, null);
});

test('duplicate start during countdown or playing has no effect', () => {
  const { lobby, latest, forPlayer } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  const before = JSON.stringify(latest('c1'));
  const countBefore = forPlayer('c1').length;
  lobby.requestStart('p-c1', 1003);
  assert.equal(JSON.stringify(latest('c1')), before);
  assert.equal(forPlayer('c1').length, countBefore);
  lobby.advance(4002);
  lobby.requestStart('p-c1', 4003);
  assert.equal(latest('c1').phase, 'playing');
});

test('start requires at least two players', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', 'Solo', 1000);
  lobby.requestStart('p-c1', 1001);
  assert.equal(errors('c1').at(-1).code, 'not_enough_players');
  assert.equal(latest('c1').phase, 'lobby');
});

test('countdown ends and the match plays with server ticks', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  lobby.advance(1002 + 3000);
  let state = latest('c1');
  assert.equal(state.phase, 'playing');
  assert.equal(state.game.tick, 0);
  lobby.advance(1002 + 3000 + 100);
  state = latest('c1');
  assert.equal(state.game.tick, 1);
  lobby.advance(1002 + 3000 + 250);
  assert.equal(latest('c1').game.tick, 2);
});

test('direction intents steer the snake; one change per tick; reversals rejected', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  lobby.advance(4002);
  const snakeIdOf = (connId) => latest('c1').players.find((p) => p.id === `p-${connId}`).id;
  const t0 = latest('c1').game.snakes.find((s) => s.id === snakeIdOf('c1'));
  assert.equal(t0.dir, 'east');
  lobby.setDirection('p-c1', 'south');
  lobby.setDirection('p-c1', 'west');
  assert.equal(errors('c1').at(-1).code, 'direction_limit');
  lobby.advance(4102);
  assert.equal(latest('c1').game.snakes.find((s) => s.id === 'p-c1').dir, 'south');
  lobby.setDirection('p-c1', 'north');
  assert.equal(errors('c1').at(-1).code, 'invalid_direction');
  lobby.setDirection('p-c1', 'up');
  assert.equal(errors('c1').at(-1).code, 'invalid_direction');
  lobby.advance(4202);
  assert.equal(latest('c1').game.snakes.find((s) => s.id === 'p-c1').dir, 'south');
});

test('disconnect during lobby removes the member and transfers the host', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.join('c3', 'Cy', 1002);
  lobby.leave('c1');
  const state = latest('c3');
  assert.deepEqual(state.players.map((p) => p.id), ['p-c2', 'p-c3']);
  assert.equal(state.hostId, 'p-c2');
});

test('countdown survives a disconnect, rejects late joins, cancels below two', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.join('c3', 'Cy', 1002);
  lobby.requestStart('p-c1', 1003);
  lobby.leave('c3');
  assert.equal(latest('c1').phase, 'countdown');
  assert.deepEqual(latest('c1').players.map((p) => p.id), ['p-c1', 'p-c2']);
  lobby.join('c4', 'Dee', 1004);
  assert.equal(errors('c4').at(-1).code, 'match_in_progress');
  lobby.leave('c2');
  assert.equal(latest('c1').phase, 'lobby');
});

test('disconnect during play eliminates the snake and ends the match', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  lobby.advance(4002);
  lobby.leave('c2');
  lobby.advanceUntilOver(4300);
  const over = latest('c1');
  assert.equal(over.phase, 'result');
  assert.deepEqual(over.result.winnerIds, ['p-c1']);
  assert.deepEqual(latest('c1').players.map((p) => p.id), ['p-c1']);
});

test('match ends in result and a rematch resets game state', () => {
  const { lobby, latest } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  lobby.advance(4002);
  lobby.leave('c2');
  lobby.advanceUntilOver(4300);
  assert.equal(latest('c1').phase, 'result');
  assert.equal(latest('c1').game.phase, 'over');
  lobby.join('c3', 'Cy', 5000);
  lobby.requestStart('p-c1', 5001);
  const again = latest('c3');
  assert.equal(again.phase, 'countdown');
  assert.equal(again.game, null);
  lobby.advance(8001);
  const fresh = latest('c3').game;
  assert.equal(fresh.tick, 0);
  assert.deepEqual(
    fresh.snakes.map((s) => s.score),
    [0, 0]
  );
});

test('late joins during play are rejected with match_in_progress', () => {
  const { lobby, latest, errors } = harness();
  lobby.join('c1', 'Ana', 1000);
  lobby.join('c2', 'Bo', 1001);
  lobby.requestStart('p-c1', 1002);
  lobby.advance(4002);
  lobby.join('c3', 'Cy', 4003);
  assert.equal(errors('c3').at(-1).code, 'match_in_progress');
  assert.equal(latest('c1').players.length, 2);
});

test('viewFor an unknown connection returns null instead of throwing', () => {
  const { lobby } = harness();
  assert.equal(lobby.viewFor('ghost'), null);
});
