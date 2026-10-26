// Satu pintu API: penemuan identitas, penarikan data, status batas sumber, dan
// penyimpanan workspace di database. Tanpa login dan tanpa API key di peramban:
// gerbangnya adalah penolakan permintaan lintas situs agar kuota sumber tidak dipicu
// dari halaman lain, kuota per-pengunjung agar satu halaman pun tidak bisa menghabisinya
// sendirian, ditambah validasi masukan di server. Kunci database hanya hidup di
// environment fungsi ini.
export const config = { maxDuration: 300 };

import { SyncError, normalizeSocialTargets, syncService } from '../lib/sync-core.mjs';
import { database } from '../lib/db.mjs';
import { buildComparison } from '../lib/compare-engine.mjs';
import { storeResult } from '../lib/persist.mjs';
import { createQuota } from '../lib/rate-limit.mjs';

const BODY_LIMIT = 16384;
// Aksi yang membakar kuota sumber publik atau token model. Aksi baca (state, dataset,
// compare, limits) tidak dikenai kuota: murah, dan memblokirnya justru membuat
// dasbor tidak bisa dibaca.
const QUOTA_ACTIONS = new Set(['sync', 'discover']);

const json = (response, status, body, extra = {}) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
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
    if (size > BODY_LIMIT) throw new SyncError('body_too_large', 'The request exceeds the size limit.', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) throw new SyncError('body_required', 'The request has no JSON body.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value;
  } catch {
    throw new SyncError('body_invalid', 'The request body is not a valid JSON object.');
  }
}

const WORKSPACE_ID = /^[A-Za-z0-9_-]{4,64}$/;
// Anggaran kolom matriks, bukan batas analisis: di atas ini tabelnya sendiri yang tidak lagi
// terbaca, dan satu permintaan akan membawa terlalu banyak kepala dataset sekaligus.
const COMPARE_MAX = 12;

function workspaceIdsFrom(value) {
  const ids = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (!WORKSPACE_ID.test(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= COMPARE_MAX) break;
  }
  return ids;
}
const STORE_IDS = ['play', 'appstore'];

function textOf(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Bentuk workspace diterima apa adanya dari peramban, jadi dibatasi ke kolom yang
// memang boleh disimpan. Kunci apa pun tidak punya tempat di sini.
function workspaceFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = typeof value.id === 'string' && WORKSPACE_ID.test(value.id) ? value.id : null;
  const label = textOf(value.label, 60);
  const entity = textOf(value.entity, 80);
  if (!id || label.length < 2 || entity.length < 2) return null;
  const stores = {};
  for (const store of STORE_IDS) {
    const entry = value.stores?.[store];
    if (!entry || typeof entry !== 'object') continue;
    const appId = textOf(entry.appId, 64);
    if (!appId) continue;
    stores[store] = {
      appId,
      title: textOf(entry.title, 200) || null,
      developer: textOf(entry.developer, 200) || null,
      url: /^https:\/\//.test(String(entry.url || '')) ? String(entry.url).slice(0, 400) : null,
    };
  }
  const stamp = value => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);
  return {
    id,
    label,
    entity,
    stores,
    channels: normalizeSocialTargets(value.channels),
    createdAt: stamp(value.createdAt),
    updatedAt: stamp(value.updatedAt),
    lastSyncedAt: stamp(value.lastSyncedAt),
  };
}

