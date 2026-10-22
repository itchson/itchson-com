import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://itchson.com';
const expected = await readFile(new URL('../build/index.html', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const response = await fetch(base + '/', { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, 'Homepage must return 200');
assert.match(response.headers.get('content-type') ?? '', /text\/html/);
assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(expected), 'Public homepage differs from the release');
for (const asset of [...expected.toString().matchAll(/(?:src|href)="(\/(?:assets\/|styles\.)[^"#?]+)"/g)].map((match) => match[1])) {
  const resource = await fetch(base + asset, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  assert.equal(resource.status, 200, `Missing release asset: ${asset}`);
}
assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/, 'Missing CSP response header');
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
const missing = await fetch(base + '/release-check-missing-page', { signal: AbortSignal.timeout(30000) });
assert.equal(missing.status, 404, 'Missing routes must return 404');
console.log('Public homepage, release assets, security headers, and 404 behavior verified.');
