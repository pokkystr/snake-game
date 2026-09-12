import { SoloController, keyToDirection } from './single.js';
import { MultiClient } from './multi.js';
import { renderGame } from './render.js';

export function nextScreen(current, action) {
  if (current === 'select' && action.type === 'choose-solo') return 'solo';
  if (current === 'select' && action.type === 'choose-multi') return 'multi';
  if ((current === 'solo' || current === 'multi') && action.type === 'back') return 'select';
  return current;
}

const ERROR_TEXT = {
  not_host: 'Only the host can start the match.',
  not_enough_players: 'At least two players are needed to start.',
  direction_limit: 'One turn per move — it will apply next tick.',
  invalid_direction: 'That turn is not allowed.',
  match_in_progress: 'A match is already running. Join later.',
  lobby_full: 'This lobby is full (max 4 players).',
  invalid_name: 'Names cannot be blank.',
  malformed: 'Bad message.',
  unknown_type: 'Unknown command.',
  not_joined: 'Join the lobby first.',
};

const FATAL_TEXT = {
  match_in_progress: 'A match is in progress. You can join once it ends.',
  lobby_full: 'The lobby is full.',
  invalid_name: 'That name was rejected.',
  disconnected: 'Connection lost.',
};

const $id = (id) => document.getElementById(id);

