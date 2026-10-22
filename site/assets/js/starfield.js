// Starfield with layered parallax (white pixel quads), moves ONLY when the mouse/touch moves
    (function() {
      const canvas = document.getElementById('starfield');
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      let width = 0, height = 0;

      const layers = [
        // Far, Medium, Near — near moves most, far moves least
        { count: 140, size: 1, parallax: 0.20, opacity: 0.5, stars: [] },
        { count: 90,  size: 2, parallax: 0.50, opacity: 0.75, stars: [] },
        { count: 60,  size: 3, parallax: 1.00, opacity: 1.0, stars: [] }
      ];

      // Logo accent palette (matches letter colors)
      const logoColors = [
        '#ff0040', // I
        '#00ff80', // T
        '#0080ff', // C
        '#ffff00', // H
        '#ff8000', // S
        '#ff0080', // O
        '#8000ff'  // N
      ];

      // Starfield color control: assign per-star colors on game over; reset to white on restart
      function setStarfieldColorsRandomLogo() {
        for (let i = 0; i < layers.length; i++) {
          const stars = layers[i].stars;
          for (let j = 0; j < stars.length; j++) {
            const s = stars[j];
            s.color = logoColors[Math.floor(Math.random() * logoColors.length)];
          }
        }
      }
      function setStarfieldColorsWhite() {
        for (let i = 0; i < layers.length; i++) {
          const stars = layers[i].stars;
          for (let j = 0; j < stars.length; j++) {
            const s = stars[j];
            s.color = '#ffffff';
          }
        }
      }

      // Enemy tuning (base values; mobile scaling applied at runtime)
      const ENEMY_SPEED_MIN_BASE = 140; // px/s
      const ENEMY_SPEED_MAX_BASE = 240; // px/s
      // Player proximity rules (define constants before use)
      const PLAYER_FLEE_DIST = 20;  // <= flee
      const PLAYER_CHASE_DIST = 50; // <= chase player; > seek blocks
      // Shooting window tuning (distance)
      // Player window (favoured, generally farther)
      const SHOOT_PLAYER_MIN_RANGE_MIN_BASE = 200;
      const SHOOT_PLAYER_MIN_RANGE_MAX_BASE = 280;
      const SHOOT_PLAYER_MAX_RANGE_MIN_BASE = 280;
      const SHOOT_PLAYER_MAX_RANGE_MAX_BASE = 440;
      // Block window (shorter/closer than player)
      const SHOOT_BLOCK_MIN_RANGE_MIN_BASE = 140;
      const SHOOT_BLOCK_MIN_RANGE_MAX_BASE = 220;
      const SHOOT_BLOCK_MAX_RANGE_MIN_BASE = 260;
      const SHOOT_BLOCK_MAX_RANGE_MAX_BASE = 380;
      const SHOOT_HYSTERESIS_BASE = 20; // px added/subtracted when leaving engage
      // Flee window tuning (too close -> flee, far enough -> resume seek)
      const FLEE_ENTER_MIN_BASE = 110;
      const FLEE_ENTER_MAX_BASE = 200;
      const FLEE_EXIT_MIN_BASE = 230;
      const FLEE_EXIT_MAX_BASE = 360;
      // Logo avoidance radius factors (multiplied by enemy size), randomized per enemy
      const LOGO_AVOID_ENTER_FACTOR_MIN_BASE = 1.4;
      const LOGO_AVOID_ENTER_FACTOR_MAX_BASE = 2.2;

      // Mobile scaling
      const isTouchOnlyStar = window.matchMedia('(pointer: coarse)').matches;
      const MOBILE_RANGE_SCALE = isTouchOnlyStar ? 0.45 : 1.0; // much shorter engage windows on mobile
      const MOBILE_AVOID_SCALE = isTouchOnlyStar ? 0.6 : 1.0;  // shrink logo avoidance radii more on mobile
      const MOBILE_FLEE_SCALE  = isTouchOnlyStar ? 0.85 : 1.0; // reduce flee thresholds
      const MOBILE_SPEED_SCALE = isTouchOnlyStar ? 1.10 : 1.0; // slight speed bump to enter screen
      const MOBILE_SPAWN_MARGIN_SCALE = isTouchOnlyStar ? 0.6 : 1.0; // spawn closer to edges
      const MOBILE_SHOOT_HYST_SCALE = isTouchOnlyStar ? 0.7 : 1.0; // tighter hysteresis

      // Derived runtime constants used throughout logic
      const ENEMY_SPEED_MIN = ENEMY_SPEED_MIN_BASE * MOBILE_SPEED_SCALE;
      const ENEMY_SPEED_MAX = ENEMY_SPEED_MAX_BASE * MOBILE_SPEED_SCALE;

      const SHOOT_PLAYER_MIN_RANGE_MIN = SHOOT_PLAYER_MIN_RANGE_MIN_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_PLAYER_MIN_RANGE_MAX = SHOOT_PLAYER_MIN_RANGE_MAX_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_PLAYER_MAX_RANGE_MIN = SHOOT_PLAYER_MAX_RANGE_MIN_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_PLAYER_MAX_RANGE_MAX = SHOOT_PLAYER_MAX_RANGE_MAX_BASE * MOBILE_RANGE_SCALE;

      const SHOOT_BLOCK_MIN_RANGE_MIN = SHOOT_BLOCK_MIN_RANGE_MIN_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_BLOCK_MIN_RANGE_MAX = SHOOT_BLOCK_MIN_RANGE_MAX_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_BLOCK_MAX_RANGE_MIN = SHOOT_BLOCK_MAX_RANGE_MIN_BASE * MOBILE_RANGE_SCALE;
      const SHOOT_BLOCK_MAX_RANGE_MAX = SHOOT_BLOCK_MAX_RANGE_MAX_BASE * MOBILE_RANGE_SCALE;

      const SHOOT_HYSTERESIS = Math.max(12, Math.round(SHOOT_HYSTERESIS_BASE * MOBILE_SHOOT_HYST_SCALE));

      const FLEE_ENTER_MIN = Math.round(FLEE_ENTER_MIN_BASE * MOBILE_FLEE_SCALE);
      const FLEE_ENTER_MAX = Math.round(FLEE_ENTER_MAX_BASE * MOBILE_FLEE_SCALE);
      const FLEE_EXIT_MIN  = Math.round(FLEE_EXIT_MIN_BASE  * MOBILE_FLEE_SCALE);
      const FLEE_EXIT_MAX  = Math.round(FLEE_EXIT_MAX_BASE  * MOBILE_FLEE_SCALE);

      const LOGO_AVOID_ENTER_FACTOR_MIN = LOGO_AVOID_ENTER_FACTOR_MIN_BASE * MOBILE_AVOID_SCALE;
      const LOGO_AVOID_ENTER_FACTOR_MAX = LOGO_AVOID_ENTER_FACTOR_MAX_BASE * MOBILE_AVOID_SCALE;

      // Camera offset accumulates movement; stars shift opposite to camera move
      // Unbounded camera target to avoid wrap discontinuities; per-layer smoothed follows
      let camTargetX = 0, camTargetY = 0;
      // Optional aggregate camera for reference (not used for drawing)
      let camX = 0, camY = 0;
      const sensitivity = 0.6; // pixels of camera per pixel of pointer movement (reduced for slower parallax)
      const cameraSmoothingBase = 7; // lower = longer lag; farther layers derive longer lag; raise for visibility
      const camLayerX = [];
      const camLayerY = [];
      // When true, ignore physical pointer deltas and drive camera from orbit events
      let isOrbitMode = false;

      function initCameraLayers() {
        camLayerX.length = layers.length;
        camLayerY.length = layers.length;
        for (let i = 0; i < layers.length; i++) {
          camLayerX[i] = camTargetX;
          camLayerY[i] = camTargetY;
        }
      }

      // Projectiles (screen-space) rendered atop the stars
      const projectiles = [];

      // Jet trail particles (rendered above stars, below enemies/projectiles)
      const jetTrail = [];
      let trailSuspended = false;
      let lastTrailX = null, lastTrailY = null;
      let cursorAngleDeg = 0;
      let cursorVisible = false;
      window.addEventListener('cursor:state', (ev) => {
        const d = ev && ev.detail ? ev.detail : {};
        if (typeof d.x === 'number') pointerX = d.x;
        if (typeof d.y === 'number') pointerY = d.y;
        if (typeof d.angleDeg === 'number') cursorAngleDeg = d.angleDeg;
        cursorVisible = !!d.visible;
      });

      // Enemies seeking the cursor jet
      const enemies = [];
      const BASE_MAX_ENEMIES = 4;
      const MAX_ENEMIES_CAP = 10;
      let maxEnemies = BASE_MAX_ENEMIES;
      let nextEnemySpawnTs = 0;
      let allBlocksDestroyed = false;
      let playerHasFired = false;
      let gameStarted = false; // start spawns and UI when background is first clicked
      let killCount = 0;
      const killEl = document.getElementById('killCounter');
      const killText = document.getElementById('killText');
      const killCountSpan = document.querySelector('#killText .count');
      function renderKillUI() {
        if (killCountSpan) killCountSpan.textContent = String(killCount);
      }
      function updateMaxEnemiesByKills() {
        // +1 enemy every 10 kills, starting from base, capped at 10
        const bonus = Math.floor(killCount / 10);
        maxEnemies = Math.min(MAX_ENEMIES_CAP, BASE_MAX_ENEMIES + bonus);
      }

      function showKillUI() {
        killCount = 0;
        updateMaxEnemiesByKills();
        renderKillUI();
        if (killEl) killEl.style.display = 'block';
      }
      function hideKillUI() {
        if (killEl) killEl.style.display = 'none';
      }
      function incKillUI() {
        killCount += 1;
        updateMaxEnemiesByKills();
        renderKillUI();
      }
      function setLettersWhite(on) {
        const el = document.querySelector('.logo-container');
        if (!el) return;
        if (on) el.classList.add('letters-white'); else el.classList.remove('letters-white');
      }
      function setGameOver(on) {
        const root = document.documentElement;
        if (!root) return;
        if (on) root.classList.add('game-over'); else root.classList.remove('game-over');
        if (on) window.dispatchEvent(new CustomEvent('game:over'));
      }
      const enemyAspect = 1;
      const enemySprites = new Map();
      function createColoredEnemyImage(hexColor) {
        const color = logoColors.includes(hexColor) ? hexColor.slice(1) : 'ff0040';
        if (!enemySprites.has(color)) {
          const img = new Image();
          img.src = '/assets/ships/' + color + '.svg';
          enemySprites.set(color, img);
        }
        return enemySprites.get(color);
      }
      const enemyImg = createColoredEnemyImage('#ff0040');

      // Debris particles spawned when an enemy is destroyed
      const enemyDebris = [];
      function spawnEnemyDebris(cx, cy, w, h) {
        if (prefersReducedMotion) return;
        const cellsX = Math.max(2, Math.min(5, Math.round(w / 4)));
        const cellsY = Math.max(2, Math.min(5, Math.round(h / 4)));
        const cellW = w / cellsX;
        const cellH = h / cellsY;
        for (let iy = 0; iy < cellsY; iy++) {
          for (let ix = 0; ix < cellsX; ix++) {
            const px = cx + (ix + 0.5) * cellW - w / 2;
            const py = cy + (iy + 0.5) * cellH - h / 2;
            // Direction outward from center with a little randomness
            let dx = px - cx;
            let dy = py - cy;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;
            const angJitter = (Math.random() * 2 - 1) * 0.5; // +/- ~28deg
            const ca = Math.cos(angJitter), sa = Math.sin(angJitter);
            const jx = dx * ca - dy * sa;
            const jy = dx * sa + dy * ca;
            const speed = 140 + Math.random() * 220; // px/s
            const life = 700 + Math.random() * 500; // ms
            const color = logoColors[Math.floor(Math.random() * logoColors.length)];
            enemyDebris.push({
              x: px,
              y: py,
              vx: jx * speed,
              vy: jy * speed,
              size: Math.max(2, Math.min(4, Math.min(cellW, cellH) * 0.8)),
              life,
              age: 0,
              alpha: 1,
              color
            });
          }
        }
      }

      function explodeAllEnemiesAndStop() {
        // Trigger debris for all alive enemies and mark them dead
        const enemySize = getEnemySizePx();
        for (let i = 0; i < enemies.length; i++) {
          const en = enemies[i];
          if (!en.alive) continue;
          const w = enemySize;
          const h = enemyAspect > 1 ? (w / enemyAspect) : w;
          spawnEnemyDebris(en.x, en.y, w, h);
          en.alive = false;
        }
        // Prevent further spawns
        nextEnemySpawnTs = Number.POSITIVE_INFINITY;
      }

      function spawnEnemy() {
        const isTouchOnly = window.matchMedia('(pointer: coarse)').matches;
        const baseMargin = Math.max(60, Math.min(width, height) * 0.1);
        const margin = isTouchOnly ? Math.max(28, baseMargin * MOBILE_SPAWN_MARGIN_SCALE) : baseMargin;
        const side = Math.floor(Math.random() * 4); // 0:top,1:right,2:bottom,3:left
        let x = 0, y = 0;
        if (side === 0) { // top
          x = Math.random() * width; y = -margin;
        } else if (side === 1) { // right
          x = width + margin; y = Math.random() * height;
        } else if (side === 2) { // bottom
          x = Math.random() * width; y = height + margin;
        } else { // left
          x = -margin; y = Math.random() * height;
        }
        const color = logoColors[Math.floor(Math.random() * logoColors.length)];
        const spriteImage = createColoredEnemyImage(color);
        // choose initial shooting windows (player and blocks)
        const minRP = SHOOT_PLAYER_MIN_RANGE_MIN + Math.random() * (SHOOT_PLAYER_MIN_RANGE_MAX - SHOOT_PLAYER_MIN_RANGE_MIN);
        const maxMinP = Math.max(minRP + 40, SHOOT_PLAYER_MAX_RANGE_MIN);
        const maxRP = maxMinP + Math.random() * (SHOOT_PLAYER_MAX_RANGE_MAX - maxMinP);
        const minRB = SHOOT_BLOCK_MIN_RANGE_MIN + Math.random() * (SHOOT_BLOCK_MIN_RANGE_MAX - SHOOT_BLOCK_MIN_RANGE_MIN);
        const maxMinB = Math.max(minRB + 30, SHOOT_BLOCK_MAX_RANGE_MIN);
        const maxRB = maxMinB + Math.random() * (SHOOT_BLOCK_MAX_RANGE_MAX - maxMinB);
        // choose initial flee window
        const fleeEnter = FLEE_ENTER_MIN + Math.random() * (FLEE_ENTER_MAX - FLEE_ENTER_MIN);
        const fleeExitMin = Math.max(fleeEnter + 60, FLEE_EXIT_MIN);
        const fleeExit = fleeExitMin + Math.random() * (FLEE_EXIT_MAX - fleeExitMin);
        // logo avoidance radii
        let logoAvoidEnter = LOGO_AVOID_ENTER_FACTOR_MIN + Math.random() * (LOGO_AVOID_ENTER_FACTOR_MAX - LOGO_AVOID_ENTER_FACTOR_MIN);
        // On mobile, allow closer approach to the logo
        if (isTouchOnlyStar) logoAvoidEnter = Math.max(0.9, logoAvoidEnter * 0.8);
        const logoAvoidExit = logoAvoidEnter + 2.0; // stronger hysteresis so enemies flee farther
        enemies.push({
          x, y,
          vx: 0, vy: 0,
          angleDeg: 0,
          speed: ENEMY_SPEED_MIN + Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN),
          lastShotTs: 0,
          alive: true,
          mode: 'seek',
          fleeCause: null,
          logoFleeUntil: 0,
          preferBlocksUntilTs: 0,
          fleeImmunityUntilTs: 0,
          color,
          spriteImage,
          shootMinPlayer: minRP,
          shootMaxPlayer: maxRP,
          shootMinBlock: minRB,
          shootMaxBlock: maxRB,
          fleeEnter,
          fleeExit,
          logoAvoidEnter,
          logoAvoidExit,
          hasEnteredScreen: false
        });
      }

      function getJetSizePxFromDom() {
        const el = document.getElementById('jetCursor');
        if (!el) return 18;
        const val = getComputedStyle(el).getPropertyValue('--jet-size') || '18px';
        const num = parseFloat(val);
        return isFinite(num) ? num : 18;
      }

      function getEnemySizePx() {
        // Slightly smaller than cursor
        return Math.max(10, getJetSizePxFromDom() * 0.9);
      }

      // Track pointer position for enemy AI
      let pointerX = window.innerWidth / 2;
      let pointerY = window.innerHeight / 2;
      // All gameplay deadlines share a clock that excludes paused/hidden time.
      // Keep the runtime's native timestamps unchanged for other subscribers.
      let pausedAt = window.itchsonAnimation.paused ? performance.now() : null;
      let pausedDuration = 0;
      function gameTime(timestamp = performance.now()) {
        return (pausedAt ?? timestamp) - pausedDuration;
      }
      let lastFrameTs = gameTime();

      // Short-lived jiggle effect for stars, triggered on letter click
      const starJiggle = {
        active: false,
        startTs: 0,
        durationMs: 420
      };

      // Destructible DOM guide pixels (non-letter blocks)
      let destructibles = [];
      // Logo bounding box for enemy avoidance
      let logoRect = { left: 0, top: 0, right: 0, bottom: 0 };
      function rebuildDestructibles() {
        const nodes = document.querySelectorAll('.logo-container .pixel.invisible');
        destructibles = Array.from(nodes).map((el) => ({ el, alive: !el.classList.contains('destroyed'), left: 0, top: 0, right: 0, bottom: 0 }));
        updateDestructibleRects();
        // If rebuilt and none remain alive, reflect shutdown state
        const anyAlive = destructibles.some(d => d.alive);
        if (!anyAlive) {
          allBlocksDestroyed = true;
          explodeAllEnemiesAndStop();
          setLettersWhite(true);
          // Change each star to a random logo color on game over
          setStarfieldColorsRandomLogo();
          setGameOver(true);
        }
      }

      function updateDestructibleRects() {
        for (let i = 0; i < destructibles.length; i++) {
          const d = destructibles[i];
          const r = d.el.getBoundingClientRect();
          d.left = r.left;
          d.top = r.top;
          d.right = r.right;
          d.bottom = r.bottom;
        }
      }

      function updateLogoRect() {
        const el = document.querySelector('.logo-container');
        if (!el) return;
        const r = el.getBoundingClientRect();
        logoRect.left = r.left;
        logoRect.top = r.top;
        logoRect.right = r.right;
        logoRect.bottom = r.bottom;
      }

      function resetDestructibles() {
        // Clear any active projectiles before reviving blocks to avoid immediate re-hits
        projectiles.length = 0;
        for (let i = 0; i < destructibles.length; i++) {
          const d = destructibles[i];
          d.alive = true;
          d.el.classList.remove('destroyed');
        }
        // After reset, recompute rects in case styles changed
        updateDestructibleRects();
        updateLogoRect();
      }

      // Non-destructible letter pixels (visible blocks): bullets should get removed on collision
      let letterBlocks = [];
      function rebuildLetterBlocks() {
        const nodes = document.querySelectorAll('.logo-container .pixel:not(.invisible)');
        letterBlocks = Array.from(nodes).map((el) => ({ el, left: 0, top: 0, right: 0, bottom: 0 }));
        updateLetterBlockRects();
      }
      function updateLetterBlockRects() {
        for (let i = 0; i < letterBlocks.length; i++) {
          const d = letterBlocks[i];
          const r = d.el.getBoundingClientRect();
          d.left = r.left;
          d.top = r.top;
          d.right = r.right;
          d.bottom = r.bottom;
        }
      }

      function beginStarJiggle() {
        if (prefersReducedMotion) return;
        starJiggle.active = true;
        starJiggle.startTs = gameTime();
        // Assign random per-star offsets similar to letter pixel shake
        for (let i = 0; i < layers.length; i++) {
          const stars = layers[i].stars;
          for (let j = 0; j < stars.length; j++) {
            const s = stars[j];
            s.jx = (Math.random() * 2 - 1) * 3; // -3..3 px
            s.jy = (Math.random() * 2 - 1) * 3; // -3..3 px
            s.jd = Math.floor(Math.random() * 80); // stagger like letter pixels
          }
        }
      }

      function spawnProjectile(screenX, screenY, angleDeg, opts = {}) {
        if (projectiles.length >= 256 || ![screenX, screenY, angleDeg].every(Number.isFinite)) return;
        // Angle: 0deg points up; convert to standard radians where 0rad points right
        const radians = (angleDeg - 90) * Math.PI / 180;
        const dirX = Math.cos(radians);
        const dirY = Math.sin(radians);
        const speed = opts.speed || 700; // px/sec
        const size = opts.size || 3;     // px square
        projectiles.push({
          x: screenX,
          y: screenY,
          vx: dirX * speed,
          vy: dirY * speed,
          size,
          despawnMargin: 24,
          from: opts.from || 'player',
          color: opts.color || (opts.from === 'enemy' ? '#ffff00' : '#ffff00')
        });
      }

      // Track last pointer position for devices without movementX/Y
      let hasLast = false;
      let lastX = 0, lastY = 0;

      function resize() {
        dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        // Ensure CSS size matches viewport CSS pixels for correct pointer alignment
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Re-align layer cameras to current target to avoid discontinuity
        initCameraLayers();

        initStars();
      }

      function initStars() {
        const area = width * height;
        // Adjust counts roughly to viewport area (keeps density stable)
        layers[0].count = Math.round(area / 22000);
        layers[1].count = Math.round(area / 36000);
        layers[2].count = Math.round(area / 56000);
        layers.forEach(layer => {
          layer.stars = new Array(layer.count).fill(0).map(() => {
            // More stars twinkle, with stronger peaks and occasional bursts
            const twinkleEnabled = Math.random() < 0.55; // ~55% twinkle
            const twinkleAmp = twinkleEnabled ? (0.55 + Math.random() * 0.45) : 0; // 0.55..1.0
            const twinkleSpeed = twinkleEnabled ? (0.9 + Math.random() * 2.1) : 0; // rad/s
            const twinklePhase = Math.random() * Math.PI * 2;
            const burstEnabled = twinkleEnabled && Math.random() < 0.35; // subset get rare sparkles
            const burstSpeed = burstEnabled ? (0.15 + Math.random() * 0.35) : 0; // slow gate
            return {
              x: Math.random() * width,
              y: Math.random() * height,
              color: '#ffffff',
              twinkleAmp,
              twinkleSpeed,
              twinklePhase,
              burstEnabled,
              burstSpeed,
              jx: 0,
              jy: 0,
              jd: 0
            };
          });
        });
        // Rebuild rects after content layout may shift
        try { updateDestructibleRects(); updateLogoRect(); } catch (_) {}
      }

      function wrap(value, max) {
        return (value % max + max) % max;
      }

      function applyDelta(dx, dy) {
        // Move the unbounded camera targets; actual draw uses per-layer smoothed values
        camTargetX += dx * sensitivity;
        camTargetY += dy * sensitivity;
      }

      function onMouseMove(e) {
        if (window.itchsonAnimation.paused) return;
        if (isOrbitMode) return; // during orbit, ignore physical mouse
        // Prefer movementX/Y when available for reliability across pointer lock etc.
        if (typeof e.movementX === 'number' && typeof e.movementY === 'number') {
          applyDelta(e.movementX, e.movementY);
        } else {
          if (!hasLast) {
            hasLast = true; lastX = e.clientX; lastY = e.clientY; return;
          }
          applyDelta(e.clientX - lastX, e.clientY - lastY);
          lastX = e.clientX; lastY = e.clientY;
        }
        pointerX = e.clientX;
        pointerY = e.clientY;
      }

      function onTouchMove(e) {
        if (window.itchsonAnimation.paused) return;
        if (isOrbitMode) return;
        if (!(e.touches && e.touches.length)) return;
        const t = e.touches[0];
        if (!hasLast) {
          hasLast = true; lastX = t.clientX; lastY = t.clientY; return;
        }
        applyDelta(t.clientX - lastX, t.clientY - lastY);
        lastX = t.clientX; lastY = t.clientY;
        pointerX = t.clientX; pointerY = t.clientY;
      }

      function resetLast() {
        hasLast = false;
      }

      // Mouse and touch
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('mouseleave', (e) => { resetLast(); }, { passive: true });
      window.addEventListener('touchend', resetLast, { passive: true });
      // Allow cursor controller to toggle orbit mode and drive camera/trail explicitly
      window.addEventListener('cursor:mode', (ev) => {
        const m = ev && ev.detail && ev.detail.mode;
        isOrbitMode = (m === 'orbit');
      });
      window.addEventListener('camera:delta', (ev) => {
        const d = (ev && ev.detail) || {};
        if (typeof d.dx === 'number' && typeof d.dy === 'number') applyDelta(d.dx, d.dy);
      });
      window.addEventListener('trail:reset', (ev) => {
        const d = (ev && ev.detail) || {};
        if (typeof d.x === 'number' && typeof d.y === 'number') {
          lastTrailX = d.x; lastTrailY = d.y;
        } else {
          lastTrailX = pointerX; lastTrailY = pointerY;
        }
        // Optionally clear accumulated particles to avoid sudden dump
        jetTrail.length = 0;
      });
      window.addEventListener('trail:suspend', () => { trailSuspended = true; });
      window.addEventListener('trail:resume', () => {
        lastTrailX = pointerX; lastTrailY = pointerY;
        jetTrail.length = 0;
        trailSuspended = false;
      });

      // Reset handler from UI
      window.addEventListener('destruct:reset', resetDestructibles);

      // Respect reduced motion: disable parallax response entirely
      const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
      let prefersReducedMotion = motionPreference.matches;
      motionPreference.addEventListener('change', () => { prefersReducedMotion = motionPreference.matches; scheduleFrame(); });

      let frameId = 0;
      function scheduleFrame() {
        if (!frameId) frameId = window.itchsonAnimation.request(frame);
      }
      function frame(ts) {
        frameId = 0;
        const now = gameTime(ts);
        let dt = (now - lastFrameTs) / 1000;
        if (!isFinite(dt) || dt < 0) dt = 0;
        dt = Math.max(0, Math.min(dt, 0.05));
        lastFrameTs = now;

        // Update aggregate camera (optional reference)
        camX = camTargetX;
        camY = camTargetY;

        // Ensure camera layers exist
        if (camLayerX.length !== layers.length || camLayerY.length !== layers.length) {
          initCameraLayers();
        }

        // Per-layer camera smoothing: farther layers lag more
        // We invert parallax to get longer time constant for smaller p
        for (let i = 0; i < layers.length; i++) {
          const p = layers[i].parallax || 0.0001;
          // derive smoothing such that far (small p) => smaller rate => longer lag
          const followRate = cameraSmoothingBase * p; // units per second; tune base as needed
          const k = 1 - Math.exp(-(followRate) * dt);
          camLayerX[i] += (camTargetX - camLayerX[i]) * k;
          camLayerY[i] += (camTargetY - camLayerY[i]) * k;
        }

        ctx.clearRect(0, 0, width, height);
        const tSec = now / 1000;

        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i];
          const p = prefersReducedMotion ? 0 : layer.parallax;
          // Use smoothed per-layer camera for offset
          const camLX = prefersReducedMotion ? 0 : camLayerX[i];
          const camLY = prefersReducedMotion ? 0 : camLayerY[i];
          const ox = -camLX * p; // negative to move stars opposite camera
          const oy = -camLY * p;

          // Each star may have its own color; default white
          // We will set ctx.fillStyle per-star below

          for (let j = 0; j < layer.stars.length; j++) {
            const star = layer.stars[j];
            let x = wrap(star.x + ox, width);
            let y = wrap(star.y + oy, height);

            // Apply jiggle offsets if active following keyframe-like progression
            if (starJiggle.active && !prefersReducedMotion) {
              const elapsed = now - starJiggle.startTs - (star.jd || 0);
              const t = elapsed / starJiggle.durationMs;
              if (t >= 1) {
                starJiggle.active = false;
              } else if (t >= 0) {
                // Keyframe factors: 0->0, .25->1, .5->-0.6, .75->0.3, 1->0
                let factor = 0;
                if (t < 0.25) {
                  factor = t / 0.25; // 0..1
                } else if (t < 0.5) {
                  const u = (t - 0.25) / 0.25; // 0..1
                  factor = 1 + (-0.6 - 1) * u; // 1 -> -0.6
                } else if (t < 0.75) {
                  const u = (t - 0.5) / 0.25; // 0..1
                  factor = -0.6 + (0.3 + 0.6) * u; // -0.6 -> 0.3
                } else {
                  const u = (t - 0.75) / 0.25; // 0..1
                  factor = 0.3 + (0 - 0.3) * u; // 0.3 -> 0
                }
                x += star.jx * factor;
                y += star.jy * factor;
              }
            }
            // Per-star flicker alpha with pronounced peaks and occasional sparkle
            let starAlpha = 1;
            if (!prefersReducedMotion && star.twinkleAmp > 0) {
              const s = Math.sin(tSec * star.twinkleSpeed + star.twinklePhase) * 0.5 + 0.5; // 0..1
              const shaped = s * s; // sharpen peaks
              starAlpha = 0.25 + shaped * star.twinkleAmp * 0.75; // 0.25..~1
              if (star.burstEnabled) {
                const burst = Math.sin(tSec * star.burstSpeed + star.twinklePhase);
                if (burst > 0.92) {
                  starAlpha = Math.min(1, starAlpha + 0.35);
                }
              }
            }
            const drawAlpha = Math.max(0.08, Math.min(1, layer.opacity * starAlpha));
            ctx.globalAlpha = drawAlpha;
            ctx.fillStyle = star.color || '#ffffff';
            ctx.fillRect(x, y, layer.size, layer.size);
            // Occasional sparkle cross at bright peak
            if (drawAlpha > 0.9) {
              ctx.fillRect(x + 1, y, 1, 1);
              if (layer.size >= 2) ctx.fillRect(x, y + 1, 1, 1);
            }
          }
        }

        ctx.globalAlpha = 1;

        // Update and draw jet trail (background effect)
        (function updateJetTrail(){
          // Update existing particles
          if (jetTrail.length) {
            for (let i = jetTrail.length - 1; i >= 0; i--) {
              const p = jetTrail[i];
              p.age += dt * 1000;
              if (p.age >= p.life) { jetTrail.splice(i, 1); continue; }
              p.x += p.vx * dt; p.y += p.vy * dt;
              // light drag
              p.vx *= 0.988; p.vy *= 0.988;
            }
          }
          if (trailSuspended) { lastTrailX = pointerX; lastTrailY = pointerY; return; }
          if (!cursorVisible || prefersReducedMotion) { lastTrailX = pointerX; lastTrailY = pointerY; return; }
          else {
            const x = pointerX, y = pointerY;
            if (lastTrailX == null || lastTrailY == null) { lastTrailX = x; lastTrailY = y; }
            const dx = x - lastTrailX, dy = y - lastTrailY;
            const dist = Math.hypot(dx, dy);
            const spacing = 5; // px between spawns along the path (shorter trail)
            if (dist >= 0.5) {
              const steps = Math.floor(dist / spacing);
              // Forward unit based on cursor angle (0deg = up)
              const rad = (cursorAngleDeg - 90) * Math.PI / 180;
              const fx = Math.cos(rad), fy = Math.sin(rad);
              const rearOffset = getJetSizePxFromDom() * 0.45;
              for (let s = 0; s <= steps; s++) {
                const t = steps > 0 ? (s / steps) : 1;
                const px = lastTrailX + dx * t - fx * rearOffset;
                const py = lastTrailY + dy * t - fy * rearOffset;
                const jitter = 0.8;
                const jx = (Math.random() * 2 - 1) * jitter;
                const jy = (Math.random() * 2 - 1) * jitter;
                const size = Math.random() < 0.65 ? 2 : 3;
                const life = 140 + Math.random() * 220; // ms (shorter)
                const baseSpeed = 40 + Math.random() * 40;
                // Drift slightly opposite to motion and along rear direction
                const vx = (-dx / (dist || 1)) * baseSpeed * 0.5 - fx * baseSpeed * 0.35 + jx;
                const vy = (-dy / (dist || 1)) * baseSpeed * 0.5 - fy * baseSpeed * 0.35 + jy;
                jetTrail.push({ x: px, y: py, vx, vy, size, life, age: 0, color: logoColors[Math.floor(Math.random() * logoColors.length)] });
              }
              lastTrailX = x; lastTrailY = y;
              // Cap particle count
              const cap = 450;
              if (jetTrail.length > cap) jetTrail.splice(0, jetTrail.length - cap);
            }
          }
          // Draw
          if (jetTrail.length) {
            for (let i = 0; i < jetTrail.length; i++) {
              const p = jetTrail[i];
              const t = Math.max(0, Math.min(1, p.age / p.life));
              const alpha = 1 - t * t; // ease-out
              ctx.globalAlpha = alpha;
              ctx.fillStyle = p.color || '#ffffff';
              ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
            }
            ctx.globalAlpha = 1;
          }
        })();

        // Spawn enemies over time if under cap and after first shot
        if (gameStarted && !allBlocksDestroyed) {
          if (enemies.filter(e => e.alive).length < maxEnemies && now >= nextEnemySpawnTs) {
            spawnEnemy();
            nextEnemySpawnTs = now + 1200 + Math.random() * 2000; // 1.2s..3.2s
          }
        }

        // Update enemies (seek and shoot)
        if (enemies.length) {
          // Per-enemy variable engage/disengage window and flee window
          const fireCooldown = 520; // ms - snappier fire cadence
          const enemySize = getEnemySizePx();
          const sepRadius = enemySize * 1.6; // keep some spacing

          function computeAvoidVector(x, y, enterFactor) {
            // Expanded rectangle for smooth avoidance
            const avoidRadius = enemySize * (enterFactor || 1.6);
            const L = logoRect.left - avoidRadius;
            const T = logoRect.top - avoidRadius;
            const R = logoRect.right + avoidRadius;
            const B = logoRect.bottom + avoidRadius;
            if (x < L || x > R || y < T || y > B) return { ax: 0, ay: 0 };
            // Closest point on the core rect (not expanded) to push from
            const cx = Math.max(logoRect.left, Math.min(x, logoRect.right));
            const cy = Math.max(logoRect.top, Math.min(y, logoRect.bottom));
            let vx = x - cx;
            let vy = y - cy;
            let d = Math.hypot(vx, vy);
            if (d === 0) {
              // Inside rect: push out toward nearest edge
              const dl = Math.abs(x - logoRect.left);
              const dr = Math.abs(logoRect.right - x);
              const dtp = Math.abs(y - logoRect.top);
              const db = Math.abs(logoRect.bottom - y);
              if (dl <= dr && dl <= dtp && dl <= db) { vx = -1; vy = 0; }
              else if (dr <= dl && dr <= dtp && dr <= db) { vx = 1; vy = 0; }
              else if (dtp <= dl && dtp <= dr && dtp <= db) { vx = 0; vy = -1; }
              else { vx = 0; vy = 1; }
              d = 1;
            }
            const f = 1 - Math.min(1, d / avoidRadius); // stronger when closer
            return { ax: (vx / d) * f, ay: (vy / d) * f };
          }

          // Geometry helpers for logo detour pathing
          function pointInRect(px, py, r) {
            return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
          }
          function expandLogoRect(margin) {
            return {
              left: logoRect.left - margin,
              top: logoRect.top - margin,
              right: logoRect.right + margin,
              bottom: logoRect.bottom + margin
            };
          }
          function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
            function orient(px, py, qx, qy, rx, ry) {
              const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
              return (v > 0) ? 1 : (v < 0 ? -1 : 0);
            }
            function onSeg(px, py, qx, qy, rx, ry) {
              return Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
            }
            const o1 = orient(ax, ay, bx, by, cx, cy);
            const o2 = orient(ax, ay, bx, by, dx, dy);
            const o3 = orient(cx, cy, dx, dy, ax, ay);
            const o4 = orient(cx, cy, dx, dy, bx, by);
            if (o1 !== o2 && o3 !== o4) return true;
            if (o1 === 0 && onSeg(ax, ay, bx, by, cx, cy)) return true;
            if (o2 === 0 && onSeg(ax, ay, bx, by, dx, dy)) return true;
            if (o3 === 0 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
            if (o4 === 0 && onSeg(cx, cy, dx, dy, bx, by)) return true;
            return false;
          }
          function segmentIntersectsRect(x1, y1, x2, y2, r) {
            // If either point is inside expanded rect, consider it intersecting/blocked
            if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true;
            // Check intersection with each rect edge
            const L = r.left, T = r.top, R = r.right, B = r.bottom;
            if (segmentsIntersect(x1, y1, x2, y2, L, T, R, T)) return true; // top
            if (segmentsIntersect(x1, y1, x2, y2, R, T, R, B)) return true; // right
            if (segmentsIntersect(x1, y1, x2, y2, R, B, L, B)) return true; // bottom
            if (segmentsIntersect(x1, y1, x2, y2, L, B, L, T)) return true; // left
            return false;
          }
          function pickDetourWaypoint(ex, ey, tx, ty, r) {
            const cx = (r.left + r.right) / 2;
            const cy = (r.top + r.bottom) / 2;
            const pad = 6; // small outward pad to keep clear of edge
            const corners = [
              { x: r.left, y: r.top },
              { x: r.right, y: r.top },
              { x: r.right, y: r.bottom },
              { x: r.left, y: r.bottom }
            ].map(c => {
              const vx = c.x - cx, vy = c.y - cy;
              const len = Math.hypot(vx, vy) || 1;
              return { x: c.x + (vx / len) * pad, y: c.y + (vy / len) * pad };
            });
            let best = corners[0];
            let bestCost = Infinity;
            for (let i = 0; i < corners.length; i++) {
              const c = corners[i];
              const cost = Math.hypot(c.x - ex, c.y - ey) + Math.hypot(tx - c.x, ty - c.y);
              if (cost < bestCost) { bestCost = cost; best = c; }
            }
            return best;
          }
          for (let i = enemies.length - 1; i >= 0; i--) {
            const en = enemies[i];
            if (!en.alive) continue;
            // Seek towards pointer
            const dxP = pointerX - en.x;
            const dyP = pointerY - en.y;
            const distPlayer = Math.hypot(dxP, dyP) || 1;
            const speed = en.speed;
            const uxP = dxP / distPlayer;
            const uyP = dyP / distPlayer;
            // Mobile: determine on-screen status and latch once entered
            const wScreen = enemySize;
            const hScreen = enemyAspect > 1 ? (wScreen / enemyAspect) : wScreen;
            const onScreen = (en.x >= wScreen/2 && en.x <= width - wScreen/2 && en.y >= hScreen/2 && en.y <= height - hScreen/2);
            if (isTouchOnlyStar && onScreen && !en.hasEnteredScreen) en.hasEnteredScreen = true;
            // Separation steering: repel from nearby enemies
            let sepX = 0, sepY = 0;
            for (let j = 0; j < enemies.length; j++) {
              if (j === i) continue;
              const other = enemies[j];
              if (!other.alive) continue;
              const ddx = other.x - en.x;
              const ddy = other.y - en.y;
              const d = Math.hypot(ddx, ddy);
              if (d > 0 && d < sepRadius) {
                const f = (sepRadius - d) / sepRadius; // 0..1
                sepX -= (ddx / d) * f;
                sepY -= (ddy / d) * f;
              }
            }
            // Choose target: default to nearest block; prefer player ONLY when in player window
            // After logo-flee, bias toward blocks for a short time
            const biasBlocks = (now <= (en.preferBlocksUntilTs || 0));
            let targetX = 0;
            let targetY = 0;
            let targetRect = null; // for block targets
            let bestDd = Infinity;
            let hasBlockTarget = false;
            for (let k = 0; k < destructibles.length; k++) {
              const dblk = destructibles[k];
              if (!dblk.alive) continue;
              const cx = (dblk.left + dblk.right) / 2;
              const cy = (dblk.top + dblk.bottom) / 2;
              const ddx = cx - en.x;
              const ddy = cy - en.y;
              const dd = ddx * ddx + ddy * ddy;
              if (dd < bestDd) { bestDd = dd; targetX = cx; targetY = cy; targetRect = dblk; hasBlockTarget = true; }
            }
            // If player is within chase distance or within player window, override to player
            // unless we already have a good block target and it's either within practical block range
            // or the logo blocks the direct path to it (we still want to shoot it).
            const playerInWindow = (distPlayer >= en.shootMinPlayer && distPlayer <= en.shootMaxPlayer);
            if (!biasBlocks && (distPlayer <= PLAYER_CHASE_DIST || playerInWindow)) {
              let keepBlock = false;
              if (hasBlockTarget && targetRect) {
                // Quick LOS check against expanded logo rect
                const marginB2 = enemySize * (en.logoAvoidEnter || 1.6);
                const erB2 = expandLogoRect(marginB2);
                const wouldBeBlocked = segmentIntersectsRect(en.x, en.y, targetX, targetY, erB2);
                const approxDistBlock = Math.sqrt(bestDd);
                const withinMaxBlock = approxDistBlock <= (en.shootMaxBlock + SHOOT_HYSTERESIS);
                if (withinMaxBlock || wouldBeBlocked) keepBlock = true;
              }
              if (!keepBlock) { targetX = pointerX; targetY = pointerY; hasBlockTarget = false; }
            }

            // If block target was destroyed, immediately pick a new nearest block
            if (hasBlockTarget && targetRect && !targetRect.alive) {
              bestDd = Infinity;
              hasBlockTarget = false;
              for (let kk = 0; kk < destructibles.length; kk++) {
                const dblk2 = destructibles[kk];
                if (!dblk2.alive) continue;
                const cx2 = (dblk2.left + dblk2.right) / 2;
                const cy2 = (dblk2.top + dblk2.bottom) / 2;
                const ddx2 = cx2 - en.x;
                const ddy2 = cy2 - en.y;
                const dd2 = ddx2 * ddx2 + ddy2 * ddy2;
                if (dd2 < bestDd) { bestDd = dd2; targetX = cx2; targetY = cy2; targetRect = dblk2; hasBlockTarget = true; }
              }
            }

            // On mobile: before entering the screen, force target to screen center to ensure entry
            if (isTouchOnlyStar && !en.hasEnteredScreen) {
              targetX = width * 0.5;
              targetY = height * 0.5;
              hasBlockTarget = false;
            }

            // Compute aim toward block center or player; add detour waypoint if logo blocks the direct path
            let aimX = targetX;
            let aimY = targetY;
            // Check LOS blocking to block target as well
            let blockedToBlock = false;
            if (hasBlockTarget) {
              const marginB = enemySize * (en.logoAvoidEnter || 1.6);
              const erB = expandLogoRect(marginB);
              blockedToBlock = segmentIntersectsRect(en.x, en.y, targetX, targetY, erB);
            }
            if (!hasBlockTarget) {
              const margin = enemySize * (en.logoAvoidEnter || 1.6);
              const er = expandLogoRect(margin);
              const blockedDirect = segmentIntersectsRect(en.x, en.y, targetX, targetY, er);
              if (blockedDirect) {
                if (!en.waypoint || typeof en.waypoint.x !== 'number') {
                  en.waypoint = pickDetourWaypoint(en.x, en.y, targetX, targetY, er);
                }
              } else {
                en.waypoint = null;
              }
              if (en.waypoint) {
                // If close to waypoint or path to target clears up, drop it
                const dwp = Math.hypot((en.waypoint.x - en.x), (en.waypoint.y - en.y));
                const cleared = !segmentIntersectsRect(en.x, en.y, targetX, targetY, er);
                if (dwp < Math.max(8, margin * 0.6) || cleared) {
                  en.waypoint = null;
                } else {
                  // Aim to waypoint to route around the logo
                  aimX = en.waypoint.x;
                  aimY = en.waypoint.y;
                }
              }
            }
            let distEngage = 0;
            if (hasBlockTarget && targetRect) {
              const ax = Math.max(targetRect.left, Math.min(en.x, targetRect.right));
              const ay = Math.max(targetRect.top, Math.min(en.y, targetRect.bottom));
              distEngage = Math.hypot(ax - en.x, ay - en.y);
            } else {
              distEngage = Math.hypot(targetX - en.x, targetY - en.y);
            }
            const dxT = aimX - en.x;
            const dyT = aimY - en.y;
            const distTarget = Math.hypot(dxT, dyT) || 1;
            const uxT = dxT / distTarget;
            const uyT = dyT / distTarget;

            // State transitions using per-enemy windows
            // Force flee if too close to the logo boundary, except when pursuing a block target
            // (let them operate near the logo edge to shoot blocks).
            const nearLogo = (en.x > logoRect.left - enemySize * en.logoAvoidEnter && en.x < logoRect.right + enemySize * en.logoAvoidEnter && en.y > logoRect.top - enemySize * en.logoAvoidEnter && en.y < logoRect.bottom + enemySize * en.logoAvoidEnter);
            if (nearLogo && !hasBlockTarget) {
              // If already fleeing the player, keep player flee cause and handle combined repulsion
              if (!(en.mode === 'flee' && en.fleeCause === 'player')) {
                en.mode = 'flee';
                // Set a stronger target clear distance using exit factor with extra padding
                en.fleeCause = 'logo';
                en.logoFleeUntil = enemySize * (en.logoAvoidExit + 0.6); // dynamic flee distance
                // After a logo-flee, bias target selection to blocks briefly
                en.preferBlocksUntilTs = now + 1400; // ms
              }
            }
            if (en.mode === 'seek') {
              if (distPlayer <= Math.max(20, en.fleeEnter)) {
                en.mode = 'flee';
                en.fleeCause = 'player';
              } else if (((!hasBlockTarget && distEngage >= en.shootMinPlayer && distEngage <= en.shootMaxPlayer) ||
                          (hasBlockTarget && distEngage <= en.shootMaxBlock) ||
                          (hasBlockTarget && blockedToBlock && distEngage <= en.shootMaxBlock + SHOOT_HYSTERESIS * 2)) &&
                         (!isTouchOnlyStar || onScreen)) {
                en.mode = 'engage';
              }
              } else if (en.mode === 'engage') {
              // Mobile: do not allow engage while off-screen
              if (isTouchOnlyStar && !onScreen) {
                en.mode = 'seek';
              } else if (distPlayer <= Math.max(20, en.fleeEnter)) {
                en.mode = 'flee';
                en.fleeCause = 'player';
                } else if ((!hasBlockTarget && (distEngage < en.shootMinPlayer - SHOOT_HYSTERESIS || distEngage > en.shootMaxPlayer + SHOOT_HYSTERESIS)) ||
                           (hasBlockTarget && !blockedToBlock && (distEngage < en.shootMinBlock - SHOOT_HYSTERESIS || distEngage > en.shootMaxBlock + SHOOT_HYSTERESIS)) ||
                           (hasBlockTarget && blockedToBlock && (distEngage > en.shootMaxBlock + SHOOT_HYSTERESIS * 2))) {
                en.mode = 'seek';
                // Re-roll windows when returning to seek
          const minRP2 = SHOOT_PLAYER_MIN_RANGE_MIN + Math.random() * (SHOOT_PLAYER_MIN_RANGE_MAX - SHOOT_PLAYER_MIN_RANGE_MIN);
                const maxMinP2 = Math.max(minRP2 + 40, SHOOT_PLAYER_MAX_RANGE_MIN);
                en.shootMinPlayer = minRP2;
                en.shootMaxPlayer = maxMinP2 + Math.random() * (SHOOT_PLAYER_MAX_RANGE_MAX - maxMinP2);
          const minRB2 = SHOOT_BLOCK_MIN_RANGE_MIN + Math.random() * (SHOOT_BLOCK_MIN_RANGE_MAX - SHOOT_BLOCK_MIN_RANGE_MIN);
                const maxMinB2 = Math.max(minRB2 + 30, SHOOT_BLOCK_MAX_RANGE_MIN);
                en.shootMinBlock = minRB2;
                en.shootMaxBlock = maxMinB2 + Math.random() * (SHOOT_BLOCK_MAX_RANGE_MAX - maxMinB2);
                const fleeEnter2 = FLEE_ENTER_MIN + Math.random() * (FLEE_ENTER_MAX - FLEE_ENTER_MIN);
                const fleeExitMin2 = Math.max(fleeEnter2 + 60, FLEE_EXIT_MIN);
                en.fleeEnter = fleeEnter2;
                en.fleeExit = fleeExitMin2 + Math.random() * (FLEE_EXIT_MAX - fleeExitMin2);
              }
            } else if (en.mode === 'flee') {
              if (en.fleeCause === 'logo') {
                // Exit flee when safely outside the logo with additional per-enemy padding (logoFleeUntil)
                const pad = Math.max(enemySize * 0.6, en.logoFleeUntil || enemySize * en.logoAvoidExit);
                const outLeft = en.x < logoRect.left - pad;
                const outRight = en.x > logoRect.right + pad;
                const outTop = en.y < logoRect.top - pad;
                const outBottom = en.y > logoRect.bottom + pad;
                if (outLeft || outRight || outTop || outBottom) {
                  // Immediately re-target nearest block and re-enter engage if in block window
                  en.mode = 'seek';
                  en.fleeCause = null;
                  // Re-roll windows when returning to seek
                  const minRP2 = SHOOT_PLAYER_MIN_RANGE_MIN + Math.random() * (SHOOT_PLAYER_MIN_RANGE_MAX - SHOOT_PLAYER_MIN_RANGE_MIN);
                  const maxMinP2 = Math.max(minRP2 + 40, SHOOT_PLAYER_MAX_RANGE_MIN);
                  en.shootMinPlayer = minRP2;
                  en.shootMaxPlayer = maxMinP2 + Math.random() * (SHOOT_PLAYER_MAX_RANGE_MAX - maxMinP2);
                  const minRB2 = SHOOT_BLOCK_MIN_RANGE_MIN + Math.random() * (SHOOT_BLOCK_MIN_RANGE_MAX - SHOOT_BLOCK_MIN_RANGE_MIN);
                  const maxMinB2 = Math.max(minRB2 + 30, SHOOT_BLOCK_MAX_RANGE_MIN);
                  en.shootMinBlock = minRB2;
                  en.shootMaxBlock = maxMinB2 + Math.random() * (SHOOT_BLOCK_MAX_RANGE_MAX - maxMinB2);
                  const fleeEnter2 = FLEE_ENTER_MIN + Math.random() * (FLEE_ENTER_MAX - FLEE_ENTER_MIN);
                  const fleeExitMin2 = Math.max(fleeEnter2 + 60, FLEE_EXIT_MIN);
                  en.fleeEnter = fleeEnter2;
                  en.fleeExit = fleeExitMin2 + Math.random() * (FLEE_EXIT_MAX - fleeExitMin2);
                  // Bias immediate re-engage to blocks
                  en.preferBlocksUntilTs = now + 1400;
                }
              } else {
                if (distPlayer >= en.fleeExit) {
                  en.mode = 'seek';
                  // Re-roll windows when returning to seek
                  const minRP2 = SHOOT_PLAYER_MIN_RANGE_MIN + Math.random() * (SHOOT_PLAYER_MIN_RANGE_MAX - SHOOT_PLAYER_MIN_RANGE_MIN);
                  const maxMinP2 = Math.max(minRP2 + 40, SHOOT_PLAYER_MAX_RANGE_MIN);
                  en.shootMinPlayer = minRP2;
                  en.shootMaxPlayer = maxMinP2 + Math.random() * (SHOOT_PLAYER_MAX_RANGE_MAX - maxMinP2);
                  const minRB2 = SHOOT_BLOCK_MIN_RANGE_MIN + Math.random() * (SHOOT_BLOCK_MIN_RANGE_MAX - SHOOT_BLOCK_MIN_RANGE_MIN);
                  const maxMinB2 = Math.max(minRB2 + 30, SHOOT_BLOCK_MAX_RANGE_MIN);
                  en.shootMinBlock = minRB2;
                  en.shootMaxBlock = maxMinB2 + Math.random() * (SHOOT_BLOCK_MAX_RANGE_MAX - maxMinB2);
                  const fleeEnter2 = FLEE_ENTER_MIN + Math.random() * (FLEE_ENTER_MAX - FLEE_ENTER_MIN);
                  const fleeExitMin2 = Math.max(fleeEnter2 + 60, FLEE_EXIT_MIN);
                  en.fleeEnter = fleeEnter2;
                  en.fleeExit = fleeExitMin2 + Math.random() * (FLEE_EXIT_MAX - fleeExitMin2);
                }
              }
            }

            // Rotation depends on state: seek/engage face target; flee faces away (from player or logo)
            if (en.mode === 'flee') {
              if (en.fleeCause === 'logo') {
                const axl = Math.max(logoRect.left, Math.min(en.x, logoRect.right));
                const ayl = Math.max(logoRect.top, Math.min(en.y, logoRect.bottom));
                const fx = en.x - axl;
                const fy = en.y - ayl;
                en.angleDeg = Math.atan2(fy, fx) * 180 / Math.PI + 90;
              } else {
                // Face along the actual flee velocity (which may be routed around the logo)
                const angX = (en.vx !== 0 || en.vy !== 0) ? en.vx : -uxP;
                const angY = (en.vx !== 0 || en.vy !== 0) ? en.vy : -uyP;
                en.angleDeg = Math.atan2(angY, angX) * 180 / Math.PI + 90;
              }
            } else {
              en.angleDeg = Math.atan2(uyT, uxT) * 180 / Math.PI + 90;
            }

            // Obstacle avoidance from logo with per-enemy radius
            const av = computeAvoidVector(en.x, en.y, en.logoAvoidEnter);

            if (en.mode === 'seek') {
              // Seek toward chosen target (player in window OR nearest block)
              en.vx = uxT * speed;
              en.vy = uyT * speed;
              // Apply separation steering and clamp to max speed
              en.vx += (sepX + av.ax * 1.4) * speed;
              en.vy += (sepY + av.ay * 1.4) * speed;
              // If too close to the logo boundary based on per-enemy radius, bias path tangentially around it
              const nearLogo = (en.x > logoRect.left - enemySize * en.logoAvoidEnter && en.x < logoRect.right + enemySize * en.logoAvoidEnter && en.y > logoRect.top - enemySize * en.logoAvoidEnter && en.y < logoRect.bottom + enemySize * en.logoAvoidEnter);
              if (nearLogo && (av.ax !== 0 || av.ay !== 0)) {
                // Tangential vector (rotate avoidance by 90deg) to flow around edges
                const tanX = -av.ay;
                const tanY = av.ax;
                en.vx += tanX * speed * 0.6;
                en.vy += tanY * speed * 0.6;
              }
              // Anti-stall near the logo: if velocity small and near logo edge, bias tangentially around it
              let vmagSeek = Math.hypot(en.vx, en.vy);
              const nearLogoEdge = (en.x > logoRect.left - enemySize * en.logoAvoidEnter && en.x < logoRect.right + enemySize * en.logoAvoidEnter && en.y > logoRect.top - enemySize * en.logoAvoidEnter && en.y < logoRect.bottom + enemySize * en.logoAvoidEnter);
              if (vmagSeek < speed * 0.12) {
                if (nearLogoEdge && (av.ax !== 0 || av.ay !== 0)) {
                  const tanX2 = -av.ay;
                  const tanY2 = av.ax;
                  en.vx += tanX2 * speed * 0.7;
                  en.vy += tanY2 * speed * 0.7;
                } else {
                  en.vx += uxT * speed * 0.6;
                  en.vy += uyT * speed * 0.6;
                }
                vmagSeek = Math.hypot(en.vx, en.vy);
              }
              const vmag = Math.hypot(en.vx, en.vy);
              if (vmag > speed && vmag > 0) { en.vx = en.vx / vmag * speed; en.vy = en.vy / vmag * speed; }
              en.x += en.vx * dt;
              en.y += en.vy * dt;
            } else if (en.mode === 'engage') {
              // If no longer in range of current target, immediately resume seeking.
              // If targeting a block but LOS is blocked by the logo, allow engage to persist
              // within a wider max window and without enforcing the minimum distance.
              const inPlayerRangeNow = (!hasBlockTarget && distEngage >= en.shootMinPlayer && distEngage <= en.shootMaxPlayer);
              const inBlockWiderRangeNow = hasBlockTarget && (
                blockedToBlock
                  ? (distEngage <= (en.shootMaxBlock + SHOOT_HYSTERESIS * 2))
                  : (distEngage >= en.shootMinBlock && distEngage <= en.shootMaxBlock)
              );
              if (!(inPlayerRangeNow || inBlockWiderRangeNow)) {
                en.mode = 'seek';
              } else {
              // Hold position while engaging, but still separate to avoid overlap and avoid logo
              en.vx = (sepX + av.ax * 0.8) * speed * 0.6;
              en.vy = (sepY + av.ay * 0.8) * speed * 0.6;
              // If too close to logo and velocity nearly zero, nudge tangentially to prevent sticking
              const vmagHold = Math.hypot(en.vx, en.vy);
              if (vmagHold < speed * 0.08 && (av.ax !== 0 || av.ay !== 0)) {
                const tx2 = -av.ay;
                const ty2 = av.ax;
                en.vx += tx2 * speed * 0.5;
                en.vy += ty2 * speed * 0.5;
              }
                const vmag2 = Math.hypot(en.vx, en.vy);
                const maxEngageSpeed = speed * 0.8;
                if (vmag2 > maxEngageSpeed && vmag2 > 0) { en.vx = en.vx / vmag2 * maxEngageSpeed; en.vy = en.vy / vmag2 * maxEngageSpeed; }
                en.x += en.vx * dt;
                en.y += en.vy * dt;
                if (now - en.lastShotTs > fireCooldown && (!isTouchOnlyStar || onScreen)) {
                  const angleDeg = Math.atan2(dyT, dxT) * 180 / Math.PI + 90;
                  spawnProjectile(en.x, en.y, angleDeg, { from: 'enemy', speed: 540, size: 3 });
                  en.lastShotTs = now;
                }
              }
              } else if (en.mode === 'flee') {
              // Move away from the cause: player or logo
              if (en.fleeCause === 'logo') {
                // Compute vector away from nearest point on logo rect
                const axl = Math.max(logoRect.left, Math.min(en.x, logoRect.right));
                const ayl = Math.max(logoRect.top, Math.min(en.y, logoRect.bottom));
                let fx = en.x - axl;
                let fy = en.y - ayl;
                let d = Math.hypot(fx, fy);
                if (d === 0) { fx = (Math.random() * 2 - 1) || 1; fy = (Math.random() * 2 - 1) || 0; d = Math.hypot(fx, fy); }
                fx /= d; fy /= d;
                // Strong outward move; avoid logo-avoidance tangential bias here
                const fleeBoost = 1.6; // increase escape speed when near logo
                en.vx = fx * speed * fleeBoost;
                en.vy = fy * speed * fleeBoost;
                // Keep separation but skip logo avoidance blend
                en.vx += (sepX) * speed;
                en.vy += (sepY) * speed;
                // Anti-stall: extra outward nudge if slowed
                let vmagFlee = Math.hypot(en.vx, en.vy);
                if (vmagFlee < speed * 0.12) {
                  en.vx += fx * speed * 0.6;
                  en.vy += fy * speed * 0.6;
                }
              } else {
                // If we've cleared both the player's flee-exit distance AND the logo's boundary sufficiently, stop fleeing and resume seeking blocks
                const padPlayerFlee = enemySize * (en.logoAvoidExit + 0.8);
                const outLeftP = en.x < logoRect.left - padPlayerFlee;
                const outRightP = en.x > logoRect.right + padPlayerFlee;
                const outTopP = en.y < logoRect.top - padPlayerFlee;
                const outBottomP = en.y > logoRect.bottom + padPlayerFlee;
                if ((outLeftP || outRightP || outTopP || outBottomP) && distPlayer >= en.fleeExit) {
                  en.mode = 'seek';
                  en.fleeCause = null;
                  // Re-roll windows when returning to seek
                  const minRP2 = SHOOT_PLAYER_MIN_RANGE_MIN + Math.random() * (SHOOT_PLAYER_MIN_RANGE_MAX - SHOOT_PLAYER_MIN_RANGE_MIN);
                  const maxMinP2 = Math.max(minRP2 + 40, SHOOT_PLAYER_MAX_RANGE_MIN);
                  en.shootMinPlayer = minRP2;
                  en.shootMaxPlayer = maxMinP2 + Math.random() * (SHOOT_PLAYER_MAX_RANGE_MAX - maxMinP2);
                  const minRB2 = SHOOT_BLOCK_MIN_RANGE_MIN + Math.random() * (SHOOT_BLOCK_MIN_RANGE_MAX - SHOOT_BLOCK_MIN_RANGE_MIN);
                  const maxMinB2 = Math.max(minRB2 + 30, SHOOT_BLOCK_MAX_RANGE_MIN);
                  en.shootMinBlock = minRB2;
                  en.shootMaxBlock = maxMinB2 + Math.random() * (SHOOT_BLOCK_MAX_RANGE_MAX - maxMinB2);
                  const fleeEnter2 = FLEE_ENTER_MIN + Math.random() * (FLEE_ENTER_MAX - FLEE_ENTER_MIN);
                  const fleeExitMin2 = Math.max(fleeEnter2 + 60, FLEE_EXIT_MIN);
                  en.fleeEnter = fleeEnter2;
                  en.fleeExit = fleeExitMin2 + Math.random() * (FLEE_EXIT_MAX - fleeExitMin2);
                  // Prioritize blocks briefly and avoid immediate re-flee to player
                  en.preferBlocksUntilTs = now + 1500;
                  en.fleeImmunityUntilTs = now + 1000;
                  continue;
                }
                // Flee from player while avoiding the logo using a stable repulsion blend
                // Away from player (unit)
                const prx = -uxP;
                const pry = -uyP;
                // Away from logo (unit from nearest logo point)
                const axl = Math.max(logoRect.left, Math.min(en.x, logoRect.right));
                const ayl = Math.max(logoRect.top, Math.min(en.y, logoRect.bottom));
                let lrx = en.x - axl;
                let lry = en.y - ayl;
                let lrd = Math.hypot(lrx, lry);
                if (lrd === 0) { lrx = 1; lry = 0; lrd = 1; }
                lrx /= lrd; lry /= lrd;
                const avoidRadiusPx = enemySize * (en.logoAvoidEnter || 1.6);
                const distToLogo = lrd;
                // Strong logo weight when inside radius, moderate near, mild far
                const logoWeight = (distToLogo < avoidRadiusPx) ? 2.2 : (distToLogo < avoidRadiusPx * 1.8 ? 0.9 : 0.18);
                let dirX = prx + lrx * logoWeight;
                let dirY = pry + lry * logoWeight;
                let dlen = Math.hypot(dirX, dirY);
                if (dlen === 0) { dirX = prx; dirY = pry; dlen = Math.hypot(dirX, dirY) || 1; }
                dirX /= dlen; dirY /= dlen;
                // If inside radius, bias completely outward from logo
                if (distToLogo < avoidRadiusPx * 1.02) {
                  dirX = lrx; dirY = lry;
                }
                // Dynamic flee speed scales up when very close to player
                const dpNow = Math.hypot(en.x - pointerX, en.y - pointerY);
                const fleeScale = dpNow < enemySize * 2 ? 1.35 : 1.0;
                en.vx = dirX * speed * fleeScale;
                en.vy = dirY * speed * fleeScale;
                // Small separation only (skip logo avoidance force to prevent oscillation)
                en.vx += sepX * speed * 0.6;
                en.vy += sepY * speed * 0.6;
                // Anti-stall
                let vmagFlee = Math.hypot(en.vx, en.vy);
                const fs = speed * fleeScale;
                if (vmagFlee < fs * 0.2) {
                  en.vx += dirX * fs * 0.6;
                  en.vy += dirY * fs * 0.6;
                }
              }
              // Clamp and integrate
              let vmag3 = Math.hypot(en.vx, en.vy);
              const fleeMax = (en.fleeCause === 'logo') ? speed * 1.2 : speed * 1.35;
              if (vmag3 > fleeMax && vmag3 > 0) { en.vx = (en.vx / vmag3) * fleeMax; en.vy = (en.vy / vmag3) * fleeMax; }
              en.x += en.vx * dt;
              en.y += en.vy * dt;
            }

            // Hard constraint: keep outside the core logo rect
            const marginLogo = enemySize * en.logoAvoidEnter;
            const insideLogo = (en.x > logoRect.left - marginLogo && en.x < logoRect.right + marginLogo && en.y > logoRect.top - marginLogo && en.y < logoRect.bottom + marginLogo);
            if (insideLogo) {
              // Push to nearest edge plus a small margin
              const dl = Math.abs(en.x - logoRect.left);
              const dr = Math.abs(logoRect.right - en.x);
              const dtp = Math.abs(en.y - logoRect.top);
              const db = Math.abs(logoRect.bottom - en.y);
              const margin = marginLogo;
              if (dl <= dr && dl <= dtp && dl <= db) en.x = logoRect.left - margin;
              else if (dr <= dl && dr <= dtp && dr <= db) en.x = logoRect.right + margin;
              else if (dtp <= dl && dtp <= dr && dtp <= db) en.y = logoRect.top - margin;
              else en.y = logoRect.bottom + margin;
            }

            // Hard constraint: keep a minimum distance from the player pointer at all times
            {
              const keepout = Math.max(36, enemySize * 1.2);
              const dxp = en.x - pointerX;
              const dyp = en.y - pointerY;
              const dp = Math.hypot(dxp, dyp);
              if (dp > 0 && dp < keepout) {
                const ux = dxp / dp;
                const uy = dyp / dp;
                en.x = pointerX + ux * keepout;
                en.y = pointerY + uy * keepout;
                // Force flee-from-player and reinforce outward velocity (cannot stall at cursor)
                en.mode = 'flee';
                en.fleeCause = 'player';
                const minFleeSpeed = Math.max(en.speed * 1.4, 160);
                en.vx = ux * minFleeSpeed;
                en.vy = uy * minFleeSpeed;
              }
            }
            // Mobile: once inside, never leave the display area
            if (isTouchOnlyStar && en.hasEnteredScreen) {
              en.x = Math.max(wScreen/2, Math.min(width - wScreen/2, en.x));
              en.y = Math.max(hScreen/2, Math.min(height - hScreen/2, en.y));
            }
          }

          // Positional correction as a safety net (iterate twice)
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < enemies.length; i++) {
              const a = enemies[i];
              if (!a.alive) continue;
              for (let j = i + 1; j < enemies.length; j++) {
                const b = enemies[j];
                if (!b.alive) continue;
                const dx2 = b.x - a.x;
                const dy2 = b.y - a.y;
                const dist2 = Math.hypot(dx2, dy2);
                const minDist = Math.max(enemySize, 1) * 1.1;
                if (dist2 > 0 && dist2 < minDist) {
                  const overlap2 = (minDist - dist2) * 0.5;
                  const ux2 = dx2 / dist2;
                  const uy2 = dy2 / dist2;
                  a.x -= ux2 * overlap2;
                  a.y -= uy2 * overlap2;
                  b.x += ux2 * overlap2;
                  b.y += uy2 * overlap2;
                } else if (dist2 === 0) {
                  const n2 = (Math.random() * 2 - 1) * 0.5;
                  a.x -= n2; a.y += n2;
                  b.x += n2; b.y -= n2;
                }
              }
            }
          }

          // Mobile final clamp: once an enemy has entered the viewport, never allow leaving it
          if (isTouchOnlyStar) {
            const wScreen2 = enemySize;
            const hScreen2 = enemyAspect > 1 ? (wScreen2 / enemyAspect) : wScreen2;
            for (let i = 0; i < enemies.length; i++) {
              const en = enemies[i];
              if (!en.alive || !en.hasEnteredScreen) continue;
              en.x = Math.max(wScreen2/2, Math.min(width - wScreen2/2, en.x));
              en.y = Math.max(hScreen2/2, Math.min(height - hScreen2/2, en.y));
            }
          }

          // Draw enemies on top of stars, below projectiles
          for (let i = 0; i < enemies.length; i++) {
            const en = enemies[i];
            if (!en.alive) continue;
            const w = enemySize;
            const h = enemyAspect > 1 ? (w / enemyAspect) : w;
            ctx.save();
            ctx.translate(en.x, en.y);
            ctx.rotate((en.angleDeg || 0) * Math.PI / 180);
            const imgToDraw = en.spriteImage?.complete && en.spriteImage.naturalWidth > 0 ? en.spriteImage : enemyImg;
            if (imgToDraw?.complete && imgToDraw.naturalWidth > 0) {
              ctx.drawImage(imgToDraw, -w/2, -h/2, w, h);
            } else {
              // Fallback: simple diamond
              ctx.fillStyle = en.color || '#ffffff';
              ctx.beginPath();
              ctx.moveTo(0, -h/2);
              ctx.lineTo(w/2, 0);
              ctx.lineTo(0, h/2);
              ctx.lineTo(-w/2, 0);
              ctx.closePath();
              ctx.fill();
            }
            ctx.restore();
          }
        }

        // Update and draw projectiles on top
        if (projectiles.length) {
          for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            // Swept collision: use center positions before/after movement
            const x0 = p.x + p.size * 0.5;
            const y0 = p.y + p.size * 0.5;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const x1 = p.x + p.size * 0.5;
            const y1 = p.y + p.size * 0.5;

            // Allow bullets to pass through visible letter pixels
            let hit = false;

            // Local geometry helpers (block-scoped to avoid conflicts)
            function pointInRect(px, py, r) { return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; }
            function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
              function orient(px, py, qx, qy, rx, ry) {
                const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
                return (v > 0) ? 1 : (v < 0 ? -1 : 0);
              }
              function onSeg(px, py, qx, qy, rx, ry) {
                return Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
              }
              const o1 = orient(ax, ay, bx, by, cx, cy);
              const o2 = orient(ax, ay, bx, by, dx, dy);
              const o3 = orient(cx, cy, dx, dy, ax, ay);
              const o4 = orient(cx, cy, dx, dy, bx, by);
              if (o1 !== o2 && o3 !== o4) return true;
              if (o1 === 0 && onSeg(ax, ay, bx, by, cx, cy)) return true;
              if (o2 === 0 && onSeg(ax, ay, bx, by, dx, dy)) return true;
              if (o3 === 0 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
              if (o4 === 0 && onSeg(cx, cy, dx, dy, bx, by)) return true;
              return false;
            }
            function segmentIntersectsRect(sx0, sy0, sx1, sy1, r) {
              if (pointInRect(sx0, sy0, r) || pointInRect(sx1, sy1, r)) return true;
              const L = r.left, T = r.top, R = r.right, B = r.bottom;
              if (segmentsIntersect(sx0, sy0, sx1, sy1, L, T, R, T)) return true; // top
              if (segmentsIntersect(sx0, sy0, sx1, sy1, R, T, R, B)) return true; // right
              if (segmentsIntersect(sx0, sy0, sx1, sy1, R, B, L, B)) return true; // bottom
              if (segmentsIntersect(sx0, sy0, sx1, sy1, L, B, L, T)) return true; // left
              return false;
            }
            // Distance squared from point to segment helper
            function distSqPointToSegment(px, py, xA, yA, xB, yB) {
              const vx = xB - xA;
              const vy = yB - yA;
              const wx = px - xA;
              const wy = py - yA;
              const vv = vx * vx + vy * vy;
              let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0;
              if (t < 0) t = 0; else if (t > 1) t = 1;
              const cx = xA + t * vx;
              const cy = yA + t * vy;
              const dx = px - cx;
              const dy = py - cy;
              return dx * dx + dy * dy;
            }

            // Collision with destructible DOM pixels (both player and enemy bullets)
            if (!hit && destructibles.length) {
              for (let k = 0; k < destructibles.length; k++) {
                const d = destructibles[k];
                if (!d.alive) continue;
                // Expand rect by half bullet size to account for bullet thickness
                const expand = p.size * 0.5;
                const r = { left: d.left - expand, top: d.top - expand, right: d.right + expand, bottom: d.bottom + expand };
                if (segmentIntersectsRect(x0, y0, x1, y1, r)) {
                  d.alive = false;
                  d.el.classList.add('destroyed');
                  // Spawn debris for destroyed guide pixel
                  const dw = Math.max(2, d.right - d.left);
                  const dh = Math.max(2, d.bottom - d.top);
                  const cx = d.left + dw / 2;
                  const cy = d.top + dh / 2;
                  spawnEnemyDebris(cx, cy, dw, dh);
                  hit = true;
                  // If that was the last alive block, end the wave
                  const anyLeft = destructibles.some(x => x.alive);
                  if (!anyLeft && !allBlocksDestroyed) {
                    allBlocksDestroyed = true;
                    explodeAllEnemiesAndStop();
                    setLettersWhite(true);
            // Change each star to a random logo color on game over
            setStarfieldColorsRandomLogo();
                    setGameOver(true);
                  }
                  break;
                }
              }
            }

            // Collision with player cursor (only enemy bullets)
            if (!hit && p.from === 'enemy') {
              const jetRadius = Math.max(6, getJetSizePxFromDom() * 0.58);
              const expand = p.size * 0.5;
              const r2 = (jetRadius + expand) * (jetRadius + expand);
              const d2 = distSqPointToSegment(pointerX, pointerY, x0, y0, x1, y1);
              if (d2 <= r2) {
                // Notify cursor to flash
                try {
                  window.dispatchEvent(new CustomEvent('cursor:flash', { detail: { durationMs: 140 } }));
                } catch (_) { /* noop */ }
                hit = true;
              }
            }

            // Collision with enemies (only player bullets)
            if (!hit && p.from !== 'enemy' && enemies.length) {
              const enemySize = getEnemySizePx();
          for (let k = 0; k < enemies.length; k++) {
                const en = enemies[k];
                if (!en.alive) continue;
                const w = enemySize;
                const h = enemyAspect > 1 ? (w / enemyAspect) : w;
                // Enemy rect expanded by half bullet size
                const r = { left: en.x - w/2 - p.size*0.5, top: en.y - h/2 - p.size*0.5, right: en.x + w/2 + p.size*0.5, bottom: en.y + h/2 + p.size*0.5 };
                if (segmentIntersectsRect(x0, y0, x1, y1, r)) {
                  en.alive = false;
                  spawnEnemyDebris(en.x, en.y, w, h);
                  incKillUI();
                  hit = true;
                  break;
                }
              }
            }

            if (hit ||
              p.x < -p.despawnMargin || p.x > width + p.despawnMargin ||
              p.y < -p.despawnMargin || p.y > height + p.despawnMargin
            ) {
              projectiles.splice(i, 1);
            }
          }
          ctx.globalAlpha = 1;
          for (let i = 0; i < projectiles.length; i++) {
            const p = projectiles[i];
            ctx.fillStyle = p.color || '#ffff00';
            ctx.fillRect(p.x, p.y, p.size, p.size);
          }
          ctx.globalAlpha = 1;
        }

        // Update and draw enemy debris on top
        if (enemyDebris.length) {
          for (let i = enemyDebris.length - 1; i >= 0; i--) {
            const d = enemyDebris[i];
            d.age += (dt * 1000);
            const t = d.age / d.life;
            if (t >= 1) { enemyDebris.splice(i, 1); continue; }
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            // Light drag
            d.vx *= 0.994; d.vy *= 0.994;
          }
          for (let i = 0; i < enemyDebris.length; i++) {
            const d = enemyDebris[i];
            const t = d.age / d.life;
            const alpha = 1 - t;
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.fillStyle = d.color || '#ffffff';
            ctx.fillRect(d.x - d.size/2, d.y - d.size/2, d.size, d.size);
          }
          ctx.globalAlpha = 1;
        }

        // Reduced-motion idle is a static starfield; explicit gameplay still runs.
        if (!prefersReducedMotion || gameStarted) scheduleFrame();
      }

      // Debounced resize to handle rapid resizes and orientation changes
      let resizeRaf = 0;
      function onResize() {
        if (resizeRaf) window.itchsonAnimation.cancel(resizeRaf);
        resizeRaf = window.itchsonAnimation.request(resize);
        // Also update rects after resize settles
        window.itchsonAnimation.request(() => { updateDestructibleRects(); updateLetterBlockRects(); updateLogoRect(); scheduleFrame(); });
      }
      window.addEventListener('resize', onResize);
      window.matchMedia('(resolution: 2dppx)').addEventListener?.('change', onResize);
      window.matchMedia('(orientation: portrait)').addEventListener?.('change', onResize);
      // Listen for shoot events dispatched by the cursor controller
      window.addEventListener('jet:shoot', (ev) => {
        if (window.itchsonAnimation.paused) return;
        const d = ev.detail || {};
        const sx = (typeof d.spawnX === 'number') ? d.spawnX : d.x;
        const sy = (typeof d.spawnY === 'number') ? d.spawnY : d.y;
        if (typeof sx === 'number' && typeof sy === 'number' && typeof d.angleDeg === 'number') {
          spawnProjectile(sx, sy, d.angleDeg, { from: 'player' });
        }
      });
      // Start the game on first background click
      window.addEventListener('game:start', () => {
        if (!gameStarted) {
          gameStarted = true;
          nextEnemySpawnTs = gameTime() + 800;
          showKillUI();
          scheduleFrame();
        }
      });
      // Listen for jiggle events from letter clicks
      window.addEventListener('star:jiggle', beginStarJiggle);
      window.addEventListener('enemies:reset', () => {
        scheduleFrame();
        for (let i = 0; i < enemies.length; i++) enemies[i].alive = false;
        enemies.length = 0;
        enemyDebris.length = 0; // clear debris
        playerHasFired = false;
        gameStarted = false; // require new background click to start
        nextEnemySpawnTs = Number.POSITIVE_INFINITY;
        killCount = 0;
        updateMaxEnemiesByKills();
        hideKillUI();
        // Clear shutdown state and restore letter colors
        allBlocksDestroyed = false;
        setLettersWhite(false);
        // Reset starfield colors back to white
        setStarfieldColorsWhite();
        setGameOver(false);
        // Also clear any in-flight projectiles to avoid stray hits after reset
        projectiles.length = 0;
        // Tell cursor controller to return to orbit mode
        try { window.dispatchEvent(new CustomEvent('cursor:mode', { detail: { mode: 'orbit' } })); } catch (_) {}
        // Suspend trail until orbit places the jet, then resume
        try { window.dispatchEvent(new CustomEvent('trail:suspend')); } catch(_) {}
      });

      rebuildDestructibles();
      rebuildLetterBlocks();
      resize();
      initCameraLayers();
      // Fonts can change collision geometry after the first layout.
      document.fonts?.ready.then(() => { updateDestructibleRects(); updateLetterBlockRects(); updateLogoRect(); scheduleFrame(); });
      window.addEventListener('game:pause', () => { pausedAt = performance.now(); });
      window.addEventListener('game:resume', () => {
        if (pausedAt !== null) {
          pausedDuration += performance.now() - pausedAt;
          pausedAt = null;
        }
        lastFrameTs = gameTime();
        resetLast();
      });
      scheduleFrame();
    })();
