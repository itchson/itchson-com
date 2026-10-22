import { createServer } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './build.mjs';
import { SECURITY_HEADERS } from './security.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
};

function requestPath(target) {
  const raw = target.split('?')[0];
  if (!raw.startsWith('/') || /%2f|%5c/i.test(raw)) throw new Error('Invalid request path.');
  const decoded = decodeURIComponent(raw);
  const parts = decoded.split('/');
  if (/[\\\x00-\x1f\x7f:]/.test(decoded) || parts.some((part) => part === '..' || part === '.' || part.startsWith('.'))) throw new Error('Invalid request path.');
  if (decoded === '/') return 'index.html';
  if (/^\/(blog|faq)(?:\/|\.html)?$/.test(decoded)) return 'index.html';
  return decoded.slice(1);
}

async function readSafeFile(root, relative) {
  if (!relative || relative.endsWith('/') || !MIME_TYPES[path.extname(relative)]) return null;
  const parts = relative.split('/');
  let current = root;
  try {
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      const info = await lstat(current);
      if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) return null;
    }
    const resolved = await realpath(current);
    if (!resolved.startsWith(root + path.sep)) return null;
    return await readFile(resolved);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EINVAL'].includes(error.code)) return null;
    throw error;
  }
}

export async function createPreviewServer({ root = path.join(PROJECT_ROOT, 'build') } = {}) {
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Build output must be a real directory.');
  const directory = await realpath(root);
  return createServer(async (request, response) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return send(405, 'Method not allowed.');
    }
    let relative;
    try { relative = requestPath(request.url); } catch { return send(400, 'Invalid request path.'); }
    try {
      const body = await readSafeFile(directory, relative);
      if (body === null) {
        const fallback = await readSafeFile(directory, '404.html');
        return fallback ? send(404, fallback, MIME_TYPES['.html']) : send(404, 'Page not found.');
      }
      if (/\.[a-f0-9]{16}\.(?:css|js)$/.test(relative)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (!relative.endsWith('.html')) response.setHeader('Cache-Control', 'public, max-age=3600');
      send(200, body, MIME_TYPES[path.extname(relative)]);
    } catch {
      send(500, 'Unable to read this page.');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
    const server = await createPreviewServer();
    server.on('error', (error) => { console.error(`Preview failed: ${error.message}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
  } catch (error) {
    console.error(`Preview failed: ${error.message}. Run npm run build first.`);
    process.exitCode = 1;
  }
}
