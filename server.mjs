// Server lokal untuk pratinjau produksi: menyajikan berkas statis hasil build dan
// meneruskan satu-satunya endpoint /api/sync ke handler yang sama dengan Vercel.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSyncHandler } from './api/sync.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const EXACT_FILES = new Set(['/index.html', '/app.js', '/styles.css']);

export function resolveStaticPath(pathname, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded === '/' || decoded === '') return path.join(root, 'index.html');
  if (EXACT_FILES.has(decoded)) return path.join(root, decoded.slice(1));
  if (decoded.startsWith('/assets/')) {
    const assetsRoot = path.join(root, 'assets');
    const target = path.join(root, decoded.slice(1));
    const relative = path.relative(assetsRoot, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return target;
  }
  return null;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function sendFile(response, filePath, request) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    response.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'Tidak ditemukan');
    return;
  }
  if (!info.isFile()) {
    response.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'Tidak ditemukan');
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': CONTENT_TYPES[extension] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag: `W/"${info.size}-${Math.floor(info.mtimeMs)}"`,
    'last-modified': info.mtime.toUTCString(),
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function createAppServer({ syncHandler = createSyncHandler(), root = ROOT } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/sync') {
      if (request.method !== 'POST') {
        response.writeHead(405, { ...SECURITY_HEADERS, allow: 'POST', 'cache-control': 'no-store' });
        response.end('');
        return;
      }
      await syncHandler(request, response);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'route_not_found', message: 'Endpoint tidak dikenal.' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD', 'cache-control': 'no-store' });
      response.end('');
      return;
    }

    const filePath = resolveStaticPath(pathname, root);
    if (!filePath) {
      sendJson(response, 404, { error: 'not_found', message: 'Berkas tidak tersedia.' });
      return;
    }
    await sendFile(response, filePath, request);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 5173);
  createAppServer().listen(port, () => {
    console.log(`Sentiment Intelligence siap di http://localhost:${port}`);
  });
}
