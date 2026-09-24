export class ResultPopup {
  constructor(elements, createElement) {
    this.elements = elements;
    this.createElement = createElement;
  }

  setList(element, lines) {
    element.replaceChildren(...lines.map((line) => {
      const item = this.createElement('li');
      item.textContent = line;
      return item;
    }));
  }

  open() {
    const { dialog, title } = this.elements;
    if (dialog.open) return;
    dialog.showModal();
    title.focus();
  }

  syncSolo(state) {
    if (state.phase !== 'over') {
      this.close();
      return;
    }
    const { title, lead, stats, scores, soloActions, multiActions } = this.elements;
    title.textContent = 'Game over';
    lead.textContent = 'Your run is complete.';
    this.setList(stats, [
      `Score: ${state.snakes[0].score}`,
      `Level: ${state.level}`,
      `Tick interval: ${state.tickMs} ms`,
      `Completed ticks: ${state.tick}`,
    ]);
    scores.replaceChildren();
    soloActions.hidden = false;
    multiActions.hidden = true;
    this.open();
  }

  syncMulti(state, isHost) {
    if (state.phase !== 'result') {
      this.close();
      return;
    }
    const { title, lead, stats, scores, soloActions, multiActions, rematch, waiting } = this.elements;
    const winnerId = state.result?.winnerIds?.[0];
    const winner = state.game?.snakes.find((snake) => snake.id === winnerId) ??
      state.players.find((player) => player.id === winnerId);
    title.textContent = 'Match result';
    lead.textContent = state.result?.draw
      ? 'Draw — every snake was eliminated.'
      : `Winner: ${winner?.name ?? winnerId ?? 'Unknown'}`;
    this.setList(stats, [
      `Level: ${state.game?.level ?? 1}`,
      `Tick interval: ${state.game?.tickMs ?? 150} ms`,
    ]);
    this.setList(scores, (state.game?.snakes ?? []).map((snake) => `${snake.name}: ${snake.score}`));
    soloActions.hidden = true;
    multiActions.hidden = false;
    rematch.hidden = !isHost;
    rematch.disabled = state.players.length < 2;
    waiting.hidden = isHost && state.players.length >= 2;
    waiting.textContent = isHost
      ? 'At least two players are needed for a rematch.'
      : 'Waiting for the host to start a rematch.';
    this.open();
  }

  close() {
    if (this.elements.dialog.open) this.elements.dialog.close();
  }
}