function init() {
  const screens = { select: $id('screen-select'), solo: $id('screen-solo'), multi: $id('screen-multi') };
  let screen = 'select';

  function show(name) {
    screen = name;
    for (const [key, element] of Object.entries(screens)) {
      element.hidden = key !== name;
    }
  }

  function setStatus(element, text) {
    element.textContent = text;
  }

  function pulse(element) {
    element.classList.remove('pulse');
    void element.offsetWidth;
    element.classList.add('pulse');
  }

  function showCountdown(overlay, value, digit) {
    if (overlay.hidden) {
      overlay.hidden = false;
      value.textContent = '';
    }
    if (value.textContent !== String(digit)) {
      value.textContent = String(digit);
      pulse(value);
    }
  }

  function celebrateLevel(board, label) {
    pulse(board);
    pulse(label);
    setTimeout(() => {
      board.classList.remove('pulse');
      label.classList.remove('pulse');
    }, 850);
  }

  // --- single player ------------------------------------------------------

  const soloCanvas = $id('solo-canvas');
  const soloCtx = soloCanvas.getContext('2d');
  let solo = null;
  let lastSoloLevel = 1;

  function renderSolo(state) {
    renderGame(soloCtx, state, { cell: soloCanvas.width / state.width });
    setStatus($id('solo-score-value'), String(state.snakes[0].score));
    setStatus($id('solo-level-value'), String(state.level));
    setStatus($id('solo-speed-value'), `${state.tickMs} ms`);
    if (state.level > lastSoloLevel) celebrateLevel($id('solo-board'), $id('solo-level'));
    lastSoloLevel = state.level;
    if (state.phase === 'countdown') {
      showCountdown(
        $id('solo-countdown'),
        $id('solo-countdown-value'),
        Math.max(1, Math.ceil(state.countdownRemainingMs / 1000))
      );
    } else {
      $id('solo-countdown').hidden = true;
    }
    setStatus(
      $id('solo-status'),
      state.phase === 'countdown'
        ? 'Get ready — the snake moves after the countdown.'
        : state.phase === 'playing'
          ? 'Arrow keys / WASD or the on-screen pad to steer.'
          : 'Game over. Press Restart to play again.'
    );
  }

  function startSolo() {
    if (solo) solo.stop();
    lastSoloLevel = 1;
    solo = new SoloController({ onState: renderSolo });
    solo.start();
    show('solo');
  }

  // --- multiplayer --------------------------------------------------------

  const multiCanvas = $id('multi-canvas');
  const multiCtx = multiCanvas.getContext('2d');
  let client = null;
  let countdownTimer = null;
  let countdownDeadline = null;
  let lastMultiLevel = 1;

  function stopCountdown() {
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    $id('countdown').hidden = true;
  }

  function beginCountdown(remainingMs) {
    countdownDeadline = Date.now() + remainingMs;
    $id('multi-board').hidden = false;
    multiCanvas.hidden = true;
    const paint = () => {
      const left = Math.max(0, countdownDeadline - Date.now());
      showCountdown(
        $id('countdown'),
        $id('multi-countdown-value'),
        left > 0 ? Math.ceil(left / 1000) : 'GO'
      );
      if (left <= 0 && countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };
    paint();
    if (countdownTimer !== null) clearInterval(countdownTimer);
    countdownTimer = setInterval(paint, 200);
  }

  function renderLobby(state) {
    const list = $id('lobby-list');
    list.textContent = '';
    for (const player of state.players) {
      const item = document.createElement('li');
      item.textContent = player.name;
      if (player.id === state.hostId) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'host';
        item.append(badge);
      }
      if (typeof player.alive === 'boolean' && !player.alive) {
        const tag = document.createElement('span');
        tag.className = 'badge eliminated';
        tag.textContent = 'eliminated';
        item.append(tag);
      }
      list.append(item);
    }
    const startButton = $id('btn-start');
    const startable = state.phase === 'lobby' || state.phase === 'result';
    startButton.hidden = !(startable && client && client.isHost());
    setStatus(
      startButton,
      state.phase === 'result' ? 'Start rematch' : 'Start match'
    );
    startButton.disabled = state.players.length < 2;
    $id('join-form').hidden = state.phase !== 'lobby' || state.players.length >= 4;
  }

  function renderResultText(state) {
    if (!state.result) return '';
    if (state.result.draw) return 'Draw — every snake was eliminated.';
    const winner = state.players.find((p) => p.id === state.result.winnerIds[0]);
    const name = winner ? winner.name : state.result.winnerIds[0];
    return `Winner: ${name}`;
  }

  function renderMulti(state) {
    renderLobby(state);
    if (state.phase === 'countdown' && state.countdownRemainingMs !== undefined) {
      lastMultiLevel = 1;
      setStatus($id('multi-level-value'), '1');
      setStatus($id('multi-speed-value'), '150 ms');
      setStatus($id('multi-status'), 'Get ready — the match starts after the countdown.');
      setStatus($id('multi-scores'), '');
      beginCountdown(state.countdownRemainingMs);
    } else {
      stopCountdown();
    }
    if (state.game) {
      $id('multi-board').hidden = false;
      multiCanvas.hidden = false;
      renderGame(multiCtx, state.game, { cell: multiCanvas.width / state.game.width });
      const level = state.game.level ?? 1;
      setStatus($id('multi-level-value'), String(level));
      setStatus($id('multi-speed-value'), `${state.game.tickMs ?? 150} ms`);
      if (level > lastMultiLevel) celebrateLevel($id('multi-board'), $id('multi-level'));
      lastMultiLevel = level;
      const you = state.game.snakes.find((s) => s.id === client.playerId);
      const parts = state.game.snakes.map(
        (s) => `${s.name}: ${s.score}${s.alive ? '' : ' (out)'}`
      );
      setStatus($id('multi-scores'), parts.join('   '));
      if (state.phase === 'playing' && you && !you.alive) {
        setStatus($id('multi-status'), 'You were eliminated. Watch the rest of the match.');
      } else if (state.phase === 'playing') {
        setStatus($id('multi-status'), 'Arrow keys / WASD or the on-screen pad to steer.');
      } else if (state.phase === 'result') {
        setStatus($id('multi-status'), renderResultText(state));
      }
    } else if (state.phase === 'lobby') {
      lastMultiLevel = 1;
      $id('multi-board').hidden = true;
      multiCanvas.hidden = true;
      setStatus(
        $id('multi-status'),
        client && client.isHost()
          ? state.players.length >= 2
            ? 'Ready — press Start match.'
            : 'Waiting for players. At least two are needed to start.'
          : 'Waiting for the host to start the match.'
      );
    } else if (state.phase === 'countdown') {
      multiCanvas.hidden = true;
    }
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  function join(name) {
    if (client) client.leave();
    client = new MultiClient({
      onWelcome: (welcome) => {
        const role = welcome.playerId === welcome.hostId ? 'the host' : 'a player';
        setStatus($id('multi-status'), `Joined as ${role}. Waiting for players.`);
      },
      onState: renderMulti,
      onError: (message) => {
        setStatus($id('multi-status'), ERROR_TEXT[message.code] ?? 'Error.');
      },
      onFatal: ({ reason }) => {
        stopCountdown();
        setStatus($id('multi-status'), FATAL_TEXT[reason] ?? FATAL_TEXT.disconnected);
        $id('multi-canvas').hidden = true;
        $id('multi-board').hidden = true;
        client = null;
        $id('join-form').hidden = false;
      },
    });
    client.open(wsUrl());
    client.join(name);
  }

  $id('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $id('player-name').value.trim();
    if (name === '') {
      setStatus($id('multi-status'), 'Enter a name first.');
      return;
    }
    setStatus($id('multi-status'), 'Connecting…');
    join(name);
  });

  $id('btn-start').addEventListener('click', (event) => {
    event.currentTarget.blur();
    if (client) client.start();
  });

  function steer(dir) {
    if (screen === 'solo' && solo) {
      solo.turn(dir);
    } else if (screen === 'multi' && client) {
      client.turn(dir);
    }
  }

  for (const button of document.querySelectorAll('button[data-dir]')) {
    button.addEventListener('click', (event) => {
      event.currentTarget.blur();
      steer(event.currentTarget.dataset.dir);
    });
  }

  window.addEventListener('keydown', (event) => {
    const dir = keyToDirection(event.code);
    if (dir) {
      event.preventDefault();
      steer(dir);
    }
  });

  // --- shared screens -----------------------------------------------------

  $id('btn-solo').addEventListener('click', (event) => {
    event.currentTarget.blur();
    startSolo();
  });
  $id('btn-multi').addEventListener('click', (event) => {
    event.currentTarget.blur();
    show('multi');
  });
  $id('solo-restart').addEventListener('click', (event) => {
    event.currentTarget.blur();
    lastSoloLevel = 1;
    solo.restart();
  });
  $id('solo-back').addEventListener('click', (event) => {
    event.currentTarget.blur();
    if (solo) solo.stop();
    show('select');
  });
  $id('multi-back').addEventListener('click', (event) => {
    event.currentTarget.blur();
    stopCountdown();
    if (client) client.leave();
    client = null;
    show('select');
  });

  fetch('/config')
    .then((response) => response.json())
    .then((config) => {
      const urls = new Set([location.href, ...config.lanUrls]);
      setStatus($id('lan-url-text'), [...urls].join('  '));
    })
    .catch(() => {
      setStatus($id('lan-url-text'), location.href);
    });

  show('select');
}

if (typeof document !== 'undefined' && document.getElementById('screen-select')) {
  init();
}