export function createSyncHandler(service = syncService, { db = database, quota = createQuota({ db }) } = {}) {
  return async function handler(request, response) {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
      response.end('');
      return;
    }
    if (rejectsSameSiteCheck(request.headers)) {
      json(response, 403, { error: 'cross_site', message: 'Cross-site request refused.' });
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
      // Target kanal sosial dinormalisasi ulang di sync-core; permintaan tidak pernah
      // bisa membawa token atau kunci, hanya flag aktif dan target yang sah bentuknya.
      const social = payload.social && typeof payload.social === 'object' && !Array.isArray(payload.social) ? payload.social : {};
      if (QUOTA_ACTIONS.has(payload.action)) {
        // Setelah isi permintaan sah, baru jatah diambil: permintaan yang cacat bentuk
        // tidak boleh menghabiskan kuota pengunjung.
        const verdict = await quota.take(payload.action, quota.key(request.headers));
        if (!verdict.allowed) {
          json(response, 429, {
            error: 'quota_exceeded',
            action: payload.action,
            limit: verdict.limit,
            window: verdict.window,
            windowSeconds: verdict.windowSeconds,
            resetAt: verdict.resetAt,
            message: `This visitor has used all ${verdict.limit} "${payload.action}" runs allowed per ${verdict.window}. No pull was sent and stored data was not changed — try again after ${verdict.resetAt}.`,
          }, { 'retry-after': String(verdict.retryAfterSeconds) });
          return;
        }
      }
      if (payload.action === 'discover') {
        json(response, 200, await service.discover(payload.entity, { force }));
        return;
      }
      if (payload.action === 'sync') {
        const workspace = workspaceFrom(payload.workspace);
        const result = await service.sync({
          entity: payload.entity,
          playAppId: payload.playAppId,
          appleAppId: payload.appleAppId,
          social,
          force,
        });
        json(response, 200, { ...result, stored: await storeResult(db, workspace, result) });
        return;
      }
      if (payload.action === 'state') {
        const probe = await db.status();
        json(response, 200, {
          action: 'state',
          db: probe,
          workspaces: probe.reachable ? await db.listWorkspaces() : [],
        });
        return;
      }
      if (payload.action === 'dataset') {
        const probe = await db.status();
        const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
        if (!probe.reachable) {
          json(response, 200, { action: 'dataset', db: probe, workspaceId, dataset: null });
          return;
        }
        json(response, 200, { action: 'dataset', db: probe, workspaceId, dataset: await db.loadDataset(workspaceId) });
        return;
      }
      if (payload.action === 'compare') {
        const probe = await db.status();
        const ids = workspaceIdsFrom(payload.workspaceIds);
        if (ids.length < 2) {
          throw new SyncError('compare_targets_invalid', 'Select at least two stored projects to compare.', 400);
        }
        if (!probe.reachable) {
          json(response, 200, { action: 'compare', db: probe, projects: [], rows: [], painPoints: [], leaderboard: [], caveats: [] });
          return;
        }
        // Urutan kolom mengikuti urutan permintaan, jadi pembaca mengendalikan tata letaknya.
        const [heads, workspaces] = await Promise.all([db.loadDatasetHeads(ids), db.listWorkspaces()]);
        const byId = Object.fromEntries(heads.map(head => [head.workspaceId, head]));
        const selected = ids.map(id => {
          const found = workspaces.find(workspace => workspace.id === id);
          return found || { id, label: id, entity: byId[id]?.entity || null };
        });
        json(response, 200, { ...buildComparison({ workspaces: selected, datasets: byId }), db: probe });
        return;
      }
      if (payload.action === 'workspace-save') {
        const probe = await db.status();
        const workspace = workspaceFrom(payload.workspace);
        if (!probe.reachable || !workspace) {
          json(response, 200, { action: 'workspace-save', db: probe, workspace: null });
          return;
        }
        await db.saveWorkspace(workspace);
        json(response, 200, { action: 'workspace-save', db: probe, workspace });
        return;
      }
      if (payload.action === 'workspace-delete') {
        const probe = await db.status();
        const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
        if (!probe.reachable || !WORKSPACE_ID.test(workspaceId)) {
          json(response, 200, { action: 'workspace-delete', db: probe, workspaceId, deleted: false });
          return;
        }
        await db.deleteWorkspace(workspaceId);
        json(response, 200, { action: 'workspace-delete', db: probe, workspaceId, deleted: true });
        return;
      }
      if (payload.action === 'limits') {
        json(response, 200, service.limits({
          entity: payload.entity,
          playAppId: payload.playAppId,
          appleAppId: payload.appleAppId,
          social,
        }));
        return;
      }
      if (payload.action === 'limits-reset') {
        json(response, 200, service.resetLimits({
          entity: payload.entity,
          playAppId: payload.playAppId,
          appleAppId: payload.appleAppId,
          social,
        }));
        return;
      }
      throw new SyncError('action_invalid', 'The action must be "discover", "sync", "limits", "limits-reset", "state", "dataset", "compare", "workspace-save", or "workspace-delete".');
    } catch (error) {
      if (error instanceof SyncError || (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500)) {
        json(response, error.status || 400, { error: error.code || 'request_invalid', message: error.message });
        return;
      }
      console.error('[api/sync] kegagalan tak terduga:', error);
      // Kode saja, bukan pesan internal: log runtime tidak selalu bisa dibaca dari luar,
      // dan detail database tidak boleh keluar ke peramban.
      json(response, 500, {
        error: 'internal_error',
        code: typeof error?.code === 'string' ? error.code : null,
        message: 'The server could not complete this request. Nothing was changed and no stored data was removed; please try again.',
      });
    }
  };
}

export default createSyncHandler();
