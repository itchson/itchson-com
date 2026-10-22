import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ARCHIVE_BUCKET, deploy, objectHeaders, uploadOrder } from '../scripts/deploy.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'itchson-deploy-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('itchson-deploy-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const output = path.join(root, 'build');
  await mkdir(path.join(output, 'assets'), { recursive: true });
  const files = ['index.html', '404.html', 'assets/ship.svg', 'styles.0123456789abcdef.css', 'robots.txt'];
  for (const file of files) await writeFile(path.join(output, file), `new ${file}`);
  await writeFile(path.join(output, '.itchson-build'), 'never publish');
  const backupDir = path.join(root, 'backup');
  const calls = [];
  const old = [{ Key: 'index.html', ETag: '"old-index"' }, { Key: '../unusual/key', ETag: '"old-asset"' }];
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  const aws = async (args) => {
    calls.push(args);
    const operation = args.slice(0, 2).join(' ');
    if (operation === 'sts get-caller-identity') return { Account: '123456789012' };
    if (operation === 's3api get-bucket-versioning') return { Status: options.versioning ?? 'Enabled' };
    if (operation === 's3api list-objects-v2') return { Contents: old, ...options.listing };
    if (operation === 'cloudfront get-distribution-config') return { ETag: 'config-etag', DistributionConfig: { Enabled: true, Aliases: { Items: ['itchson.com'] }, Origins: { Items: [{ DomainName: options.wrongOrigin ? 'other-bucket.s3.amazonaws.com' : 'itchson.com.s3.ap-southeast-2.amazonaws.com' }] } } };
    if (operation === 's3api get-object') {
      if (options.backupFails) throw new Error('backup failed');
      const key = value(args, '--key');
      await writeFile(args.at(-1), 'old ' + key);
      return { ContentLength: Buffer.byteLength('old ' + key), ContentType: 'text/html', ETag: old.find((entry) => entry.Key === key).ETag, VersionId: 'null', Metadata: { original: 'yes' } };
    }
    if (operation === 's3api get-object-tagging') return { TagSet: [{ Key: 'retain', Value: 'yes' }] };
    if (operation === 's3api put-object') {
      assert.equal(JSON.parse(await readFile(path.join(backupDir, 'manifest.json'))).backupComplete, true);
      if (value(args, '--bucket') === ARCHIVE_BUCKET) {
        if (options.archiveFails) throw new Error('archive failed');
        return { ChecksumSHA256: options.badArchiveChecksum ? 'invalid' : value(args, '--checksum-sha256') };
      }
      if (options.uploadFails) throw new Error('upload failed');
      return { VersionId: options.nullVersion ? 'null' : 'new-version', ChecksumSHA256: value(args, '--checksum-sha256') };
    }
    if (operation === 'cloudfront create-invalidation') return { Invalidation: { Id: 'test-invalidation' } };
    if (operation === 'cloudfront wait') return {};
    throw new Error('Unexpected AWS operation: ' + operation);
  };
  const verify = async () => { calls.push(['verify']); return { output, files, fingerprint: '0123456789abcdef' }; };
  return { root, backupDir, aws, verify, calls, log() {} };
}

test('deployment backs up every current object and metadata before publishing assets, then homepage', async (t) => {
  const setup = await fixture(t);
  const manifest = await deploy(setup);
  assert.deepEqual(setup.calls[0], ['verify']);
  assert.equal(manifest.backupComplete, true);
  assert.ok(manifest.completedAt);
  assert.equal(manifest.objects.length, 2);
  for (const object of manifest.objects) {
    assert.match(object.body, /^objects\/[a-f0-9]{64}\.body$/);
    assert.equal(await readFile(path.join(setup.backupDir, object.body), 'utf8'), 'old ' + object.key);
    const saved = JSON.parse(await readFile(path.join(setup.backupDir, object.metadata)));
    assert.equal(saved.metadata.Metadata.original, 'yes');
    assert.equal(saved.tags.TagSet[0].Value, 'yes');
  }
  const uploads = setup.calls.filter((args) => args[1] === 'put-object');
  const keys = uploads.map((args) => args[args.indexOf('--key') + 1]);
  assert.equal(keys.at(-1), 'index.html');
  assert.ok(keys.indexOf('assets/ship.svg') < keys.indexOf('404.html'));
  assert.ok(!keys.includes('.itchson-build'));
  assert.ok(uploads.at(-1).includes('--if-match'));
  assert.ok(uploads[0].includes('--if-none-match'));
  assert.ok(setup.calls.filter((args) => args[0] === 's3api').every((args) => args.includes('--expected-bucket-owner')));
  const invalidation = setup.calls.find((args) => args[1] === 'create-invalidation');
  assert.deepEqual(JSON.parse(invalidation.at(-1)).Paths, { Quantity: 1, Items: ['/*'] });
  assert.equal(setup.calls.at(-1)[1], 'wait');
  assert.ok(!setup.calls.some((args) => args.some((arg) => /delete/i.test(arg))));
});

