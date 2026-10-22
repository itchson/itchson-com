// One animation queue for the original game systems. Keep pending work when paused.
(() => {
  'use strict';
  const pending = new Map();
  let sequence = 0;
  let frameId = 0;
  let userPaused = false;
  let effectivePaused = document.hidden;
  const pauseButton = document.getElementById('pauseGame');
  const hint = document.getElementById('gameHint');
  let playing = false;
  let gameOver = false;

  function schedule() {
    if (!effectivePaused && !frameId && pending.size) frameId = requestAnimationFrame(flush);
  }
  function flush(timestamp) {
    frameId = 0;
    for (const id of [...pending.keys()]) {
      if (effectivePaused) break;
      const callback = pending.get(id);
      if (!callback) continue;
      pending.delete(id);
      try { callback(timestamp); } catch (error) { console.error('Animation failed:', error); }
    }
    schedule();
  }
  function renderControls() {
    document.body.classList.toggle('game-paused', userPaused);
    if (pauseButton) {
      pauseButton.textContent = userPaused ? '▶ RESUME' : 'Ⅱ PAUSE';
      pauseButton.setAttribute('aria-pressed', String(userPaused));
    }
    if (hint) hint.textContent = userPaused ? 'PAUSED' : gameOver ? 'GAME OVER · CLICK THE LOGO TO RESET' : playing ? 'CLICK THE LOGO TO RESET' : 'CLICK THE STARFIELD TO START';
  }
  function updatePause() {
    const next = userPaused || document.hidden;
    renderControls();
    if (next === effectivePaused) return;
    effectivePaused = next;
    if (next && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    window.dispatchEvent(new CustomEvent(next ? 'game:pause' : 'game:resume'));
    if (!next) schedule();
  }
  window.itchsonAnimation = Object.freeze({
    request(callback) {
      const id = ++sequence;
      pending.set(id, callback);
      schedule();
      return id;
    },
    cancel(id) { pending.delete(id); },
    get paused() { return effectivePaused; },
    setPaused(value) { userPaused = Boolean(value); updatePause(); },
  });
  pauseButton?.addEventListener('click', () => {
    userPaused = !userPaused;
    updatePause();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    userPaused = !userPaused;
    updatePause();
  });
  document.addEventListener('visibilitychange', updatePause);
  window.addEventListener('game:start', () => { playing = true; gameOver = false; renderControls(); });
  window.addEventListener('enemies:reset', () => { playing = false; gameOver = false; renderControls(); });
  window.addEventListener('game:over', () => {
    gameOver = true;
    renderControls();
  });
  renderControls();
})();
