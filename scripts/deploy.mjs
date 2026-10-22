import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build, PROJECT_ROOT } from './build.mjs';

const execute = promisify(execFile);
export const TARGET = Object.freeze({ bucket: 'itchson.com', region: 'ap-southeast-2', distribution: 'E20TZP2HDNPJLG' });
export const ARCHIVE_BUCKET = 'itchson-com-backups-513346603319';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

export function objectHeaders(key) {
  const contentType = MIME[path.posix.extname(key)];
  if (!contentType) throw new Error(`Unsupported deployment file type: ${key}`);
  const cacheControl = key.endsWith('.html') ? 'no-cache, max-age=0, must-revalidate'
    : /\.[a-f0-9]{16}\.(css|js)$/.test(key) ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';
  return { contentType, cacheControl };
}

export function uploadOrder(keys) {
  const priority = (key) => key === 'index.html' ? 2 : key.endsWith('.html') ? 1 : 0;
  return [...keys].sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, 'en'));
}

async function awsCommand(args) {
  try {
    const { stdout } = await execute('aws', [...args, '--region', TARGET.region, '--output', 'json', '--no-cli-pager', '--no-cli-auto-prompt'], {
      env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' }, maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim() ? JSON.parse(stdout) : {};
  } catch (error) {
    // Do not dump environment, command arguments, credential diagnostics, or AWS response bodies.
    const code = typeof error.code === 'number' || error.code === 'ENOENT' ? ` (${error.code})` : '';
    throw new Error(`AWS CLI ${args[0]} ${args[1]} failed${code}. Check AWS authentication and the role's documented permissions.`);
  }
}

async function verifyProject(root) {
  const { stdout } = await execute(process.execPath, ['--test'], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(stdout);
  return build({ root });
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

/** Tests inject AWS and verification; normal execution always runs the real suite and builder. */
export async function deploy({ backupDir, backupBucket, root = PROJECT_ROOT, aws = awsCommand, verify = verifyProject, log = console.log } = {}) {
  if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('--backup-dir must be an explicit absolute path to a new backup directory.');
  if (backupBucket && backupBucket !== ARCHIVE_BUCKET) throw new Error(`--backup-bucket must name the dedicated archive bucket ${ARCHIVE_BUCKET}.`);
  const workspace = await realpath(root);
  const backup = path.resolve(backupDir);
  if (inside(path.join(workspace, 'site'), backup) || inside(path.join(workspace, 'build'), backup)) throw new Error('Backups cannot be stored in site/ or build/.');
  // Refuse an existing destination, including symlinks. Never overwrite an earlier backup.
  try { await lstat(backup); throw new Error('The backup directory already exists; choose a new release directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const result = await verify(workspace);
  const output = await realpath(result.output);
  if (output !== path.join(workspace, 'build')) throw new Error('The verified output must be this project\'s build/ directory.');
  const inventory = [];
  for (const key of uploadOrder(result.files)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) || key.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Unsafe build inventory entry.');
    const file = path.join(output, ...key.split('/'));
    if (!(await lstat(file)).isFile() || await realpath(file) !== file) throw new Error('Build inventory contains a symlink or non-file.');
    const bytes = await readFile(file);
    inventory.push({ key, file, size: bytes.length, sha256: sha256(bytes), checksum: createHash('sha256').update(bytes).digest('base64'), ...objectHeaders(key) });
  }
  if (!inventory.some(({ key }) => key === 'index.html')) throw new Error('The build inventory has no homepage.');

  const identity = await aws(['sts', 'get-caller-identity']);
  if (!/^\d{12}$/.test(identity.Account || '')) throw new Error('AWS did not return a valid account identity.');
  const s3 = (operation, args = []) => aws(['s3api', operation, '--bucket', TARGET.bucket, '--expected-bucket-owner', identity.Account, ...args]);
  const versioning = await s3('get-bucket-versioning');
  if (versioning.Status !== 'Enabled') throw new Error('S3 bucket versioning must be Enabled before deployment. On first enablement, wait 15 minutes before writing objects.');
  const listing = await s3('list-objects-v2'); // AWS CLI automatically paginates the complete list.
  if (listing.IsTruncated || listing.NextToken || listing.NextContinuationToken) throw new Error('Incomplete S3 inventory; refusing to deploy.');
  const previous = listing.Contents || [];
  if (!previous.some(({ Key }) => Key === 'index.html')) throw new Error('The expected existing homepage is missing; refusing to deploy to an unverified bucket.');

  await mkdir(path.dirname(backup), { recursive: true });
  const resolvedBackup = path.join(await realpath(path.dirname(backup)), path.basename(backup));
  if (inside(path.join(workspace, 'site'), resolvedBackup) || inside(path.join(workspace, 'build'), resolvedBackup)) throw new Error('The backup parent resolves into generated or published files.');
  await mkdir(backup, { mode: 0o700 });
  await mkdir(path.join(backup, 'objects'), { mode: 0o700 });
  const save = (name, value) => writeFile(path.join(backup, name), json(value), { mode: 0o600 });
  const distribution = await aws(['cloudfront', 'get-distribution-config', '--id', TARGET.distribution]);
  await save('cloudfront.json', distribution);
  const config = distribution.DistributionConfig;
  if (!config?.Aliases?.Items?.includes(TARGET.bucket) || !config.Origins?.Items?.some((origin) => origin.DomainName === `${TARGET.bucket}.s3.${TARGET.region}.amazonaws.com`)) {
    throw new Error('CloudFront no longer matches the verified site hostname and S3 origin; review its configuration before deploying.');
  }
  await save('bucket-versioning.json', versioning);
  await save('bucket-inventory.json', listing);
  const manifest = { format: 1, target: TARGET, createdAt: new Date().toISOString(), fingerprint: result.fingerprint, backupComplete: false, objects: [], uploads: [] };
  await save('manifest.json', manifest);
  for (const object of previous) {
    if (typeof object.Key !== 'string' || !object.ETag) throw new Error('An existing S3 object lacks its key or ETag.');
    // Hash names so arbitrary S3 keys can never escape or collide on the local filesystem.
    const name = sha256(object.Key);
    const body = `objects/${name}.body`;
    const metadata = await s3('get-object', ['--key', object.Key, '--if-match', object.ETag, path.join(backup, body)]);
    const bytes = await readFile(path.join(backup, body));
    if (bytes.length !== metadata.ContentLength || metadata.ETag !== object.ETag) throw new Error('An existing S3 object changed or its backup is incomplete.');
    const version = metadata.VersionId ? ['--version-id', metadata.VersionId] : [];
    const tags = await s3('get-object-tagging', ['--key', object.Key, ...version]);
    const metadataFile = `objects/${name}.json`;
    await save(metadataFile, { key: object.Key, metadata, tags });
    manifest.objects.push({ key: object.Key, body, metadata: metadataFile, size: bytes.length, sha256: sha256(bytes), etag: metadata.ETag, versionId: metadata.VersionId ?? null });
    await save('manifest.json', manifest);
  }
  manifest.backupComplete = true;
  await save('manifest.json', manifest);
  log(`Verified backup of ${manifest.objects.length} existing objects in ${backup}`);

  if (backupBucket) {
    const prefix = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
    manifest.archive = { bucket: backupBucket, prefix };
    await save('manifest.json', manifest);
    // Archive only the explicit backup inventory, with the manifest uploaded last.
    const archiveFiles = ['cloudfront.json', 'bucket-versioning.json', 'bucket-inventory.json',
      ...manifest.objects.flatMap((object) => [object.body, object.metadata]), 'manifest.json'];
    for (const relative of archiveFiles) {
      const file = path.join(backup, relative);
      const checksum = createHash('sha256').update(await readFile(file)).digest('base64');
      const archived = await aws(['s3api', 'put-object', '--bucket', backupBucket, '--expected-bucket-owner', identity.Account,
        '--key', `${prefix}/${relative}`, '--body', file, '--content-type', relative.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        '--server-side-encryption', 'AES256', '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum, '--if-none-match', '*']);
      if (archived.ChecksumSHA256 !== checksum) throw new Error('The private archive did not confirm a backup checksum; production has not been modified.');
    }
    manifest.archiveCompletedAt = new Date().toISOString();
    await save('manifest.json', manifest);
    log(`Archived the complete backup to s3://${backupBucket}/${prefix}/ before production writes.`);
  }

  const oldObjects = new Map(manifest.objects.map((object) => [object.key, object]));
  for (const file of inventory) {
    const old = oldObjects.get(file.key);
    // Refuse competing writes. Do not delete old assets: cached pages may still reference them.
    const condition = old ? ['--if-match', old.etag] : ['--if-none-match', '*'];
    const uploaded = await s3('put-object', ['--key', file.key, '--body', file.file, '--content-type', file.contentType,
      '--cache-control', file.cacheControl, '--checksum-algorithm', 'SHA256', '--checksum-sha256', file.checksum, ...condition]);
    if (uploaded.ChecksumSHA256 !== file.checksum || !uploaded.VersionId || uploaded.VersionId === 'null') throw new Error('S3 did not confirm the uploaded checksum and a recoverable object version.');
    manifest.uploads.push({ key: file.key, sha256: file.sha256, versionId: uploaded.VersionId, contentType: file.contentType, cacheControl: file.cacheControl });
    await save('manifest.json', manifest);
  }
  const invalidation = await aws(['cloudfront', 'create-invalidation', '--distribution-id', TARGET.distribution,
    '--invalidation-batch', JSON.stringify({ Paths: { Quantity: 1, Items: ['/*'] }, CallerReference: `itchson-${randomUUID()}` })]);
  if (!invalidation.Invalidation?.Id) throw new Error('CloudFront did not return an invalidation ID.');
  manifest.invalidationId = invalidation.Invalidation.Id;
  await save('manifest.json', manifest);
  await aws(['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', TARGET.distribution, '--id', manifest.invalidationId]);
  manifest.completedAt = new Date().toISOString();
  await save('manifest.json', manifest);
  log(`Deployed ${inventory.length} files; CloudFront invalidation ${manifest.invalidationId} completed.`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  let valid = args.length > 0 && args.length % 2 === 0;
  for (let index = 0; index < args.length; index += 2) {
    const name = { '--backup-dir': 'backupDir', '--backup-bucket': 'backupBucket' }[args[index]];
    if (!name || options[name] || !args[index + 1] || args[index + 1].startsWith('--')) valid = false;
    else options[name] = args[index + 1];
  }
  if (process.env.GITHUB_ACTIONS === 'true' && !options.backupBucket) {
    console.error('GitHub Actions deployments require --backup-bucket so the backup survives the runner.');
    process.exitCode = 1;
  } else if (!valid || !options.backupDir) {
    console.error('Usage: node scripts/deploy.mjs --backup-dir <new-absolute-directory> [--backup-bucket itchson-com-backups-513346603319]');
    process.exitCode = 1;
  } else {
    try { await deploy(options); }
    catch (error) { console.error(`Deployment stopped: ${error.message}`); process.exitCode = 1; }
  }
}
