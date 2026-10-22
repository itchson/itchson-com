import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build, PROJECT_ROOT } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/preview.mjs';
import { CSP, META_CSP } from '../scripts/security.mjs';

const HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="canonical" href="https://itchson.com/"><link rel="stylesheet" href="/styles.css"></head><body><h1>Test site</h1><script src="/game.js" defer></script></body></html>';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'itchson-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('itchson-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'site', 'assets'), { recursive: true });
  await writeFile(path.join(root, 'site', 'index.html'), HTML);
  await writeFile(path.join(root, 'site', 'blog.html'), HTML.replace('Test site', 'Blog page'));
  await writeFile(path.join(root, 'site', 'faq.html'), HTML.replace('Test site', 'FAQ page'));
  await writeFile(path.join(root, 'site', 'styles.css'), 'body { color: #fff; background: #111; }');
  await writeFile(path.join(root, 'site', 'game.js'), 'const harmlessText = "styles.css";');
  return root;
}

async function preview(t, root) {
  const server = await createPreviewServer({ root: path.join(root, 'build') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return (target, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: target, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('build publishes only allowed site source and fingerprints script/style references', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.env'), 'SECRET_DO_NOT_PUBLISH=private');
  await mkdir(path.join(root, 'work'));
  await writeFile(path.join(root, 'work', 'artifact.txt'), 'PRIVATE_ARTIFACT');
  const result = await build({ root });
  assert.deepEqual((await readdir(result.output)).sort(), ['.itchson-build', 'blog.html', 'faq.html', `game.${result.fingerprint}.js`, 'index.html', `styles.${result.fingerprint}.css`].sort());
  const html = await readFile(path.join(result.output, 'index.html'), 'utf8');
  assert.ok(html.includes(`/styles.${result.fingerprint}.css`));
  assert.ok(html.includes(`/game.${result.fingerprint}.js`));
  assert.ok(html.includes(META_CSP));
  assert.ok(!html.includes('unsafe-inline') && !html.includes('unsafe-eval'));
  assert.equal(await readFile(path.join(result.output, `game.${result.fingerprint}.js`), 'utf8'), 'const harmlessText = "styles.css";');
  for (const file of result.files) assert.doesNotMatch(await readFile(path.join(result.output, file), 'utf8'), /SECRET_DO_NOT_PUBLISH|PRIVATE_ARTIFACT/);
});

test('build is deterministic and invalidates cache when a referenced source changes', async (t) => {
  const root = await fixture(t);
  const first = await build({ root });
  const repeated = await build({ root });
  assert.equal(first.fingerprint, repeated.fingerprint);
  await writeFile(path.join(root, 'site', 'game.js'), 'const changed = true;');
  const changed = await build({ root });
  assert.notEqual(first.fingerprint, changed.fingerprint);
  assert.ok(!(await readdir(changed.output)).includes(`game.${first.fingerprint}.js`));
});

test('build distributes the exact font license while rejecting unrelated text assets', async (t) => {
  const root = await fixture(t);
  const license = await readFile(path.join(PROJECT_ROOT, 'licenses', 'Press-Start-2P-OFL.txt'));
  assert.deepEqual(await readFile(path.join(PROJECT_ROOT, 'site', 'assets', 'fonts', 'OFL.txt')), license);
  await mkdir(path.join(root, 'site', 'assets', 'fonts'));
  await writeFile(path.join(root, 'site', 'assets', 'fonts', 'OFL.txt'), license);
  const result = await build({ root });
  assert.deepEqual(await readFile(path.join(result.output, 'assets', 'fonts', 'OFL.txt')), license);
  await writeFile(path.join(root, 'site', 'assets', 'fonts', 'private.txt'), 'DO_NOT_PUBLISH');
  await assert.rejects(build({ root }), /Disallowed source file/);
});

test('build rejects hidden files and unsafe types before disturbing the current output', async (t) => {
  const root = await fixture(t);
  const result = await build({ root });
  const previous = await readFile(path.join(result.output, 'index.html'), 'utf8');
  await writeFile(path.join(root, 'site', '.env'), 'SENSITIVE');
  await assert.rejects(build({ root }), /Disallowed source name/);
  assert.equal(await readFile(path.join(result.output, 'index.html'), 'utf8'), previous);
  await rm(path.join(root, 'site', '.env'));
  await writeFile(path.join(root, 'site', 'assets', 'credentials.json'), '{}');
  await assert.rejects(build({ root }), /Disallowed source file/);
});

test('build refuses an unrecognized output directory', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'build'));
  await writeFile(path.join(root, 'build', 'keep.txt'), 'Keep this file');
  await assert.rejects(build({ root }), /unrecognized build/);
  assert.equal(await readFile(path.join(root, 'build', 'keep.txt'), 'utf8'), 'Keep this file');
});

