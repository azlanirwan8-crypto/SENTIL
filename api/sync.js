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
import { projectDataset } from '../lib/dataset-view.mjs';
import { pullProgress, percentOf } from '../lib/pull-progress.mjs';
import { ANALYST_VERSION, analyseComparison, analyseCorpus } from '../lib/ai-analyst.mjs';
import { createQuota } from '../lib/rate-limit.mjs';
import { analyzeCorpus, ENGINE_VERSION } from '../lib/corpus-engine.mjs';

const BODY_LIMIT = 16384;
// Aksi yang membakar kuota sumber publik atau token model. Aksi baca (state, dataset, limits,
// job) tidak dikenai kuota: murah, dan memblokirnya justru membuat dasbor tidak terbaca. Compare
// juga tidak — tetapi ia kini membayar satu panggilan model untuk bacaan lintas project, jadi
// waktunya dibatasi lebih ketat daripada penarikan: matriksnya sudah dihitung mesin dan selalu
// dikirim, yang boleh menunggu hanyalah kalimat pembacanya.
const QUOTA_ACTIONS = new Set(['sync', 'discover']);
const COMPARE_READ_TIMEOUT_MS = 30_000;
// Seberapa sering progres penarikan boleh menyentuh database. Peramban bertanya tiap 2 detik, jadi
// lebih sering dari ini hanya menambah permintaan tanpa angka baru untuk dibaca.
const PROGRESS_FLUSH_MS = 2_000;
// 'storing' ditulis sesaat sebelum potongan baris dikirim ke database. Tanpa cap itu, penarikan
// yang mati karena plafon waktu di tengah penyimpanan tidak meninggalkan jejak berapa lama tarik
// dan analisis memakan waktu — dan itu justru tahap yang perlu diukur.
const PENDING_STATUSES = new Set(['running', 'storing']);
// Fase terakhir yang bisa dibaca dari cap status saja, untuk polling yang tidak menemukan catatan
// progres (kolom progress belum dipasang di database, atau penarikan dimulai sebelum catatan itu
// ada). Cap status itu nyata, jadi fasenya nyata — persennya tidak, dan karena itu tidak dikirim.
const STATUS_PHASE = { running: 'fetch', storing: 'write', ok: 'done', empty: 'done', unchanged: 'done', recomputed: 'done', error: 'failed' };

