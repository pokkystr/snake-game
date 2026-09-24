import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultPopup } from '../public/result-popup.js';

class Element {
  constructor() {
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this.focusCount = 0;
  }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  focus() { this.focusCount += 1; }
}

function popup() {
  const dialog = new Element();
  dialog.open = false;
  dialog.opens = 0;
  dialog.showModal = () => { dialog.open = true; dialog.opens += 1; };
  dialog.close = () => { dialog.open = false; };
  const elements = {
    dialog, title: new Element(), lead: new Element(), stats: new Element(), scores: new Element(),
    soloActions: new Element(), multiActions: new Element(), rematch: new Element(), waiting: new Element(),
  };
  return { elements, result: new ResultPopup(elements, () => new Element()) };
}

test('solo result opens only on game over, displays final stats, and does not reopen on repeat state', () => {
  const { elements, result } = popup();
  const state = { phase: 'playing', snakes: [{ score: 7 }], level: 3, tickMs: 130, tick: 26 };
  result.syncSolo(state);
  assert.equal(elements.dialog.open, false);
  result.syncSolo({ ...state, phase: 'over' });
  assert.equal(elements.dialog.open, true);
  assert.equal(elements.title.textContent, 'Game over');
  assert.deepEqual(elements.stats.children.map((item) => item.textContent),
    ['Score: 7', 'Level: 3', 'Tick interval: 130 ms', 'Completed ticks: 26']);
  assert.equal(elements.soloActions.hidden, false);
  assert.equal(elements.multiActions.hidden, true);
  assert.equal(elements.title.focusCount, 1);
  result.syncSolo({ ...state, phase: 'over' });
  assert.equal(elements.dialog.opens, 1);
  assert.equal(elements.title.focusCount, 1);
  result.syncSolo(state);
  assert.equal(elements.dialog.open, false);
});

test('LAN result uses text-safe player scores and restricts rematch to host with two players', () => {
  const { elements, result } = popup();
  const state = {
    phase: 'result', result: { winnerIds: ['p2'], draw: false },
    players: [{ id: 'p1', name: '<img src=x>', score: 3 }, { id: 'p2', name: 'Bo', score: 8 }],
    game: { level: 4, tickMs: 120, snakes: [{ id: 'p1', name: '<img src=x>', score: 3 }, { id: 'p2', name: 'Bo', score: 8 }] },
  };
  result.syncMulti(state, false);
  assert.equal(elements.lead.textContent, 'Winner: Bo');
  assert.deepEqual(elements.stats.children.map((item) => item.textContent),
    ['Level: 4', 'Tick interval: 120 ms']);
  assert.deepEqual(elements.scores.children.map((item) => item.textContent),
    ['<img src=x>: 3', 'Bo: 8']);
  assert.equal(elements.rematch.hidden, true);
  assert.equal(elements.waiting.hidden, false);
  assert.equal(elements.dialog.opens, 1);
  result.syncMulti(state, true);
  assert.equal(elements.rematch.hidden, false);
  assert.equal(elements.rematch.disabled, false);
  assert.equal(elements.waiting.hidden, true);
  assert.equal(elements.dialog.opens, 1);
  result.syncMulti({ ...state, players: state.players.slice(0, 1) }, true);
  assert.equal(elements.rematch.disabled, true);
  assert.equal(elements.waiting.hidden, false);
  result.syncMulti({ ...state, phase: 'countdown' }, true);
  assert.equal(elements.dialog.open, false);
});

test('LAN draw appears only at result and closes on lobby or disconnect reset', () => {
  const { elements, result } = popup();
  const state = {
    phase: 'playing', result: null, players: [{ id: 'p1', name: 'Ana', score: 1 }],
    game: { level: 1, tickMs: 150, snakes: [{ id: 'p1', name: 'Ana', score: 1 }] },
  };
  result.syncMulti(state, true);
  assert.equal(elements.dialog.open, false);
  result.syncMulti({ ...state, phase: 'result', result: { winnerIds: [], draw: true } }, true);
  assert.equal(elements.lead.textContent, 'Draw — every snake was eliminated.');
  result.close();
  assert.equal(elements.dialog.open, false);
});
