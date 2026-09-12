export const PLAYER_COLORS = Object.freeze(['#22d3ee', '#f472b6', '#a3e635', '#fbbf24']);
export const DEAD_COLOR = '#475569';
export const FOOD_COLOR = '#ef4444';
export const BG_COLOR = '#081728';

// Draws a game state (solo or a server snapshot) onto a 2D canvas context.
export function renderGame(ctx, state, { cell = 20 } = {}) {
  ctx.clearRect(0, 0, state.width * cell, state.height * cell);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, state.width * cell, state.height * cell);
  if (state.food) {
    ctx.save();
    ctx.shadowColor = FOOD_COLOR;
    ctx.shadowBlur = cell * 1.2;
    ctx.fillStyle = FOOD_COLOR;
    ctx.fillRect(state.food.x * cell, state.food.y * cell, cell, cell);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd3da';
    ctx.fillRect(state.food.x * cell + cell * 0.2, state.food.y * cell + cell * 0.18, cell * 0.26, cell * 0.26);
    ctx.restore();
  }
  state.snakes.forEach((snake, index) => {
    const color = snake.alive ? PLAYER_COLORS[index % PLAYER_COLORS.length] : DEAD_COLOR;
    ctx.save();
    ctx.fillStyle = color;
    snake.segments.forEach((segment, segmentIndex) => {
      ctx.shadowColor = color;
      ctx.shadowBlur = snake.alive && segmentIndex === 0 ? cell * 0.75 : 0;
      ctx.fillRect(segment.x * cell, segment.y * cell, cell, cell);
      if (snake.alive && segmentIndex === 0) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff99';
        ctx.fillRect(segment.x * cell + cell * 0.22, segment.y * cell + cell * 0.2, cell * 0.25, cell * 0.25);
        ctx.fillStyle = color;
      }
    });
    ctx.restore();
  });
}