test('deployment refuses suspended versioning before any backup or write', async (t) => {
  const setup = await fixture(t, { versioning: 'Suspended' });
  await assert.rejects(deploy(setup), /versioning must be Enabled/);
  assert.ok(!setup.calls.some((args) => ['get-object', 'put-object', 'create-invalidation'].includes(args[1])));
});

test('private archive contains the complete backup before any production write', async (t) => {
  const setup = await fixture(t);
  const manifest = await deploy({ ...setup, backupBucket: ARCHIVE_BUCKET });
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  const archive = setup.calls.filter((args) => args[1] === 'put-object' && value(args, '--bucket') === ARCHIVE_BUCKET);
  const live = setup.calls.filter((args) => args[1] === 'put-object' && value(args, '--bucket') === 'itchson.com');
  assert.equal(archive.length, 8); // Distribution, versioning, inventory, two bodies + metadata, manifest.
  assert.ok(setup.calls.indexOf(archive.at(-1)) < setup.calls.indexOf(live[0]));
  assert.ok(archive.every((args) => value(args, '--key').startsWith(manifest.archive.prefix + '/')));
  assert.ok(archive.every((args) => value(args, '--server-side-encryption') === 'AES256' && args.includes('--if-none-match') && !args.includes('--acl')));
  assert.ok(value(archive.at(-1), '--key').endsWith('/manifest.json'));
  assert.match(manifest.archive.prefix, /^backups\/[0-9T-]+Z-[a-f0-9-]+$/);
  assert.ok(manifest.archiveCompletedAt);
});

test('archive failure or checksum mismatch blocks production writes', async (t) => {
  for (const options of [{ archiveFails: true }, { badArchiveChecksum: true }]) {
    const setup = await fixture(t, options);
    await assert.rejects(deploy({ ...setup, backupBucket: ARCHIVE_BUCKET }), /archive failed|archive did not confirm/);
    assert.ok(!setup.calls.some((args) => args[1] === 'put-object' && args[args.indexOf('--bucket') + 1] === 'itchson.com'));
    assert.ok(!setup.calls.some((args) => args[1] === 'create-invalidation'));
    const manifest = JSON.parse(await readFile(path.join(setup.backupDir, 'manifest.json')));
    assert.equal(manifest.backupComplete, true);
    assert.equal(manifest.archiveCompletedAt, undefined);
  }
});

test('deployment refuses incomplete listing and never treats a partial backup as complete', async (t) => {
  const incomplete = await fixture(t, { listing: { IsTruncated: true } });
  await assert.rejects(deploy(incomplete), /Incomplete S3 inventory/);
  const failed = await fixture(t, { backupFails: true });
  await assert.rejects(deploy(failed), /backup failed/);
  assert.equal(JSON.parse(await readFile(path.join(failed.backupDir, 'manifest.json'))).backupComplete, false);
  assert.ok(!failed.calls.some((args) => args[1] === 'put-object'));
});

test('deployment retains a completed backup and does not invalidate on upload failure', async (t) => {
  const setup = await fixture(t, { uploadFails: true });
  await assert.rejects(deploy(setup), /upload failed/);
  const backup = JSON.parse(await readFile(path.join(setup.backupDir, 'manifest.json')));
  assert.equal(backup.backupComplete, true);
  assert.ok(!setup.calls.some((args) => args[1] === 'create-invalidation'));
});

test('deployment rejects S3 writes without recoverable version IDs', async (t) => {
  const setup = await fixture(t, { nullVersion: true });
  await assert.rejects(deploy(setup), /recoverable object version/);
  assert.ok(!setup.calls.some((args) => args[1] === 'create-invalidation'));
});

test('deployment refuses a distribution whose origin no longer matches this site', async (t) => {
  const setup = await fixture(t, { wrongOrigin: true });
  await assert.rejects(deploy(setup), /CloudFront no longer matches/);
  assert.ok(!setup.calls.some((args) => ['get-object', 'put-object', 'create-invalidation'].includes(args[1])));
});

test('deployment requires a fresh explicit backup path outside published files', async (t) => {
  const setup = await fixture(t);
  await assert.rejects(deploy({ ...setup, backupDir: 'backup' }), /absolute path/);
  await assert.rejects(deploy({ ...setup, backupDir: path.join(setup.root, 'build', 'backup') }), /cannot be stored/);
  await mkdir(setup.backupDir);
  await assert.rejects(deploy(setup), /already exists/);
  assert.equal(setup.calls.length, 0);
});

test('production headers cache only fingerprinted code immutably and upload order keeps index last', () => {
  assert.equal(objectHeaders('index.html').cacheControl, 'no-cache, max-age=0, must-revalidate');
  assert.match(objectHeaders('assets/js/game.0123456789abcdef.js').cacheControl, /immutable/);
  assert.equal(objectHeaders('assets/ship.svg').cacheControl, 'public, max-age=3600');
  assert.equal(objectHeaders('assets/fonts/OFL.txt').contentType, 'text/plain; charset=utf-8');
  assert.throws(() => objectHeaders('.env'), /Unsupported/);
  assert.deepEqual(uploadOrder(['index.html', '404.html', 'a.css']), ['a.css', '404.html', 'index.html']);
});
