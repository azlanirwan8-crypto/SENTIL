// Satu pintu API: penemuan identitas, penarikan data, status batas sumber, dan
// penyimpanan workspace di database. Tanpa login dan tanpa API key di peramban:
// gerbangnya adalah penolakan permintaan lintas situs agar kuota sumber tidak dipicu
// dari halaman lain, kuota per-pengunjung agar satu halaman pun tidak bisa menghabisinya
// sendirian, ditambah validasi masukan di server. Kunci database hanya hidup di
// environment fungsi ini.
export const config = { maxDuration: 300 };

import { SyncError, normalizeSocialTargets, summarizeDataset, syncService, ceilingMs, pullDeadline } from '../lib/sync-core.mjs';
import { database } from '../lib/db.mjs';
import { buildComparison } from '../lib/compare-engine.mjs';
import { storeResult } from '../lib/persist.mjs';
import { createQuota } from '../lib/rate-limit.mjs';
import { analyzeCorpus, ENGINE_VERSION } from '../lib/corpus-engine.mjs';

const BODY_LIMIT = 16384;
// Aksi yang membakar kuota sumber publik atau token model. Aksi baca (state, dataset, compare,
// limits, job) tidak dikenai kuota: murah, dan memblokirnya justru membuat dasbor tidak terbaca.
const QUOTA_ACTIONS = new Set(['sync', 'discover']);
// Cap 'running' yang lebih tua dari plafon + margin ini tidak akan pernah ditulis ulang:
// fungsinya sudah dimatikan platform. Menganggapnya masih hidup membuat peramban menunggu
// selamanya pada penarikan yang sebenarnya sudah mati.
const ABANDONED_MARGIN_MS = 60_000;
// Pull adalah aksi mahal. Di Vercel ia dipindahkan ke latar belakang (waitUntil) sehingga
// peramban menerima jawaban dalam hitungan milidetik dan menyambungnya lewat polling; di luar
// Vercel (server lokal, uji) tidak ada waitUntil, jadi penarikan tetap diselesaikan dalam
// permintaan. Deteksinya malas dan sekali saja — impor top-level bisa membuat berkas fungsi
// ini gagal dibangun di runtime yang tidak mengenal await tingkat modul.
let backgroundWaitUntil = null;

// waitUntil hanya dipakai kalau fungsi ini benar-benar berjalan di Vercel. Di server lokal, di
// uji, atau di host Node lain, penarikan tetap diselesaikan dalam permintaan — perilaku yang sama
// seperti sebelum lapisan asinkron ada, jadi tidak ada jalur tersembunyi yang tidak diuji.
async function loadWaitUntil(env = process.env) {
  if (!env.VERCEL && !env.VERCEL_ENV) return null;
  if (backgroundWaitUntil !== null) return backgroundWaitUntil;
  try {
    const module = await import('@vercel/functions');
    backgroundWaitUntil = typeof module?.waitUntil === 'function' ? module.waitUntil : false;
  } catch {
    backgroundWaitUntil = false;
  }
  return backgroundWaitUntil;
}

// Pengaman baca data lama: kalau snapshot sebelumnya tidak bisa dibaca, penarikan berjalan
// penuh seperti sebelum ada cache inkremental — lebih lambat daripada kehilangan baris.
async function readIncremental(db, workspaceId, force) {
  if (!db.enabled || !workspaceId || force) return { since: null, carry: null, note: 'full pull requested' };
  try {
    const cursor = await db.reviewCursor(workspaceId);
    if (!cursor || !Object.keys(cursor.platforms || {}).length) return { since: null, carry: null, note: 'no stored watermark yet' };
    const stored = await db.loadDataset(workspaceId);
    const carry = Array.isArray(stored?.reviews) && stored.reviews.length ? stored.reviews : null;
    if (!carry) return { since: null, carry: null, note: 'stored rows could not be read' };
    return { since: cursor.platforms, carry, note: `incremental from ${Object.entries(cursor.platforms).map(([id, at]) => `${id} ${at}`).join(', ')} over ${carry.length} stored rows` };
  } catch (error) {
    return { since: null, carry: null, note: `incremental cache unavailable (${String(error?.message || error).slice(0, 120)})` };
  }
}

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

