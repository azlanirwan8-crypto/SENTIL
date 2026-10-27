// Server lokal untuk pratinjau produksi: menyajikan berkas statis hasil build dan
// meneruskan satu-satunya endpoint /api/sync ke handler yang sama dengan Vercel.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSyncHandler } from './api/sync.js';
import { createRefreshHandler } from './api/refresh.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Yang disajikan publik hanya hasil build; sumber server tidak berada di dalam folder ini.
const STATIC_ROOT = path.join(ROOT, 'public');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  // Sama dengan vercel.json: kalau keduanya berbeda, yang teruji di localhost bukan yang
  // terjadi di produksi.
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), display-capture=(), document-domain=(), encrypted-media=(), accelerometer=(), gyroscope=(), magnetometer=(), autoplay=(), picture-in-picture=(), sync-xhr=(self)',
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

const EXACT_FILES = new Set(['/index.html', '/app.js', '/styles.css', '/theme.js']);

export function resolveStaticPath(pathname, root = STATIC_ROOT) {
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
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
    return;
  }
  if (!info.isFile()) {
    response.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
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

export function createAppServer({ syncHandler = createSyncHandler(), refreshHandler = createRefreshHandler(), root = STATIC_ROOT } = {}) {
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

    // Jalur cron yang sama bisa dicoba lokal; tanpa CRON_SECRET di .env fungsi ini memang
    // menjawab 501, dan itu keadaan yang sebenarnya, bukan bug server lokal.
    if (pathname === '/api/refresh') {
      await refreshHandler(request, response);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'route_not_found', message: 'Unknown endpoint.' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD', 'cache-control': 'no-store' });
      response.end('');
      return;
    }

    const filePath = resolveStaticPath(pathname, root);
    if (!filePath) {
      sendJson(response, 404, { error: 'not_found', message: 'File not available.' });
      return;
    }
    await sendFile(response, filePath, request);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 5173);
  createAppServer().listen(port, () => {
    console.log(`Sentil ready at http://localhost:${port}`);
  });
}
