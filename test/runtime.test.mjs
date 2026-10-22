import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build, PROJECT_ROOT } from '../scripts/build.mjs';

const runtimeSource = await readFile(path.join(PROJECT_ROOT, 'site', 'assets', 'js', 'runtime.js'), 'utf8');

function browser({ hidden = false } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  const classes = new Set();
  const pauseButton = Object.assign(new EventTarget(), {
    textContent: '',
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  });
  const hint = { textContent: '' };
  Object.assign(document, {
    hidden,
    body: { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } },
    getElementById(id) { return { pauseGame: pauseButton, gameHint: hint }[id] ?? null; },
  });
  let nativeSequence = 0;
  const nativeFrames = new Map();
  const cancelledFrames = [];
  const errors = [];
  const events = [];
  window.addEventListener('game:pause', () => events.push('pause'));
  window.addEventListener('game:resume', () => events.push('resume'));
  vm.runInNewContext(runtimeSource, {
    window, document, CustomEvent,
    console: { error(...args) { errors.push(args); } },
    requestAnimationFrame(callback) {
      const id = ++nativeSequence;
      nativeFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
      nativeFrames.delete(id);
    },
  }, { filename: 'runtime.js' });
  return {
    animation: window.itchsonAnimation, window, document, pauseButton, hint,
    nativeFrames, cancelledFrames, errors, events, classes,
    tick(timestamp) {
      const callbacks = [...nativeFrames.values()];
      nativeFrames.clear();
      for (const callback of callbacks) callback(timestamp);
    },
    setHidden(value) {
      document.hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('animation subscribers share one browser frame and run once with its native timestamp', () => {
  const env = browser();
  const callbacks = [];
  env.animation.request((timestamp) => callbacks.push(['stars', timestamp]));
  env.animation.request((timestamp) => callbacks.push(['cursor', timestamp]));
  assert.equal(env.nativeFrames.size, 1);
  env.tick(1234.567);
  assert.deepEqual(callbacks, [['stars', 1234.567], ['cursor', 1234.567]]);
  assert.equal(env.nativeFrames.size, 0);
  env.tick(1251);
  assert.equal(callbacks.length, 2);
});

test('cancellation works before and during a frame; new callbacks wait for the next frame', () => {
  const env = browser();
  const callbacks = [];
  const cancelled = env.animation.request(() => callbacks.push('cancelled before frame'));
  env.animation.cancel(cancelled);
  let second;
  env.animation.request(() => {
    callbacks.push('first');
    env.animation.cancel(second);
    env.animation.request(() => callbacks.push('next frame'));
  });
  second = env.animation.request(() => callbacks.push('cancelled during frame'));
  env.tick(100);
  assert.deepEqual(callbacks, ['first']);
  assert.equal(env.nativeFrames.size, 1);
  env.tick(116.7);
  assert.deepEqual(callbacks, ['first', 'next frame']);
  assert.equal(env.nativeFrames.size, 0);
});

test('explicit pause retains queued work without scheduling frames until resume', () => {
  const env = browser();
  const timestamps = [];
  env.animation.request((timestamp) => timestamps.push(timestamp));
  env.animation.setPaused(true);
  env.animation.request((timestamp) => timestamps.push(timestamp));
  env.animation.setPaused(true);
  assert.equal(env.animation.paused, true);
  assert.equal(env.nativeFrames.size, 0);
  assert.equal(env.cancelledFrames.length, 1);
  assert.deepEqual(env.events, ['pause']);
  env.tick(1000);
  assert.deepEqual(timestamps, []);
  env.animation.setPaused(false);
  assert.equal(env.nativeFrames.size, 1);
  assert.deepEqual(env.events, ['pause', 'resume']);
  env.tick(20000.5);
  assert.deepEqual(timestamps, [20000.5, 20000.5]);
  assert.equal(env.nativeFrames.size, 0);
});

test('pausing from a frame callback preserves the other subscribers until resumed', () => {
  const env = browser();
  const callbacks = [];
  env.animation.request(() => {
    callbacks.push('pause now');
    env.animation.setPaused(true);
  });
  env.animation.request(() => callbacks.push('after resume'));
  env.tick(20);
  assert.deepEqual(callbacks, ['pause now']);
  assert.equal(env.nativeFrames.size, 0);
  env.animation.setPaused(false);
  env.tick(500);
  assert.deepEqual(callbacks, ['pause now', 'after resume']);
});

test('hidden tabs suspend queued work and dispatch pause/resume events without altering timestamps', () => {
  const env = browser();
  const timestamps = [];
  env.animation.request((timestamp) => timestamps.push(timestamp));
  env.setHidden(true);
  env.setHidden(true);
  assert.equal(env.animation.paused, true);
  assert.equal(env.nativeFrames.size, 0);
  assert.deepEqual(env.events, ['pause']);
  env.tick(10000);
  assert.deepEqual(timestamps, []);
  env.setHidden(false);
  assert.equal(env.animation.paused, false);
  assert.deepEqual(env.events, ['pause', 'resume']);
  assert.equal(env.nativeFrames.size, 1);
  env.tick(450000.125);
  assert.deepEqual(timestamps, [450000.125]);
});

test('a document initially hidden schedules nothing until it becomes visible', () => {
  const env = browser({ hidden: true });
  const callbacks = [];
  env.animation.request(() => callbacks.push('visible'));
  assert.equal(env.animation.paused, true);
  assert.equal(env.nativeFrames.size, 0);
  env.setHidden(false);
  assert.deepEqual(env.events, ['resume']);
  env.tick(600);
  assert.deepEqual(callbacks, ['visible']);
});

test('user pause survives tab visibility changes and controls report the correct state', () => {
  const env = browser();
  const callbacks = [];
  env.animation.request(() => callbacks.push('resumed'));
  env.pauseButton.dispatchEvent(new Event('click'));
  assert.equal(env.animation.paused, true);
  assert.equal(env.pauseButton.attributes.get('aria-pressed'), 'true');
  assert.match(env.pauseButton.textContent, /RESUME/);
  assert.equal(env.hint.textContent, 'PAUSED');
  env.setHidden(true);
  env.setHidden(false);
  assert.equal(env.animation.paused, true);
  assert.equal(env.nativeFrames.size, 0);
  assert.deepEqual(env.events, ['pause']);
  env.pauseButton.dispatchEvent(new Event('click'));
  assert.equal(env.pauseButton.attributes.get('aria-pressed'), 'false');
  assert.equal(env.animation.paused, false);
  env.tick(800);
  assert.deepEqual(callbacks, ['resumed']);
  env.window.dispatchEvent(new Event('game:start'));
  assert.match(env.hint.textContent, /LOGO TO RESET/);
  env.window.dispatchEvent(new Event('game:over'));
  assert.match(env.hint.textContent, /GAME OVER/);
  env.animation.setPaused(true);
  assert.equal(env.hint.textContent, 'PAUSED');
  env.animation.setPaused(false);
  assert.match(env.hint.textContent, /GAME OVER/);
  env.window.dispatchEvent(new Event('enemies:reset'));
  assert.match(env.hint.textContent, /STARFIELD TO START/);
});

test('shipped site preserves the original logo and builds every local script, style, and font license', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'itchson-shipped-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('itchson-shipped-test-'));
    await rm(root, { recursive: true, force: true });
  });
  // Build a snapshot so a test cannot interrupt a running local preview.
  await cp(path.join(PROJECT_ROOT, 'site'), path.join(root, 'site'), { recursive: true });
  const result = await build({ root });
  const html = await readFile(path.join(result.output, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/class="letter (letter-[^"]+)"/g)].map((match) => match[1]), ['letter-i', 'letter-t1', 'letter-c', 'letter-h', 'letter-s', 'letter-o', 'letter-n']);
  assert.match(html, /href="https:\/\/x\.com\/itchson"/);
  assert.match(html, /href="mailto:contact@itchson\.com"/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const names = [];
  for (const [, attributes, body] of scripts) {
    assert.equal(body.trim(), '');
    assert.match(attributes, /\bdefer\b/);
    const source = /\bsrc="([^"]+)"/.exec(attributes)?.[1];
    assert.match(source, /^\/assets\/js\/[a-z]+\.[a-f0-9]{16}\.js$/);
    const script = await readFile(path.join(result.output, source.slice(1)), 'utf8');
    assert.ok(script.length > 0);
    names.push(path.posix.basename(source).replace(/\.[a-f0-9]{16}\.js$/, ''));
  }
  assert.deepEqual(names, ['runtime', 'favicon', 'starfield', 'logo', 'cursor', 'touch']);
  const stylesheet = /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(html)?.[1];
  assert.match(stylesheet, /^\/styles\.[a-f0-9]{16}\.css$/);
  const css = await readFile(path.join(result.output, stylesheet.slice(1)), 'utf8');
  assert.match(css, /\/assets\/fonts\/press-start-2p-latin\.woff2/);
  const font = await readFile(path.join(result.output, 'assets', 'fonts', 'press-start-2p-latin.woff2'));
  assert.equal(font.subarray(0, 4).toString(), 'wOF2');
  const license = await readFile(path.join(PROJECT_ROOT, 'licenses', 'Press-Start-2P-OFL.txt'));
  assert.deepEqual(await readFile(path.join(result.output, 'assets', 'fonts', 'OFL.txt')), license);
});