export function createSyncHandler(service = syncService, { db = database, quota = createQuota({ db }), env = process.env, waitUntil = null } = {}) {
  async function note(run) {
    if (!db.enabled) return;
    try { await db.logRun(run); } catch { /* riwayat tidak boleh menggagalkan penarikan */ }
  }

  // Satu pekerjaan penarikan: baca penanda inkremental, tarik, analisis, simpan. Dipakai baik
  // oleh jalur latar belakang (Vercel) maupun jalur inline (server lokal / uji), jadi hanya ada
  // satu urutan kerja untuk keduanya.
  async function runPullJob(args, workspace, { jobId = null } = {}) {
    const startedAt = Date.now();
    const deadlineAt = pullDeadline({ startedAt, env });
    const { since, carry, note: cacheNote } = await readIncremental(db, workspace?.id, args.force);
    // Cap 'running' hanya ditulis kalau pekerjaan ini benar-benar punya project: tanpa identitas,
    // tidak ada yang bisa mem-polling dan baris tanpa workspace_id hanya mengotori riwayat.
    if (workspace?.id) await note({ workspaceId: workspace.id, entity: args.entity, status: 'running', reviews: null, channels: null, error: cacheNote, elapsedMs: null });
    try {
      const result = await service.sync({ ...args, since, carry, deadlineAt });
      const stored = await storeResult(db, workspace, result);
      return { ...result, stored, jobId, incremental: { ...(result.incremental || {}), note: cacheNote } };
    } catch (error) {
      if (workspace?.id) {
        await note({
          workspaceId: workspace.id,
          entity: args.entity,
          status: 'error',
          reviews: null,
          channels: null,
          error: String(error?.message || error).slice(0, 300),
          elapsedMs: Date.now() - startedAt,
        });
      }
      throw error;
    }
  }

  // Hitung ulang tanpa menyentuh sumber: baris yang sudah tersimpan dianalisis lagi oleh mesin
  // versi sekarang. Inilah jalur yang membersihkan analisis lama yang tercemar tanpa perlu
  // menarik ulang 69.000 ulasan, dan tanpa mengubah satu baris teks ulasan pun.
  async function recomputeStored(workspaceId) {
    if (!db.enabled) throw new SyncError('db_unavailable', 'The database is not configured on this server, so there is nothing to recompute.', 400);
    const probe = await db.status();
    if (!probe.reachable) return { action: 'recompute', db: probe, workspaceId, recomputed: false, message: 'The database is not reachable, so nothing was recomputed.' };
    const stored = await db.loadDataset(workspaceId);
    if (!stored || !Array.isArray(stored.reviews) || !stored.reviews.length) {
      throw new SyncError('dataset_missing', 'This project has no stored reviews to recompute. Pull it once first.', 400);
    }
    const [workspaces] = await Promise.all([db.listWorkspaces()]);
    const workspace = workspaces.find(entry => entry.id === workspaceId);
    if (!workspace) throw new SyncError('workspace_missing', 'The project record could not be found.', 400);
    const listing = [...new Set((Array.isArray(stored.channels) ? stored.channels : []).map(channel => channel?.app?.listing).filter(Boolean))].join('\n');
    const startedAt = Date.now();
    const raw = stored.reviews.map(({ analysis, ...rest }) => rest);
    const { rows, model } = analyzeCorpus(raw, { generatedAt: stored.fetchedAt || new Date().toISOString(), listing, entity: stored.entity || workspace.entity || '' });
    // Korpus 69.000 baris dipegang tiga kali pada titik ini (bahan mentah, hasil analisis, dan
    // salinan penyimpanan). Salinan mentah tidak dibutuhkan lagi setelah model terbentuk, jadi
    // dilepas sebelum tulisan dimulai — fungsi serverless punya langit-langit memori, dan
    // menghitung ulang bukan alasan untuk memakainya dua kali lebih besar.
    raw.length = 0;
    stored.reviews = [];
    const rebuilt = {
      ...stored,
      engine: {
        ...(stored.engine || {}),
        version: ENGINE_VERSION,
        dictionary: model.taxonomy?.version || 'none',
        dictionaryScope: 'topic names only — weights, phrase labels, and every count are learned from this corpus',
        languages: model.languages?.version || null,
        recomputedAt: new Date().toISOString(),
      },
      model,
      reviews: rows,
      summary: summarizeDataset(rows, model, Array.isArray(stored.channels) ? stored.channels : []),
    };
    const saved = await db.saveSnapshot({ workspace, dataset: rebuilt });
    await note({
      workspaceId,
      entity: rebuilt.entity,
      status: 'recomputed',
      reviews: rows.length,
      channels: (Array.isArray(stored.channels) ? stored.channels : []).map(channel => ({ id: channel.id, status: channel.status, fetched: channel.fetched })),
      error: null,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      action: 'recompute',
      ok: true,
      db: probe,
      workspaceId,
      recomputed: true,
      rows: rows.length,
      revision: saved.revision,
      elapsedMs: Date.now() - startedAt,
      engine: { version: ENGINE_VERSION, taxonomy: model.taxonomy?.version, languages: model.languages?.version },
      topics: model.topics.map(topic => ({ id: topic.id, name: topic.name, low: topic.low })),
      message: `${rows.length} stored reviews were re-analysed with ${ENGINE_VERSION}. No source was contacted and no review text was changed.`,
    };
  }

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
        const args = {
          entity: payload.entity,
          playAppId: payload.playAppId,
          appleAppId: payload.appleAppId,
          social,
          force,
        };
        const hold = typeof waitUntil === 'function' ? waitUntil : await loadWaitUntil(env);
        if (hold) {
          // Jawaban keluar dulu, pekerjaan jalan di belakang. Peramban menyambungkan statusnya
          // lewat aksi "job" — tidak ada lagi permintaan HTTP yang menggantung 90+ detik.
          const jobId = `${workspace?.id || 'anonymous'}:${Date.now()}`;
          hold(runPullJob(args, workspace, { jobId }).catch(error => {
            if (error instanceof SyncError || Number.isInteger(error?.status)) return;
            console.error('[api/sync] kegagalan pekerjaan latar belakang:', error);
          }));
          json(response, 202, {
            action: 'sync',
            accepted: true,
            jobId,
            workspaceId: workspace?.id || null,
            pollingMs: 4000,
            message: 'The pull is running on the server. Stored data is untouched until it finishes; poll "job" for this project for the status.',
          });
          return;
        }
        json(response, 200, await runPullJob(args, workspace, { jobId: null }));
        return;
      }
      if (payload.action === 'job') {
        const probe = await db.status();
        const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
        if (!probe.reachable || !WORKSPACE_ID.test(workspaceId)) {
          json(response, 200, { action: 'job', db: probe, workspaceId, run: null });
          return;
        }
        const stored = await db.latestRun(workspaceId);
        const born = Date.parse(stored?.createdAt || '');
        // Status 'running' yang umurnya sudah lewat plafon fungsi tidak akan pernah selesai:
        // fungsinya sudah dipotong platform. Ia dilaporkan apa adanya supaya klien berhenti
        // menunggu dan data lama yang tersimpan tetap terbaca.
        const abandoned = stored?.status === 'running' && Number.isFinite(born)
          && Date.now() - born > ceilingMs(env) + ABANDONED_MARGIN_MS;
        const run = abandoned
          ? { ...stored, status: 'abandoned', error: 'The server reached its platform time limit while this pull was running, so nothing was written and the stored snapshot was left untouched. Pull again — the pages already cached make the next run shorter.' }
          : stored;
        json(response, 200, {
          action: 'job',
          db: probe,
          workspaceId,
          pending: run?.status === 'running',
          finished: run ? run.status !== 'running' : false,
          abandoned,
          run,
        });
        return;
      }
      if (payload.action === 'recompute') {
        const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
        if (!WORKSPACE_ID.test(workspaceId)) throw new SyncError('workspace_invalid', 'A project ID is required to recompute its analysis.', 400);
        json(response, 200, await recomputeStored(workspaceId));
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
      throw new SyncError('action_invalid', 'The action must be "discover", "sync", "recompute", "job", "limits", "limits-reset", "state", "dataset", "compare", "workspace-save", or "workspace-delete".');
    } catch (error) {
      if (error instanceof SyncError || (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500)) {
        json(response, error.status || 400, { error: error.code || 'request_invalid', message: error.message });
        return;
      }
      console.error('[api/sync] kegagalan tak terduga:', error);
      // Tahap dan alasannya ikut dikirim supaya yang memasang tahu apa yang harus disetel;
      // isi jawaban database (yang bisa memuat isi baris) tetap tidak keluar ke peramban.
      json(response, 500, {
        error: 'internal_error',
        code: typeof error?.code === 'string' ? error.code : null,
        stage: typeof error?.stage === 'string' ? error.stage : null,
        reason: typeof error?.message === 'string' ? error.message.slice(0, 240) : null,
        message: 'The server could not complete this request. Nothing was changed and no stored data was removed; please try again.',
      });
    }
  };
}

export default createSyncHandler();