test('build rejects symlinked assets without copying their targets', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private', 'secret.txt'), 'PRIVATE');
  try { await symlink(path.join(root, 'private'), path.join(root, 'site', 'assets', 'linked'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('OS does not permit symlink creation.'); throw error; }
  await assert.rejects(build({ root }), /Symlinks are not allowed/);
  assert.equal(await readFile(path.join(root, 'private', 'secret.txt'), 'utf8'), 'PRIVATE');
});

test('build rejects inline executable content and remote dependencies', async (t) => {
  const root = await fixture(t);
  for (const unsafe of ['<script>alert(1)</script>', '<img src="/assets/a.png" onerror="alert(1)">', '<style>body{color:red}</style>', '<script src="https://example.com/remote.js"></script>', '<link rel="stylesheet" href="https://example.com/styles.css">']) {
    await writeFile(path.join(root, 'site', 'index.html'), HTML.replace('</head>', unsafe + '</head>'));
    await assert.rejects(build({ root }), /not allowed|must be external/);
  }
});

test('preview serves the correct routes, content types, CSP, and cache policy', async (t) => {
  const root = await fixture(t);
  const built = await build({ root });
  const get = await preview(t, root);
  for (const [route, heading] of [['/', 'Test site'], ['/blog', 'Test site'], ['/blog/', 'Test site'], ['/blog.html', 'Test site'], ['/faq?test=true', 'Test site'], ['/faq/', 'Test site'], ['/faq.html', 'Test site']]) {
    const response = await get(route);
    assert.equal(response.status, 200);
    assert.ok(response.body.includes(heading));
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['content-security-policy'], CSP);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const script = await get(`/game.${built.fingerprint}.js`);
  assert.equal(script.status, 200);
  assert.equal(script.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(script.headers['cache-control'], 'public, max-age=31536000, immutable');
  const head = await get('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
});

test('preview returns actual 404s and rejects unsupported methods and traversal', async (t) => {
  const root = await fixture(t);
  await build({ root });
  const get = await preview(t, root);
  assert.equal((await get('/missing-page')).status, 404);
  assert.equal((await get('/assets/missing.png')).status, 404);
  assert.equal((await get('/', 'POST')).status, 405);
  for (const route of ['/../package.json', '/%2e%2e/package.json', '/assets/%2e%2e/index.html', '/%2eenv', '/.itchson-build', '/assets%2fsecret.txt', '/%5c../package.json', '/%00.html', '/bad%ZZ']) {
    const response = await get(route);
    assert.equal(response.status, 400, route);
    assert.equal(response.headers['content-security-policy'], CSP);
  }
});

test('preview refuses symlink targets outside the build directory', async (t) => {
  const root = await fixture(t);
  await build({ root });
  await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private', 'secret.html'), 'PRIVATE');
  try { await symlink(path.join(root, 'private'), path.join(root, 'build', 'linked'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('OS does not permit symlink creation.'); throw error; }
  const get = await preview(t, root);
  const response = await get('/linked/secret.html');
  assert.equal(response.status, 404);
  assert.ok(!response.body.includes('PRIVATE'));
});

test('CloudFront route and security policy templates agree with preview', async () => {
  const code = await readFile(path.join(PROJECT_ROOT, 'deployment', 'cloudfront-function.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(code, context);
  for (const [input, output] of [['/', '/index.html'], ['/blog', '/index.html'], ['/blog.html', '/index.html'], ['/faq/', '/index.html'], ['/faq.html', '/index.html'], ['/missing', '/missing']]) {
    assert.equal(context.handler({ request: { uri: input } }).uri, output);
  }
  const policy = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'deployment', 'response-headers-policy.json'), 'utf8'));
  assert.equal(policy.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy, CSP);
  assert.equal(policy.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.Override, true);
});
