// Pixel jet cursor that appears on background and orients along motion,
    // also shoots a projectile in its facing direction on background click/tap.
    // Pre-start: show system cursor, and animate the jet flying in an ellipse around the logo.
    (function() {
      const isFinePointer = window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches;
      if (!isFinePointer) return; // do not show custom cursor on touch-only devices

      const jet = document.getElementById('jetCursor');
      const animation = window.itchsonAnimation;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const logo = document.querySelector('.logo-container');
      const subtitle = document.querySelector('.subtitle');
      let orbitGeometry = null;
      let orbitFrame = 0;
      let pausedAt = null;
      let gameStarted = false; // gated start: first background click starts game
      let orbitActive = true;  // pre-start orbit around logo
      let orbitStartTime = performance.now();
      let orbitTheta = 0;
      let prevOrbitX = null;
      let prevOrbitY = null;
      let sentOrbitMode = false;
      let lastClientX = 0;
      let lastClientY = 0;
      let lastAngleDeg = 0;
      let hasLast = false;
      let smoothedVX = 0; // filtered velocity X
      let smoothedVY = 0; // filtered velocity Y

      function isInteractiveElement(el) {
        if (!el) return false;
        // Treat standard interactive controls and ARIA roles as interactive
        if (el.closest('.pixel-link, a[href], button, input, textarea, select, [role="button"], [role="link"]')) return true;
        // Also treat anything that presents a pointer cursor as interactive
        try {
          const cs = window.getComputedStyle(el);
          if (cs && cs.cursor === 'pointer') return true;
        } catch (_) { /* ignore */ }
        return false;
      }

      // Use RAF batching to avoid jitter from rapid native mousemove events
      let jetQueued = false;
      let jetEvent = null;
      function updateJet(e) {
        if (!gameStarted || animation.paused) return;
        jetEvent = e;
        if (!jetQueued) {
          jetQueued = true;
          animation.request(runJetUpdate);
        }
      }

      function runJetUpdate() {
        jetQueued = false;
        const e = jetEvent;
        if (!e || animation.paused) return;
        if (!gameStarted) {
          // Before the game starts, keep system cursor and ignore mouse-follow logic
          return;
        }
        const x = e.clientX;
        const y = e.clientY;
        const target = document.elementFromPoint(x, y);
        const interactive = isInteractiveElement(target);

        if (interactive) {
          hideJet();
          hasLast = false;
          try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x, y, angleDeg: lastAngleDeg, visible: false } })); } catch (_) {}
          return;
        }

        // Show jet and hide system cursor
        document.body.classList.add('has-jet-cursor');
        jet.style.opacity = '1';

        let dx = 0, dy = 0;
        if (hasLast) {
          dx = x - lastClientX; dy = y - lastClientY;
        }

        // Exponential smoothing of velocity vector to avoid angle wrap jitter
        const speed = Math.hypot(dx, dy);
        // Dynamic smoothing: more responsive at higher speed, smoother at low speed
        const beta = Math.min(0.4, 0.12 + speed * 0.04); // 0.12..0.4
        smoothedVX = smoothedVX * (1 - beta) + dx * beta;
        smoothedVY = smoothedVY * (1 - beta) + dy * beta;

        const smoothedSpeed = Math.hypot(smoothedVX, smoothedVY);
        if (smoothedSpeed > 0.1) {
          // Angle computed from filtered vector; +90 so 0deg points up
          lastAngleDeg = Math.atan2(smoothedVY, smoothedVX) * 180 / Math.PI + 90;
        }

        jet.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${lastAngleDeg}deg)`;

        lastClientX = x; lastClientY = y; hasLast = true;
        try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x, y, angleDeg: lastAngleDeg, visible: true } })); } catch (_) {}
      }

      function hideJet() {
        jet.style.opacity = '0';
        document.body.classList.remove('has-jet-cursor');
      }

      window.addEventListener('resize', () => {
        // Keep position bounded on resize; nothing else needed
        const rect = document.documentElement.getBoundingClientRect();
        if (lastClientX > rect.width || lastClientY > rect.height) hideJet();
      }, { passive: true });

      // Background click/tap to shoot
      // Determine actual rendered content height under background-size: contain
      const cursorAspect = 1; // width/height of SVG viewBox
      (function initCursorAsset(){
        try {
          // Same original sprite, served locally under the site's image policy.
          const url = '/assets/ships/ffffff.svg';
          const urlBlack = '/assets/ships/000000.svg';
          const jet = document.getElementById('jetCursor');
          if (jet) {
            jet.style.backgroundImage = `url(${url})`;
            jet.dataset.bgNormal = url;
            jet.dataset.bgFlash = urlBlack;
          }
        } catch (_) { /* ignore */ }
      })();

      function getJetSizePx() {
        const val = getComputedStyle(jet).getPropertyValue('--jet-size') || '18px';
        const num = parseFloat(val);
        return isFinite(num) ? num : 18;
      }

      function getNoseOffsetPx() {
        const S = getJetSizePx();
        // background-size: contain; the sprite nose is at the top edge of content
        // When wider-than-tall (aspect > 1), height is S / aspect; else height is S
        const contentHeight = cursorAspect > 1 ? (S / cursorAspect) : S;
        const base = contentHeight / 2;
        const adjust = parseFloat(getComputedStyle(jet).getPropertyValue('--jet-nose-adjust') || '0');
        return base + (isFinite(adjust) ? adjust : 0);
      }

      function onBackgroundAction(e) {
        if (animation.paused) return;
        const x = e.clientX;
        const y = e.clientY;
        const target = document.elementFromPoint(x, y);
        // Pre-start: clicking background starts the game (no shot)
        if (!gameStarted) {
          if (isInteractiveElement(target)) return; // don't hijack clicks on interactive UI
          startGameAt(x, y);
          try { window.dispatchEvent(new CustomEvent('game:start')); } catch (_) {}
          return;
        }
        // Do not shoot when clicking interactive UI
        if (isInteractiveElement(target)) return;
        // Spawn from the mouse position; direction = current facing angle
        const spawnX = x;
        const spawnY = y;
        const ev = new CustomEvent('jet:shoot', { detail: { x, y, spawnX, spawnY, angleDeg: lastAngleDeg } });
        window.dispatchEvent(ev);
      }

      document.addEventListener('pointerdown', (e) => {
        // One primary action on hybrid devices; right-click must remain a browser action.
        if (e.button !== 0 || !e.isPrimary) return;
        onBackgroundAction(e);
      }, { passive: true });

      // Wire to pointer move globally so cursor follows anywhere
      if (isFinePointer) {
        window.addEventListener('mousemove', updateJet, { passive: true });
      }
      window.addEventListener('mouseleave', () => { smoothedVX = 0; smoothedVY = 0; }, { passive: true });
      window.addEventListener('mouseleave', () => {
        try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x: lastClientX, y: lastClientY, angleDeg: lastAngleDeg, visible: false } })); } catch (_) {}
      }, { passive: true });

      // Return to pre-start orbit visuals when logo reset happens
      window.addEventListener('cursor:restore-orbit', () => {
        gameStarted = false;
        orbitActive = true;
        prevOrbitX = null; prevOrbitY = null; sentOrbitMode = false;
        startOrbit();
        // Show system cursor again; keep jet visible for orbit path
        document.body.classList.remove('has-jet-cursor');
        jet.style.opacity = '1';
        // Align and resume trail to current orbit placement to prevent jump
        try {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('trail:reset', { detail: { x: lastClientX, y: lastClientY } }));
            window.dispatchEvent(new CustomEvent('trail:resume'));
          }, 16);
        } catch(_) {}
      });

      function startGameAt(x, y) {
        gameStarted = true;
        orbitActive = false;
        stopOrbit();
        prevOrbitX = null; prevOrbitY = null; sentOrbitMode = false;
        try { window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'game' } })); } catch (_) {}
        // Immediately show jet at current cursor position and hide system cursor
        document.body.classList.add('has-jet-cursor');
        jet.style.opacity = '1';
        // Keep current angle (from orbit) so it doesn't snap; position at click
        lastClientX = x; lastClientY = y;
        smoothedVX = 0; smoothedVY = 0; hasLast = false;
        jet.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${lastAngleDeg}deg)`;
        try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x, y, angleDeg: lastAngleDeg, visible: true } })); } catch (_) {}
        // Align and clear trail to avoid artifacts from pre-start orbit
        try { window.dispatchEvent(new CustomEvent('trail:reset', { detail: { x, y } })); } catch (_) {}
      }

      // Flash the cursor white->black briefly when hit by an enemy bullet
      let flashTimer = 0;
      window.addEventListener('cursor:flash', (ev) => {
        try {
          const duration = (ev && ev.detail && typeof ev.detail.durationMs === 'number') ? ev.detail.durationMs : 140;
          const normal = jet.dataset.bgNormal;
          const flash = jet.dataset.bgFlash;
          if (!flash || !normal) return;
          jet.style.backgroundImage = `url(${flash})`;
          if (flashTimer) clearTimeout(flashTimer);
          flashTimer = window.setTimeout(() => {
            jet.style.backgroundImage = `url(${normal})`;
            flashTimer = 0;
          }, Math.max(60, Math.min(600, duration)));
        } catch (_) { /* noop */ }
      });

      // Layout changes are infrequent; do not measure DOM geometry every frame.
      function refreshOrbitGeometry() {
        if (!logo) return;
        const rl = logo.getBoundingClientRect();
        const rs = subtitle ? subtitle.getBoundingClientRect() : rl;
        // Union rect around logo + subtitle with some padding
        const pad = 24;
        const left = Math.min(rl.left, rs.left) - pad;
        const right = Math.max(rl.right, rs.right) + pad;
        const top = Math.min(rl.top, rs.top) - pad;
        const bottom = Math.max(rl.bottom, rs.bottom) + pad;
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);
        // Slightly larger ellipse than the union box to clearly orbit around it
        orbitGeometry = {
          cx: (left + right) * 0.5, cy: (top + bottom) * 0.5,
          rx: Math.max(60, width * 0.55), ry: Math.max(48, height * 0.65)
        };
        startOrbit();
      }

      // Pre-start orbit animation around the logo + subtitle
      function updateOrbit(now) {
        if (!orbitActive || !orbitGeometry) return;
        const { cx, cy, rx, ry } = orbitGeometry;
        const speed = 0.8; // radians/sec
        const t = reducedMotion.matches ? 0 : (now - orbitStartTime) / 1000;
        orbitTheta = t * speed;
        const x = cx + rx * Math.cos(orbitTheta);
        const y = cy + ry * Math.sin(orbitTheta);
        // Tangent vector for facing direction along ellipse
        const tx = -rx * Math.sin(orbitTheta);
        const ty =  ry * Math.cos(orbitTheta);
        const angleDeg = Math.atan2(ty, tx) * 180 / Math.PI + 90;
        jet.style.opacity = '1';
        jet.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angleDeg}deg)`;
        // Track pose, keep system cursor visible (no has-jet-cursor), but enable trail
        lastClientX = x; lastClientY = y; lastAngleDeg = angleDeg;
        try {
          window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x, y, angleDeg, visible: true } }));
          if (!sentOrbitMode) {
            window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'orbit' } }));
            sentOrbitMode = true;
          }
          // Feed parallax camera with the orbit delta
          if (prevOrbitX == null || prevOrbitY == null) {
            prevOrbitX = x; prevOrbitY = y;
          } else {
            const dx = x - prevOrbitX;
            const dy = y - prevOrbitY;
            prevOrbitX = x; prevOrbitY = y;
            window.dispatchEvent(new CustomEvent('camera:delta', { detail: { dx, dy } }));
          }
        } catch (_) {}
      }

      // Keep only the loop currently needed; reduced-motion idle renders once.
      function orbitRaf(now) {
        orbitFrame = 0;
        if (gameStarted || !orbitActive) return;
        updateOrbit(now);
        if (!reducedMotion.matches) orbitFrame = animation.request(orbitRaf);
      }
      function startOrbit() {
        if (!orbitFrame && !gameStarted && orbitActive) orbitFrame = animation.request(orbitRaf);
      }
      function stopOrbit() {
        if (orbitFrame) animation.cancel(orbitFrame);
        orbitFrame = 0;
      }
      window.addEventListener('game:pause', () => {
        pausedAt = performance.now();
        jetEvent = null;
        hasLast = false;
        smoothedVX = 0; smoothedVY = 0;
      });
      window.addEventListener('game:resume', () => {
        if (pausedAt !== null) orbitStartTime += performance.now() - pausedAt;
        pausedAt = null;
      });
      reducedMotion.addEventListener('change', () => {
        prevOrbitX = null; prevOrbitY = null;
        stopOrbit(); startOrbit();
      });
      window.addEventListener('resize', refreshOrbitGeometry, { passive: true });
      if (window.ResizeObserver && logo) {
        const observer = new ResizeObserver(refreshOrbitGeometry);
        observer.observe(logo);
        if (subtitle) observer.observe(subtitle);
      }
      if (document.fonts) document.fonts.ready.then(refreshOrbitGeometry);
      refreshOrbitGeometry();
    })();
