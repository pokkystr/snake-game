export const PLAYER_COLORS = Object.freeze(['#22d3ee', '#f472b6', '#a3e635', '#fbbf24']);
export const DEAD_COLOR = '#475569';
export const FOOD_COLOR = '#ef4444';
export const BG_COLOR = '#0b1120';

// Draws a game state (solo or a server snapshot) onto a 2D canvas context.
export function renderGame(ctx, state, { cell = 20 } = {}) {
  ctx.clearRect(0, 0, state.width * cell, state.height * cell);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, state.width * cell, state.height * cell);
  if (state.food) {
    ctx.fillStyle = FOOD_COLOR;
    ctx.fillRect(state.food.x * cell, state.food.y * cell, cell, cell);
  }
  state.snakes.forEach((snake, index) => {
    ctx.fillStyle = snake.alive ? PLAYER_COLORS[index % PLAYER_COLORS.length] : DEAD_COLOR;
    for (const segment of snake.segments) {
      ctx.fillRect(segment.x * cell, segment.y * cell, cell, cell);
    }
  });
}
