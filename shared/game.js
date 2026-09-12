// Shared pure Snake rules. Used by the in-browser single-player loop and by the
// authoritative multiplayer server. No platform APIs, no mutation of inputs.
//
// State shape (single source of truth for both callers):
// {
//   width, height,                 // board cells
//   phase: 'playing' | 'over',
//   tick: number,                  // completed ticks
//   food: { x, y } | null,
//   result: null | { winnerIds: string[], draw: boolean },
//   snakes: [{
//     id, name,
//     dir: 'north'|'south'|'east'|'west',
//     score: number,
//     alive: boolean,
//     segments: [{ x, y }, ...],   // head first, tail last
//   }],
// }

export const DIRECTIONS = Object.freeze({
  north: Object.freeze({ dx: 0, dy: -1 }),
  south: Object.freeze({ dx: 0, dy: 1 }),
  east: Object.freeze({ dx: 1, dy: 0 }),
  west: Object.freeze({ dx: -1, dy: 0 }),
});

export const SNAKE_LENGTH = 3;
export const DEFAULT_BOARD = Object.freeze({ width: 24, height: 16 });
export const MIN_BOARD = 12;
export const MAX_PLAYERS = 4;

const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const key = (cell) => `${cell.x},${cell.y}`;

export function isDirection(value) {
  return Object.prototype.hasOwnProperty.call(DIRECTIONS, value);
}

export function validTurn(from, to) {
  return isDirection(from) && isDirection(to) && to !== OPPOSITE[from];
}

// [0] is the solo spawn; [1..4] are the four corner spawns for multiplayer,
// each far enough from walls and from each other that no first tick can kill.
function spawnPlan(width, height) {
  const margin = 3;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  return [
    { x: cx, y: cy, dir: 'east' },
    { x: margin, y: margin, dir: 'east' },
    { x: width - 1 - margin, y: height - 1 - margin, dir: 'west' },
    { x: width - 1 - margin, y: margin, dir: 'south' },
    { x: margin, y: height - 1 - margin, dir: 'north' },
  ];
}

function buildSnake(id, name, spawn) {
  const { dx, dy } = DIRECTIONS[spawn.dir];
  const segments = [];
  for (let i = 0; i < SNAKE_LENGTH; i += 1) {
    segments.push({ x: spawn.x - dx * i, y: spawn.y - dy * i });
  }
  return { id, name, dir: spawn.dir, score: 0, alive: true, segments };
}

export function placeFood(snakes, width, height, rng) {
  const taken = new Set();
  for (const snake of snakes) {
    for (const cell of snake.segments) taken.add(key(cell));
  }
  const free = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.floor(rng() * free.length));
  return free[index];
}

export function createGame(config = {}) {
  const width = Number.isInteger(config.width) ? config.width : DEFAULT_BOARD.width;
  const height = Number.isInteger(config.height) ? config.height : DEFAULT_BOARD.height;
  if (width < MIN_BOARD || height < MIN_BOARD) {
    throw new Error(`board must be at least ${MIN_BOARD}x${MIN_BOARD}`);
  }
  const players = Array.isArray(config.players) ? config.players : [];
  if (players.length === 0) throw new Error('at least one player is required');
  if (players.length > MAX_PLAYERS) throw new Error(`at most ${MAX_PLAYERS} players are allowed`);
  const rng = typeof config.rng === 'function' ? config.rng : Math.random;
  const plan = spawnPlan(width, height);
  const snakes = players.map((player, index) =>
    buildSnake(String(player.id), String(player.name ?? ''), plan[players.length === 1 ? 0 : index + 1])
  );
  const food = config.food
    ? { x: config.food.x, y: config.food.y }
    : placeFood(snakes, width, height, rng);
  return {
    width,
    height,
    phase: 'playing',
    tick: 0,
    food,
    result: null,
    snakes,
  };
}

export function tick(state, intents = {}, rng = Math.random) {
  if (state.phase !== 'playing') return state;

  const snakes = state.snakes.map((snake) => ({
    ...snake,
    segments: snake.segments.map((cell) => ({ ...cell })),
  }));
  const index = new Map(snakes.map((snake) => [snake.id, snake]));

  for (const [id, dir] of Object.entries(intents)) {
    const snake = index.get(id);
    if (snake && snake.alive && validTurn(snake.dir, dir)) snake.dir = dir;
  }

  const moving = snakes.filter((snake) => snake.alive);
  const newHeads = new Map();
  for (const snake of moving) {
    const { dx, dy } = DIRECTIONS[snake.dir];
    const head = snake.segments[0];
    newHeads.set(snake.id, { x: head.x + dx, y: head.y + dy });
  }

  const doomed = new Set();

  // Walls.
  for (const snake of moving) {
    const head = newHeads.get(snake.id);
    if (head.x < 0 || head.x >= state.width || head.y < 0 || head.y >= state.height) {
      doomed.add(snake.id);
    }
  }

  // Head-to-head: two live heads landing on the same cell, or passing
  // through each other's head cells in one tick, eliminate everyone involved.
  const landed = new Map();
  for (const snake of moving) {
    if (doomed.has(snake.id)) continue;
    const cellKey = key(newHeads.get(snake.id));
    const other = landed.get(cellKey);
    if (other !== undefined) {
      doomed.add(snake.id);
      doomed.add(other);
    } else {
      landed.set(cellKey, snake.id);
    }
  }
  // Pass-through swaps are covered below: a mover's old head stays part of its
  // body, so crossing heads collide with the occupant check.

  // Which tails vacate: a snake that eats keeps its tail cell occupied.
  const eatsFood = new Set();
  for (const snake of moving) {
    if (doomed.has(snake.id)) continue;
    const head = newHeads.get(snake.id);
    if (state.food && head.x === state.food.x && head.y === state.food.y) {
      eatsFood.add(snake.id);
    }
  }

  const occupied = new Set();
  for (const snake of snakes) {
    const keepsTail = !snake.alive || doomed.has(snake.id) || eatsFood.has(snake.id);
    const limit = keepsTail ? snake.segments.length : snake.segments.length - 1;
    for (let i = 0; i < limit; i += 1) occupied.add(key(snake.segments[i]));
  }
  for (const snake of moving) {
    if (doomed.has(snake.id)) continue;
    if (occupied.has(key(newHeads.get(snake.id)))) doomed.add(snake.id);
  }

  let nextFood = state.food ? { ...state.food } : null;
  for (const snake of snakes) {
    if (doomed.has(snake.id)) {
      snake.alive = false;
      continue;
    }
    if (!snake.alive) continue;
    const head = newHeads.get(snake.id);
    snake.segments.unshift({ x: head.x, y: head.y });
    if (eatsFood.has(snake.id)) {
      snake.score += 1;
      nextFood = null;
    } else {
      snake.segments.pop();
    }
  }

  const survivors = snakes.filter((snake) => snake.alive).map((snake) => snake.id);
  const multiplayer = snakes.length >= 2;
  const over = survivors.length === 0 || (multiplayer && survivors.length === 1);
  if (nextFood === null && !over) {
    nextFood = placeFood(snakes, state.width, state.height, rng);
  }
  const result = over ? { winnerIds: survivors.slice(), draw: survivors.length === 0 } : null;

  return {
    ...state,
    tick: state.tick + 1,
    phase: over ? 'over' : 'playing',
    result,
    food: nextFood,
    snakes,
  };
}
