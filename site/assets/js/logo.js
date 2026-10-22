// Original pixel shake/reveal, with keyboard reset and correctly scoped cursor position.
(() => {
  'use strict';
  const logo = document.querySelector('.logo-container');
  const letters = [...document.querySelectorAll('.logo-container .letter')];
  if (!logo) return;
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let resetting = false;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  window.addEventListener('cursor:state', ({ detail = {} }) => {
    if (Number.isFinite(detail.x)) cursorX = detail.x;
    if (Number.isFinite(detail.y)) cursorY = detail.y;
  });

  function triggerShake(letter) {
    if (letter.classList.contains('shake')) return;
    const pixels = letter.querySelectorAll('.pixel');
    pixels.forEach((pixel) => {
      pixel.style.setProperty('--tx', ((Math.random() * 2 - 1) * 3).toFixed(2) + 'px');
      pixel.style.setProperty('--ty', ((Math.random() * 2 - 1) * 3).toFixed(2) + 'px');
      pixel.style.setProperty('--rot', ((Math.random() * 2 - 1) * 6).toFixed(2) + 'deg');
      pixel.style.animationDelay = Math.floor(Math.random() * 80) + 'ms';
    });
    letter.classList.add('shake');
    window.setTimeout(() => {
      letter.classList.remove('shake');
      pixels.forEach((pixel) => {
        ['--tx', '--ty', '--rot', 'animation-delay'].forEach((property) => pixel.style.removeProperty(property));
      });
    }, 480);
  }

  function resetGame(letter) {
    if (resetting) return;
    resetting = true;
    window.itchsonAnimation.setPaused(false);
    emit('trail:suspend');
    emit('cursor:state', { visible: false });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      (letter ? [letter] : letters).forEach(triggerShake);
      emit('star:jiggle');
    }
    window.setTimeout(() => {
      emit('destruct:reset');
      emit('enemies:reset');
      emit('cursor:mode', { mode: 'orbit' });
      emit('cursor:restore-orbit');
      window.itchsonAnimation.request(() => {
        emit('trail:reset', { x: cursorX, y: cursorY });
        emit('trail:resume');
        emit('cursor:state', { visible: true });
        resetting = false;
      });
    }, reduceMotion ? 0 : 500);
  }
  logo.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetGame(event.target.closest('.letter'));
  });
  logo.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      resetGame();
    }
  });
  logo.addEventListener('touchstart', () => {
    logo.classList.add('touching');
    emit('trail:suspend');
    emit('cursor:state', { visible: false });
  }, { passive: true });
  function endTouch() {
    logo.classList.remove('touching');
    window.itchsonAnimation.request(() => {
      emit('trail:reset', { x: cursorX, y: cursorY });
      emit('trail:resume');
      emit('cursor:state', { visible: true });
    });
  }
  logo.addEventListener('touchend', endTouch, { passive: true });
  logo.addEventListener('touchcancel', endTouch, { passive: true });
})();