// Catatan progres minimum dari cap status saja. Persennya dihitung oleh fungsi yang sama seperti
// catatan hidup, jadi aturan yang sama berlaku: tanpa penyebut yang terukur, tidak ada angka yang
// dikirim ke peramban.
function progressFromRun(run) {
  const record = {
    phase: STATUS_PHASE[run.status] || 'fetch',
    rows: Number(run.reviews) || 0,
    channels: Array.isArray(run.channels)
      ? run.channels.map(channel => ({ id: channel.id, status: channel.status, rows: Number(channel.fetched) || 0, pages: 0 }))
      : [],
    stages: [],
    chunks: { done: 0, total: 0 },
  };
  return { ...record, ...percentOf(record), source: 'run status' };
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

export function createSyncHandler(service = syncService, { db = database, quota = createQuota({ db }), env = process.env } = {}) {
  async function note(run) {
    if (!db.enabled) return null;
    try { return await db.logRun(run); } catch { return null; /* riwayat tidak boleh menggagalkan penarikan */ }
  }

  // Satu pekerjaan penarikan: baca penanda inkremental, tarik, analisis, simpan. Dipakai baik
  // oleh jalur latar belakang (Vercel) maupun jalur inline (server lokal / uji), jadi hanya ada
  // satu urutan kerja untuk keduanya.
  async function runPullJob(args, workspace) {
    const startedAt = Date.now();
    const deadlineAt = pullDeadline({ startedAt, env });
    const { since, carry, note: cacheNote } = await readIncremental(db, workspace?.id, args.force);
    // Kunci progres = project: peramban mem-polling lewat workspaceId, dan satu project tidak
    // pernah punya dua penarikan yang berjalan bersamaan.
    const progressKey = workspace?.id || `inline:${startedAt}`;
    pullProgress.begin(progressKey, { workspaceId: workspace?.id || null, entity: args.entity });
    let runRowId = null;
    let lastFlush = 0;
    // Progres ditulis ke baris riwayat yang sama supaya instance lain bisa menjawab polling.
    // Ditahap 2 detik: 51.000 baris punya puluhan peristiwa, dan tiap peristiwa tidak perlu jadi
    // permintaan database. Kegagalan tulisnya diabaikan di lib/db.mjs — persen tidak boleh
    // menggagalkan penarikan.
    const flush = () => {
      if (!db.enabled || !runRowId || typeof db.updateRunProgress !== 'function') return;
      const record = pullProgress.get(progressKey);
      if (!record) return;
      const at = Date.now();
      if (at - lastFlush < PROGRESS_FLUSH_MS) return;
      lastFlush = at;
      void db.updateRunProgress(runRowId, {
        phase: record.phase,
        rows: record.rows,
        channels: record.channels,
        stages: record.stages,
        chunks: record.chunks,
        phasePercent: record.phasePercent,
        overallPercent: record.overallPercent,
        elapsedMs: at - record.startedAt,
        at: new Date(at).toISOString(),
      });
    };
    const onProgress = event => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'channel') pullProgress.channel(progressKey, event.channel || {});
      else if (event.type === 'analyse') pullProgress.update(progressKey, { phase: 'analyse', rows: event.rows || 0 });
      else if (event.type === 'stage') {
        const record = pullProgress.get(progressKey);
        pullProgress.update(progressKey, { stages: [...(record?.stages || []), event.stage] });
      }
      flush();
    };
    const onChunk = chunk => {
      pullProgress.update(progressKey, { phase: 'write', chunks: { done: chunk.done, total: chunk.total }, rows: chunk.rows ?? pullProgress.get(progressKey)?.rows ?? 0 });
      lastFlush = 0;
      flush();
    };
    // Cap 'running' hanya ditulis kalau pekerjaan ini benar-benar punya project: tanpa identitas,
    // tidak ada yang bisa mem-polling dan baris tanpa workspace_id hanya mengotori riwayat.
    if (workspace?.id) runRowId = await note({ workspaceId: workspace.id, entity: args.entity, status: 'running', reviews: null, channels: null, error: cacheNote, elapsedMs: null });
    try {
      const result = await service.sync({ ...args, since, carry, deadlineAt, onProgress });
      if (workspace?.id) {
        await note({
          workspaceId: workspace.id,
          entity: args.entity,
          status: 'storing',
          reviews: Array.isArray(result.reviews) ? result.reviews.length : result.incremental?.carried ?? null,
          channels: Array.isArray(result.channels) ? result.channels.map(channel => ({ id: channel.id, status: channel.status, fetched: channel.fetched })) : null,
          error: null,
          elapsedMs: Date.now() - startedAt,
        });
      }
      const stored = await storeResult(db, workspace, result, { onChunk });
      pullProgress.finish(progressKey, 'done');
      lastFlush = 0;
      flush();
      // Jawaban inline (server lokal, uji) memakai bentuk yang sama seperti aksi `dataset`:
      // kolom yang tidak dibaca layar tidak diberangkatkan, tapi yang tersimpan tetap utuh.
      return { ...projectDataset(result), stored, incremental: { ...(result.incremental || {}), note: cacheNote } };
    } catch (error) {
      pullProgress.finish(progressKey, 'failed');
      lastFlush = 0;
      flush();
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
    // Hitung ulang juga menjalankan lapisan analis, supaya "Re-run analysis" bisa mengganti nama
    // label DAN menulis bacaan panel tanpa menyentuh sumber mana pun. State-nya selalu dicatat —
    // termasuk "tidak ada yang bisa dibaca" — supaya panel tidak pernah bilang snapshot ini tidak
    // punya catatan. Tanpa kunci atau saat panggilan gagal, seluruh panel jatuh ke teks mesin.
    model.ai = {
      version: ANALYST_VERSION,
      at: model.generatedAt || new Date().toISOString(),
      ...(await analyseCorpus(model, { env })),
    };
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
        // Penarikan diselesaikan DI DALAM permintaan. Jalur latar belakang (waitUntil + 202)
        // pernah dipasang dan diukur dua kali pada 27 Oktober atas korpus 51.682 dan 54.832
        // ulasan: keduanya berhenti di tengah fase tulis (potongan 48 dari 55) tanpa pernah
        // memindahkan penanda revisi dan tanpa menulis cap selesai — instance function dibekukan
        // setelah respons keluar, dan pekerjaan yang tidak terlihat tidak bisa diandalkan.
        // Di dalam permintaan, plafon maxDuration berlaku penuh; itu jalur yang dulu menuntaskan
        // 69.356 ulasan. Progres tetap hidup: baris 'running'/'storing' ditulis di dalam request
        // yang sama dan peramban membacanya lewat aksi "job" sementara permintaan ini berjalan.
        json(response, 200, await runPullJob(args, workspace));
        return;
      }
      if (payload.action === 'job') {
        const probe = await db.status();
        const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
        if (!probe.reachable || !WORKSPACE_ID.test(workspaceId)) {
          json(response, 200, { action: 'job', db: probe, workspaceId, run: null });
          return;
        }
        // Baris riwayat dibaca tanpa aturan umur: `created_at` datang dari timezone sesi database
        // (instalasi ini mengirim 03:51 ketika UTC sedang 11:51), jadi membandingkannya dengan jam
        // fungsi selalu salah — penarikan yang baru saja mulai langsung dinyatakan mati oleh
        // plafon platform, dan itu kegagalan yang diukur di produksi, bukan teori.
        const stored = await db.latestRun(workspaceId);
        // Progres dibaca dari memori instance ini kalau ada; kalau polling mendarat di instance
        // lain, yang dipakai adalah snapshot terakhir yang tersimpan di baris riwayat. Tanpa
        // keduanya, klien tetap mendapat fase dan jumlah baris dari cap status — tanpa persen,
        // bukan dengan persen karangan.
        const live = pullProgress.get(workspaceId);
        const progress = live
          ? { ...live, source: 'this instance' }
          : stored?.progress
            ? { ...stored.progress, source: 'run history' }
            : stored ? progressFromRun(stored) : null;
        json(response, 200, {
          action: 'job',
          db: probe,
          workspaceId,
          pending: PENDING_STATUSES.has(stored?.status),
          finished: stored ? !PENDING_STATUSES.has(stored.status) : false,
          progress,
          run: stored,
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
        json(response, 200, { action: 'dataset', db: probe, workspaceId, dataset: projectDataset(await db.loadDataset(workspaceId)) });
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
        const matrix = buildComparison({ workspaces: selected, datasets: byId });
        // Satu panggilan untuk bacaan lintas project. Aksi ini adalah aksi baca, jadi waktunya
        // dibatasi lebih ketat daripada penarikan: matriks dan seluruh selnya sudah dihitung mesin
        // dan selalu dikirim walau model tidak menjawab.
        matrix.ai = {
          version: ANALYST_VERSION,
          at: matrix.generatedAt,
          ...(await analyseComparison(matrix, { env, timeoutMs: COMPARE_READ_TIMEOUT_MS })),
        };
        json(response, 200, { ...matrix, db: probe });
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
