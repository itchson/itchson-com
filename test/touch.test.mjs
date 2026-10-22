import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { PROJECT_ROOT } from '../scripts/build.mjs';

const sources = await Promise.all(['runtime', 'touch'].map(async (name) => ({
  name, source: await readFile(path.join(PROJECT_ROOT, 'site', 'assets', 'js', `${name}.js`), 'utf8'),
})));

// Exercise the shipped controller and frame scheduler using browser-shaped event
// targets. This verifies input/lifecycle behavior, not physical device rendering.
function mobile({ coarse = true, reduced = false } = {}) {
  let time = 0;
  const window = new EventTarget();
  const document = new EventTarget();
  const element = (rect = { left: 0, top: 0, width: 1, height: 1 }, interactive = false) => {
    const classes = new Set();
    const attributes = new Map();
    const result = Object.assign(new EventTarget(), {
      style: { setProperty(name, value) { this[name] = value; } }, dataset: {}, attributes,
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      },
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
      closest: () => interactive ? result : null,
      contains: (target) => target === result,
      setAttribute: (name, value) => attributes.set(name, value),
    });
    return result;
  };
  const joystick = element({ left: 16, top: 660, width: 100, height: 100 });
  const thumb = element();
  const controls = element();
  controls.querySelector = (selector) => selector === '.joystick' ? joystick : thumb;
  controls.contains = (target) => [controls, joystick, thumb].includes(target);
  const shoot = element({ left: 290, top: 675, width: 80, height: 70 }, true);
  const jet = element();
  const logo = element({ left: 60, top: 330, width: 270, height: 50 }, true);
  const subtitle = element({ left: 80, top: 400, width: 230, height: 20 });
  const background = element();
  const link = element(undefined, true);
  const elements = { mobileControls: controls, shootBtn: shoot, jetCursor: jet };
  let target = background;
  Object.assign(document, {
    hidden: false, body: element(),
    getElementById: (id) => elements[id] ?? null,
    querySelector: (selector) => selector === '.logo-container' ? logo : subtitle,
    elementFromPoint: () => target,
  });
  const queries = new Map();
  Object.assign(window, {
    innerWidth: 390, innerHeight: 844,
    getComputedStyle: () => ({ cursor: 'default' }),
    matchMedia(query) {
      if (!queries.has(query)) queries.set(query, Object.assign(new EventTarget(), {
        matches: query === '(pointer: coarse)' ? coarse : query === '(prefers-reduced-motion: reduce)' ? reduced : false,
      }));
      return queries.get(query);
    },
  });
  let sequence = 0;
  const frames = new Map();
  const errors = [];
  const events = [];
  for (const type of ['game:start', 'cursor:state', 'cursor:mode', 'camera:delta', 'jet:shoot']) {
    window.addEventListener(type, ({ detail }) => events.push({ type, detail: structuredClone(detail) }));
  }
  const context = vm.createContext({
    window, document, CustomEvent,
    performance: { now: () => time },
    console: { error: (...args) => errors.push(args) },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  for (const { name, source } of sources) vm.runInContext(source, context, { filename: `${name}.js` });
  const touch = (type, node, points, { all = points, cancelable = true } = {}) => {
    const event = Object.assign(new Event(type, { cancelable }), {
      touches: all.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
      changedTouches: points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
    });
    node.dispatchEvent(event);
    return event;
  };
  return {
    window, document, controls, joystick, thumb, shoot, jet, logo, link, background, frames, events,
    animation: window.itchsonAnimation,
    touch,
    pointAt(next) { target = next; },
    emit(type) { window.dispatchEvent(new Event(type)); },
    last(type) { return events.filter((event) => event.type === type).at(-1)?.detail; },
    start(x = 190, y = 300) { target = background; touch('touchstart', document, [[1, x, y]]); },
    setTime(value) { time = value; },
    hidden(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    tick(timestamp) {
      time = timestamp;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(timestamp);
      assert.deepEqual(errors, [], 'mobile frames must not throw');
    },
  };
}

test('mobile controller does not activate on a fine-pointer desktop', () => {
  const env = mobile({ coarse: false });
  env.start();
  env.tick(16);
  assert.equal(env.frames.size, 0);
  assert.equal(env.events.length, 0);
});

test('background touch starts once, while logo, links and controls keep their own actions', () => {
  const env = mobile();
  for (const target of [env.logo, env.link, env.controls, env.joystick, env.shoot]) {
    env.pointAt(target);
    env.touch('touchstart', env.document, [[1, 100, 200]]);
  }
  assert.equal(env.events.filter(({ type }) => type === 'game:start').length, 0);
  env.start(130, 240);
  env.start(250, 250);
  env.tick(16);
  assert.equal(env.events.filter(({ type }) => type === 'game:start').length, 1);
  assert.equal(env.controls.attributes.get('aria-hidden'), 'false');
  assert.equal(env.controls.style.display, 'block');
  assert.equal(env.shoot.style.display, 'inline-flex');
  assert.deepEqual(env.last('cursor:state'), { x: 130, y: 240, angleDeg: 0, visible: true });
});

test('joystick saturates speed, tracks its owning finger, and shooting uses its current heading', () => {
  const env = mobile();
  env.start(190, 300);
  env.tick(0);
  const drag = env.touch('touchstart', env.joystick, [[2, 166, 710]]);
  assert.equal(drag.defaultPrevented, true);
  env.tick(50);
  assert.equal(env.last('cursor:state').x, 209); // 380 pixels/sec at full deflection.
  assert.equal(env.last('cursor:state').y, 300);
  assert.equal(env.last('cursor:state').angleDeg, 90);
  // A second finger cannot steal or release the active joystick.
  env.touch('touchstart', env.joystick, [[3, 66, 610]]);
  env.touch('touchend', env.joystick, [[3, 66, 610]], { all: [[2, 166, 710]] });
  env.tick(100);
  assert.equal(env.last('cursor:state').x, 228);
  const fired = env.touch('touchstart', env.shoot, [[4, 330, 710]]);
  assert.equal(fired.defaultPrevented, true, 'suppress compatibility click after touch shooting');
  assert.deepEqual(env.last('jet:shoot'), { x: 228, y: 300, spawnX: 228, spawnY: 300, angleDeg: 90 });
  env.touch('touchmove', env.joystick, [[2, 66, 685]]);
  env.tick(150);
  assert.equal(env.last('cursor:state').x, 228);
  assert.equal(env.last('cursor:state').y, 290.5, 'half deflection gives half speed');
  env.touch('touchcancel', env.joystick, [[2, 66, 685]], { all: [], cancelable: false });
  env.tick(200);
  assert.equal(env.last('cursor:state').y, 290.5);
  assert.equal(env.thumb.style['--joy-dx'], '0px');
  assert.equal(env.thumb.style['--joy-dy'], '0px');
});

for (const reason of ['manual pause', 'backgrounded app']) {
  test(`mobile ${reason} stops input and clears held joystick before resume`, () => {
    const env = mobile();
    env.start();
    env.tick(0);
    env.touch('touchstart', env.joystick, [[2, 166, 710]]);
    env.tick(50);
    const before = env.last('cursor:state');
    const pause = reason === 'manual pause' ? (value) => env.animation.setPaused(value) : (value) => env.hidden(value);
    pause(true);
    assert.equal(env.frames.size, 0);
    env.touch('touchstart', env.shoot, [[3, 330, 710]]);
    env.touch('touchmove', env.joystick, [[2, 166, 710]]);
    env.tick(120050);
    assert.equal(env.last('jet:shoot'), undefined);
    assert.deepEqual(env.last('cursor:state'), before);
    pause(false);
    env.tick(120066);
    assert.deepEqual(env.last('cursor:state'), before, 'resume must not move from stale touch or long elapsed time');
    env.touch('touchstart', env.joystick, [[4, 166, 710]]);
    env.tick(120116);
    assert.equal(env.last('cursor:state').x, before.x + 19);
  });
}

test('viewport changes keep gameplay coordinates inside the resized screen', () => {
  const env = mobile();
  env.start(380, 830);
  env.tick(0);
  env.touch('touchstart', env.joystick, [[2, 166, 810]]);
  env.window.innerWidth = 320;
  env.window.innerHeight = 568;
  env.emit('resize');
  env.tick(50);
  assert.equal(env.last('cursor:state').x, 320);
  assert.equal(env.last('cursor:state').y, 568);
  env.touch('touchmove', env.joystick, [[2, -1000, -1000]]);
  for (let time = 100; time <= 4100; time += 50) env.tick(time);
  assert.equal(env.last('cursor:state').x, 0);
  assert.equal(env.last('cursor:state').y, 0);
});

test('reset hides mobile controls and discards held input before the next game', () => {
  const env = mobile();
  env.start();
  env.tick(0);
  env.touch('touchstart', env.joystick, [[2, 166, 710]]);
  env.emit('enemies:reset');
  assert.equal(env.controls.attributes.get('aria-hidden'), 'true');
  assert.equal(env.controls.style.display, 'none');
  assert.equal(env.shoot.style.display, 'none');
  env.touch('touchstart', env.shoot, [[3, 330, 710]]);
  assert.equal(env.last('jet:shoot'), undefined);
  env.tick(50);
  assert.equal(env.last('cursor:mode').mode, 'orbit');
  env.start(100, 100);
  env.tick(100);
  assert.equal(env.last('cursor:state').x, 100);
  assert.equal(env.last('cursor:state').y, 100);
});

test('reduced-motion mobile idle renders once but explicitly started gameplay still responds', () => {
  const env = mobile({ reduced: true });
  env.tick(16);
  assert.equal(env.frames.size, 0);
  assert.equal(env.last('cursor:state').visible, true);
  env.start(100, 100);
  env.touch('touchstart', env.joystick, [[2, 166, 710]]);
  env.tick(66);
  assert.equal(env.last('cursor:state').x, 119);
  assert.equal(env.frames.size, 1);
  env.emit('enemies:reset');
  env.tick(82);
  assert.equal(env.frames.size, 0);
});
