// Mobile virtual joystick + shoot button for touch-only devices
    (function() {
      const isTouchOnly = window.matchMedia('(pointer: coarse)').matches;
      if (!isTouchOnly) return;

      const controls = document.getElementById('mobileControls');
      const joystick = controls && controls.querySelector('.joystick');
      const thumb = controls && controls.querySelector('.joystick-thumb');
      const shootBtn = document.getElementById('shootBtn');
      const jetEl = document.getElementById('jetCursor');
      if (!controls || !joystick || !thumb || !shootBtn || !jetEl) return;
      const animation = window.itchsonAnimation;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const logo = document.querySelector('.logo-container');
      const subtitle = document.querySelector('.subtitle');
      let orbitGeometry = null;
      let orbitFrame = 0, movementFrame = 0;
      let pausedAt = null;

      // Initialize mobile jet cursor sprite (desktop init is disabled on touch-only)
      try {
        const url = '/assets/ships/ffffff.svg';
        const urlBlack = '/assets/ships/000000.svg';
        jetEl.style.backgroundImage = `url(${url})`;
        jetEl.dataset.bgNormal = url;
        jetEl.dataset.bgFlash = urlBlack;
      } catch (_) {}

      let gameStarted = false;
      let activeTouchId = null;
      let joyUnitX = 0, joyUnitY = 0, joyMag = 0; // -1..1, magnitude 0..1
      let lastAngleDeg = 0;
      let virtualX = window.innerWidth / 2;
      let virtualY = window.innerHeight / 2;
      let lastVX = virtualX, lastVY = virtualY;
      let lastTs = performance.now();

      // Pre-start orbit state (mirror desktop behavior for mobile)
      let orbitActive = true;
      let orbitStartTime = performance.now();
      let orbitTheta = 0;
      let prevOrbitX = null;
      let prevOrbitY = null;
      let sentOrbitMode = false;

      function isInteractive(el) {
        if (!el) return false;
        if (el.closest('.pixel-link, a[href], button, input, textarea, select, [role="button"], [role="link"]')) return true;
        try { const cs = window.getComputedStyle(el); if (cs && cs.cursor === 'pointer') return true; } catch(_) {}
        return false;
      }

      function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

      function setVisible(on) {
        controls.style.display = on ? 'block' : 'none';
        shootBtn.style.display = on ? 'inline-flex' : 'none';
        controls.setAttribute('aria-hidden', on ? 'false' : 'true');
        // Also show/hide the mobile jet sprite
        try {
          if (on) {
            document.body.classList.add('has-jet-cursor');
            jetEl.style.opacity = '1';
          } else {
            jetEl.style.opacity = '0';
            document.body.classList.remove('has-jet-cursor');
          }
        } catch (_) {}
        // Align shoot button vertically with joystick center when visible
        if (on) animation.request(updateShootBtnAlignment);
      }

      function centerOf(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: Math.min(r.width, r.height) / 2 };
      }

      function updateThumb(dx, dy, r) {
        const len = Math.hypot(dx, dy);
        let ux = 0, uy = 0, mag = 0;
        if (len > 0) { ux = dx / len; uy = dy / len; mag = Math.min(1, len / r); }
        joyUnitX = ux; joyUnitY = uy; joyMag = mag;
        const maxOffset = r * 0.6 * mag;
        // set CSS vars so transform keeps perfect centering
        thumb.style.setProperty('--joy-dx', `${ux * maxOffset}px`);
        thumb.style.setProperty('--joy-dy', `${uy * maxOffset}px`);
        if (mag > 0.02) lastAngleDeg = Math.atan2(uy, ux) * 180 / Math.PI + 90;
      }

      // Keep shoot button vertically aligned with joystick center while pinned to bottom-right
      function updateShootBtnAlignment() {
        try {
          if (shootBtn.style.display === 'none') return;
          const jr = joystick.getBoundingClientRect();
          const br = shootBtn.getBoundingClientRect();
          const joyCenterY = jr.top + jr.height / 2;
          const desiredBottom = Math.max(8, Math.round(window.innerHeight - joyCenterY - br.height / 2));
          shootBtn.style.right = '16px';
          shootBtn.style.bottom = desiredBottom + 'px';
        } catch (_) {}
      }

      function handleJoyTouch(e) {
        if (animation.paused || !gameStarted) return;
        const c = centerOf(joystick);
        if (!e.changedTouches || !e.changedTouches.length) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (e.type === 'touchstart') { if (activeTouchId == null) activeTouchId = t.identifier; else continue; }
          if (t.identifier !== activeTouchId) continue;
          const dx = t.clientX - c.x;
          const dy = t.clientY - c.y;
          if (e.type === 'touchend' || e.type === 'touchcancel') {
            activeTouchId = null;
            updateThumb(0, 0, c.radius);
            // touchcancel is often non-cancelable when scrolling is in progress
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            return;
          }
          updateThumb(dx, dy, c.radius);
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      joystick.addEventListener('touchstart', handleJoyTouch, { passive: false });
      joystick.addEventListener('touchmove', handleJoyTouch, { passive: false });
      joystick.addEventListener('touchend', handleJoyTouch, { passive: false });
      joystick.addEventListener('touchcancel', handleJoyTouch, { passive: false });

      // Maintain alignment on viewport changes
      window.addEventListener('resize', () => animation.request(updateShootBtnAlignment), { passive: true });
      window.matchMedia('(orientation: portrait)').addEventListener?.('change', () => animation.request(updateShootBtnAlignment));

      // Global background touch to start the game on mobile
      document.addEventListener('touchstart', (e) => {
        if (gameStarted || animation.paused) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        const target = document.elementFromPoint(t.clientX, t.clientY);
        if (isInteractive(target) || controls.contains(target) || shootBtn.contains(target)) return;
        gameStarted = true;
        virtualX = t.clientX; virtualY = t.clientY; lastVX = virtualX; lastVY = virtualY;
        try { window.dispatchEvent(new CustomEvent('game:start')); } catch(_) {}
        // Use orbit mode so starfield ignores physical touch deltas; we'll drive camera via joystick
        try { window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'orbit' } })); } catch(_) {}
        try { window.dispatchEvent(new CustomEvent('trail:reset', { detail: { x: virtualX, y: virtualY } })); } catch(_) {}
        try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x: virtualX, y: virtualY, angleDeg: lastAngleDeg, visible: true } })); } catch(_) {}
        setVisible(true);
        // Stop orbiting when gameplay starts
        orbitActive = false;
        prevOrbitX = null; prevOrbitY = null; sentOrbitMode = false;
      }, { passive: true });

      // Show/hide with game lifecycle
      window.addEventListener('game:start', () => {
        gameStarted = true; orbitActive = false;
        stopOrbit(); setVisible(true); startMovement();
      });
      window.addEventListener('enemies:reset', () => {
        gameStarted = false; setVisible(false);
        if (movementFrame) animation.cancel(movementFrame);
        movementFrame = 0;
        joyUnitX = 0; joyUnitY = 0; joyMag = 0; activeTouchId = null;
        const c = centerOf(joystick); updateThumb(0, 0, c.radius);
        try { window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'orbit' } })); } catch(_) {}
        // Resume pre-start orbit visuals
        orbitActive = true;
        orbitStartTime = performance.now();
        prevOrbitX = null; prevOrbitY = null; sentOrbitMode = false;
        try { jetEl.style.opacity = '1'; } catch(_) {}
        startOrbit();
      });

      // Also keep the button aligned on scroll (rare, but possible in some UIs)
      window.addEventListener('scroll', () => animation.request(updateShootBtnAlignment), { passive: true });

      // Shoot button
      function shoot() {
        if (!gameStarted || animation.paused) return;
        const angleDeg = lastAngleDeg;
        try { window.dispatchEvent(new CustomEvent('jet:shoot', { detail: { x: virtualX, y: virtualY, spawnX: virtualX, spawnY: virtualY, angleDeg } })); } catch(_) {}
      }
      shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); shoot(); }, { passive: false });
      shootBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); shoot(); });

      // Drive virtual pointer from joystick in its own RAF loop
      function raf() {
        movementFrame = 0;
        if (!gameStarted) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
        lastTs = now;
        if (gameStarted) {
          // Pixels per second at full deflection
          const speed = 380;
          const vx = joyUnitX * joyMag * speed;
          const vy = joyUnitY * joyMag * speed;
          const nx = clamp(virtualX + vx * dt, 0, window.innerWidth);
          const ny = clamp(virtualY + vy * dt, 0, window.innerHeight);
          const dx = nx - virtualX;
          const dy = ny - virtualY;
          if (dx !== 0 || dy !== 0) {
            try { window.dispatchEvent(new CustomEvent('camera:delta', { detail: { dx, dy } })); } catch(_) {}
          }
          virtualX = nx; virtualY = ny;
          lastVX = nx; lastVY = ny;
          // Update on-screen jet sprite and broadcast state as visible
          jetEl.style.transform = `translate(${virtualX}px, ${virtualY}px) translate(-50%, -50%) rotate(${lastAngleDeg}deg)`;
          try { window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x: virtualX, y: virtualY, angleDeg: lastAngleDeg, visible: true } })); } catch(_) {}
        }
        movementFrame = animation.request(raf);
      }
      function startMovement() {
        if (movementFrame || !gameStarted) return;
        lastTs = performance.now();
        movementFrame = animation.request(raf);
      }

      // Cache the original ellipse until responsive layout or fonts change.
      function refreshOrbitGeometry() {
        if (!logo) return;
        const rl = logo.getBoundingClientRect();
        const rs = subtitle ? subtitle.getBoundingClientRect() : rl;
        const pad = 24;
        const left = Math.min(rl.left, rs.left) - pad;
        const right = Math.max(rl.right, rs.right) + pad;
        const top = Math.min(rl.top, rs.top) - pad;
        const bottom = Math.max(rl.bottom, rs.bottom) + pad;
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);
        orbitGeometry = {
          cx: (left + right) * 0.5, cy: (top + bottom) * 0.5,
          rx: Math.max(60, width * 0.55), ry: Math.max(48, height * 0.65)
        };
        startOrbit();
      }

      // Pre-start orbit animation around the logo + subtitle (mobile)
      function updateOrbit(now) {
        if (!orbitActive || gameStarted || !orbitGeometry) return;
        const { cx, cy, rx, ry } = orbitGeometry;
        const speed = 0.8; // radians/sec
        const t = reducedMotion.matches ? 0 : (now - orbitStartTime) / 1000;
        orbitTheta = t * speed;
        const x = cx + rx * Math.cos(orbitTheta);
        const y = cy + ry * Math.sin(orbitTheta);
        const tx = -rx * Math.sin(orbitTheta);
        const ty =  ry * Math.cos(orbitTheta);
        const angleDeg = Math.atan2(ty, tx) * 180 / Math.PI + 90;
        try {
          jetEl.style.opacity = '1';
          jetEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angleDeg}deg)`;
          lastAngleDeg = angleDeg; virtualX = x; virtualY = y;
          window.dispatchEvent(new CustomEvent('cursor:state', { detail: { x, y, angleDeg, visible: true } }));
          if (!sentOrbitMode) {
            window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'orbit' } }));
            sentOrbitMode = true;
          }
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
        activeTouchId = null;
        updateThumb(0, 0, 1);
      });
      window.addEventListener('game:resume', () => {
        if (pausedAt !== null) orbitStartTime += performance.now() - pausedAt;
        pausedAt = null;
        lastTs = performance.now();
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
