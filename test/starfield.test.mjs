import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { PROJECT_ROOT } from '../scripts/build.mjs';

const sources = await Promise.all(['runtime', 'starfield'].map(async (name) => ({
  name, source: await readFile(path.join(PROJECT_ROOT, 'site', 'assets', 'js', `${name}.js`), 'utf8'),
})));

// Run the real frame queue and game against a deterministic canvas/clock. Compare
// rendered gameplay, rather than reaching into the game's private timer state.
function browser({ hidden = false } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  const classList = () => {
    const classes = new Set();
    return {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    };
  };
  const rectangle = { left: 380, top: 280, right: 420, bottom: 320 };
  const element = () => ({ style: {}, classList: classList(), getBoundingClientRect: () => rectangle });
  let draws = [];
  const ctx = {
    globalAlpha: 1, fillStyle: '',
    clearRect() { draws = []; }, setTransform() {},
    fillRect(...args) { draws.push(['fill', this.fillStyle, this.globalAlpha, ...args]); },
    save() {}, restore() {}, translate(...args) { draws.push(['translate', ...args]); }, rotate() {},
    drawImage(img, ...args) { draws.push(['ship', img.src, ...args]); },
  };
  const canvas = { style: {}, getContext: () => ctx };
  const logo = element();
  const guide = element();
  const elements = { starfield: canvas, killCounter: element(), killText: element() };
  Object.assign(document, {
    hidden, body: element(), documentElement: element(),
    getElementById: (id) => elements[id] ?? null,
    querySelector: (selector) => selector === '.logo-container' ? logo : null,
    querySelectorAll: (selector) => selector === '.logo-container .pixel.invisible' ? [guide] : [],
  });
  Object.assign(window, {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
  });
  let time = 0;
  let sequence = 0;
  let seed = 123456;
  const frames = new Map();
  const errors = [];
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const context = vm.createContext({
    window, document, CustomEvent, Math: math,
    performance: { now: () => time },
    console: { error: (...args) => errors.push(args) },
    Image: class { complete = true; naturalWidth = 32; },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  for (const { name, source } of sources) vm.runInContext(source, context, { filename: `${name}.js` });
  return {
    window, frames,
    setTime(value) { time = value; },
    setPaused(value) { window.itchsonAnimation.setPaused(value); },
    setHidden(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); },
    tick(timestamp) {
      time = timestamp;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(timestamp);
      assert.deepEqual(errors, [], 'game frame should execute without errors');
      return structuredClone(draws);
    },
  };
}

for (const reason of ['manual pause', 'hidden tab']) {
  test(`starfield preserves spawn deadlines, cooldowns, and animation phase across a ${reason}`, () => {
    const reference = browser();
    const paused = browser();
    reference.emit('game:start');
    paused.emit('game:start');
    // Pause once before the first spawn and once with active enemies/jiggle.
    let offset = 0;
    let sawEnemy = false;
    for (let time = 0; time <= 6000; time += 20) {
      if (time === 400 || time === 1800) {
        reference.setTime(time);
        paused.setTime(time + offset);
        reference.emit('star:jiggle');
        paused.emit('star:jiggle');
        assert.deepEqual(paused.tick(time + offset), reference.tick(time));
        const toggle = (value) => reason === 'manual pause' ? paused.setPaused(value) : paused.setHidden(value);
        toggle(true);
        assert.equal(paused.frames.size, 0);
        offset += 120000;
        paused.setTime(time + offset);
        toggle(false);
      }
      const expected = reference.tick(time);
      assert.deepEqual(paused.tick(time + offset), expected, `same gameplay after ${time} active milliseconds`);
      sawEnemy ||= expected.some(([kind]) => kind === 'ship');
      if (time < 800) assert.ok(!expected.some(([kind]) => kind === 'ship'), 'initial spawn must wait 800 active milliseconds');
    }
    assert.ok(sawEnemy, 'comparison must exercise active enemies');
  });
}

test('initially hidden starfield starts on the same game clock after becoming visible', () => {
  const reference = browser();
  const hidden = browser({ hidden: true });
  assert.equal(hidden.frames.size, 0);
  hidden.setTime(300000);
  hidden.setHidden(false);
  reference.emit('game:start');
  hidden.emit('game:start');
  for (let time = 0; time <= 1200; time += 20) {
    assert.deepEqual(hidden.tick(300000 + time), reference.tick(time));
  }
});

test('reset during a hidden interval clears enemies and preserves the next game spawn delay', () => {
  const reference = browser();
  const hidden = browser();
  reference.emit('game:start');
  hidden.emit('game:start');
  for (let time = 0; time <= 1400; time += 20) {
    assert.deepEqual(hidden.tick(time), reference.tick(time));
  }
  hidden.setHidden(true);
  hidden.setTime(121400);
  for (const env of [reference, hidden]) {
    env.emit('destruct:reset');
    env.emit('enemies:reset');
  }
  hidden.setHidden(false);
  reference.emit('game:start');
  hidden.emit('game:start');
  for (let elapsed = 0; elapsed <= 1200; elapsed += 20) {
    const expected = reference.tick(1400 + elapsed);
    assert.deepEqual(hidden.tick(121400 + elapsed), expected);
    if (elapsed < 800) assert.ok(!expected.some(([kind]) => kind === 'ship'));
  }
});
