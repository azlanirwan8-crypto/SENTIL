// Satu pintu API untuk penemuan identitas dan penarikan data. Tanpa login dan tanpa
// API key: gerbangnya adalah penolakan permintaan lintas situs agar kuota sumber
// tidak dipicu dari halaman lain, ditambah validasi masukan di server.
export const config = { maxDuration: 60 };

import { SyncError, syncService } from '../lib/sync-core.mjs';

const BODY_LIMIT = 16384;

const json = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

export function rejectsSameSiteCheck(headers = {}) {
  const host = String(headers['x-forwarded-host'] || headers.host || '');
  const scheme = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const origin = String(headers.origin || '');
  const site = String(headers['sec-fetch-site'] || '');
  if (!host || site === 'cross-site' || site === 'none') return true;
  if (origin) return ![`${scheme}://${host}`, `https://${host}`, `http://${host}`].includes(origin);
  return site !== 'same-origin';
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new SyncError('body_too_large', 'Permintaan melebihi batas ukuran.', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) throw new SyncError('body_required', 'Permintaan tanpa isi JSON.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value;
  } catch {
    throw new SyncError('body_invalid', 'Isi permintaan bukan JSON objek yang sah.');
  }
}

export function createSyncHandler(service = syncService) {
  return async function handler(request, response) {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
      response.end('');
      return;
    }
    if (rejectsSameSiteCheck(request.headers)) {
      json(response, 403, { error: 'cross_site', message: 'Permintaan lintas situs ditolak.' });
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      json(response, error.status || 400, { error: error.code || 'body_invalid', message: error.message });
      return;
    }
    try {
      const force = payload.force === true;
      if (payload.action === 'discover') {
        json(response, 200, await service.discover(payload.entity, { force }));
        return;
      }
      if (payload.action === 'sync') {
        json(response, 200, await service.sync({
          entity: payload.entity,
          playAppId: payload.playAppId,
          appleAppId: payload.appleAppId,
          force,
        }));
        return;
      }
      throw new SyncError('action_invalid', 'Aksi harus "discover" atau "sync".');
    } catch (error) {
      if (error instanceof SyncError || (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500)) {
        json(response, error.status || 400, { error: error.code || 'request_invalid', message: error.message });
        return;
      }
      console.error('[api/sync] kegagalan tak terduga:', error);
      json(response, 500, { error: 'internal_error', message: 'Penarikan gagal karena kesalahan internal. Data lama tetap tersimpan di peramban; silakan coba lagi.' });
    }
  };
}

export default createSyncHandler();
