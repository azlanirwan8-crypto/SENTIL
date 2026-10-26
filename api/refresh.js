// Penarikan terjadwal. Vercel Cron memanggil URL ini dengan GET dan mengirim
// Authorization: Bearer <CRON_SECRET>; operator boleh memanggilnya sendiri untuk menyegarkan
// satu project. Kuncinya wajib: fungsi ini menarik data dari sumber publik dan menulis ke
// database, jadi ia tidak boleh pernah terbuka untuk siapa pun yang tahu alamatnya.
export const config = { maxDuration: 300 };

import { timingSafeEqual } from 'node:crypto';

import { createRefreshService, refreshConfiguration } from '../lib/refresh-core.mjs';

const WORKSPACE_ID = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_LIMIT = 20;

function bearer(headers = {}) {
  const raw = String(headers.authorization || '');
  return /^Bearer /i.test(raw) ? raw.slice(7).trim() : '';
}

// Perbandingan waktu-konstan, dan kunci yang berbeda panjangnya ditolak tanpa dibandingkan:
// fungsi ini dipanggil dari internet, jadi bentuk penolakan pun tidak boleh membocorkan.
export function accepted(headers, secret) {
  const presented = bearer(headers);
  if (!presented || !secret) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

function queryOf(url) {
  const workspace = String(url.searchParams.get('workspace') || '').trim();
  const limit = Number.parseInt(String(url.searchParams.get('limit') || '').trim(), 10);
  return {
    workspaceId: WORKSPACE_ID.test(workspace) ? workspace : null,
    askedWorkspace: workspace || null,
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : null,
    all: String(url.searchParams.get('all') || '') === 'true',
  };
}

export function createRefreshHandler(service = createRefreshService(), { env = process.env } = {}) {
  const gate = refreshConfiguration(env);
  return async function handler(request, response) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' });
      response.end('');
      return;
    }
    if (gate.requireAuth && !gate.secret) {
      json(response, 501, {
        error: 'cron_secret_missing',
        message: 'This scheduled pull is switched off because CRON_SECRET is not installed in the server environment. Set it in Vercel, then the cron job can run. No source was contacted and nothing stored was changed.',
      });
      return;
    }
    if (gate.requireAuth && !accepted(request.headers, gate.secret)) {
      json(response, 401, { error: 'unauthorized', message: 'The bearer token of this request does not match the scheduled-pull key.' });
      return;
    }
    const query = queryOf(new URL(request.url, `http://${request.headers.host || 'localhost'}`));
    if (query.askedWorkspace && !query.workspaceId) {
      json(response, 400, { error: 'workspace_invalid', message: 'The workspace identifier in the query is not a valid project id.' });
      return;
    }
    try {
      const result = await service.run({ workspaceId: query.workspaceId, limit: query.limit, all: query.all });
      // Ringkasan kecil ke log runtime: status per project, tanpa satu pun teks ulasan.
      console.log('[api/refresh]', JSON.stringify({
        ok: result.ok,
        considered: result.considered,
        counts: result.counts,
        elapsedMs: result.elapsedMs,
        results: (result.results || []).map(entry => ({ id: entry.workspaceId, status: entry.status, reviews: entry.reviews ?? null })),
      }));
      json(response, result.ok ? 200 : 502, result);
    } catch (error) {
      console.error('[api/refresh] kegagalan tak terduga:', error);
      json(response, 500, {
        error: 'internal_error',
        code: typeof error?.code === 'string' ? error.code : null,
        message: 'The scheduled pull stopped before it could finish. Snapshots already stored were not changed.',
      });
    }
  };
}

export default createRefreshHandler();
