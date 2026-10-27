import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncHandler } from '../api/sync.js';
import { TOPICS } from '../lib/domain-taxonomy.mjs';

const dictionaryLabels = new Set(TOPICS.flatMap(topic => [topic.label, topic.labelId]));

function fakeRequest(body) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    method: 'POST',
    headers: { host: 'analisa.example', 'sec-fetch-site': 'same-origin' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function fakeResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers || {}; },
    end(chunk) { if (chunk) this.body += chunk; },
    json() { return this.body ? JSON.parse(this.body) : null; },
  };
}

async function run(handler, body) {
  const response = fakeResponse();
  await handler(fakeRequest(body), response);
  return response;
}

const WORKSPACE = {
  id: 'ws-1',
  label: 'Audit',
  entity: 'aud',
  stores: { play: { appId: 'com.aud', title: 'Aud', url: 'https://play.google.com/x' } },
  channels: {},
};

function stubService(syncResult) {
  const calls = [];
  return {
    calls,
    sync: async payload => {
      calls.push(payload);
      return syncResult || { action: 'sync', ok: true, entity: 'aud', fetchedAt: '2026-10-02T00:00:00.000Z', reviews: [], channels: [], summary: {} };
    },
  };
}

function fakeDb(overrides = {}) {
  const seen = [];
  return {
    enabled: true,
    reason: null,
    seen,
    async status() { return { enabled: true, reachable: true, reason: null }; },
    async listWorkspaces() { seen.push('list'); return [{ ...WORKSPACE, snapshot: null, lastSyncedAt: '2026-10-01T00:00:00.000Z' }]; },
    async loadDataset(id) { seen.push(`load:${id}`); return { entity: 'aud', reviews: [], channels: [], model: {}, summary: {} }; },
    async saveWorkspace(workspace) { seen.push(`save:${workspace.id}`); },
    async saveSnapshot({ workspace, dataset }) { seen.push(`snap:${workspace.id}:${dataset.reviews.length}`); return { revision: 3, stored: dataset.reviews.length, elapsedMs: 12 }; },
    async logRun(run) { seen.push(`run:${run.status}:${run.reviews}`); },
    async reviewCursor(id) { seen.push(`cursor:${id}`); return null; },
    async latestRun(id) {
      seen.push(`job:${id}`);
      return overrides.runRow || { id: 9, status: 'running', reviews: null, channels: null, error: null, elapsedMs: null, createdAt: new Date(Date.now() - 5_000).toISOString() };
    },
    ...overrides,
  };
}

describe('penarikan asinkron dan cache inkremental', () => {
  test('aksi job membaca status pekerjaan terakhir', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, { action: 'job', workspaceId: 'ws-1' })).json();
    assert.equal(body.action, 'job');
    assert.equal(body.pending, true);
    assert.equal(body.finished, false);
    assert.equal(body.run.status, 'running');
    assert.deepEqual(db.seen, ['job:ws-1']);
  });

  test('cap storing masih pekerjaan berjalan, bukan selesai', async () => {
    const db = fakeDb({ runRow: { id: 11, status: 'storing', reviews: 4000, channels: [], error: null, elapsedMs: 96_000, createdAt: new Date(Date.now() - 96_000).toISOString() } });
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, { action: 'job', workspaceId: 'ws-1' })).json();
    assert.equal(body.pending, true);
    assert.equal(body.finished, false);
    assert.equal(body.run.reviews, 4000, 'jumlah baris yang sedang disimpan terlihat sejak sebelum tulisan selesai');
  });

  test('progres tetap terukur dari cap status walau kolom riwayat progres belum ada', async () => {
    // Kolom progress jsonb adalah tambahan baru; database yang belum memilikinya tidak boleh
    // membuat layar progres kembali jadi buta. Fase dan jumlah baris dibaca dari cap status —
    // persennya memang tidak ada, jadi tidak dikirim.
    const db = fakeDb({ runRow: { id: 12, status: 'storing', reviews: 51_532, channels: [{ id: 'play', status: 'success', fetched: 40_000 }, { id: 'appstore', status: 'partial', fetched: 11_532 }], error: null, elapsedMs: 96_000, createdAt: new Date(Date.now() - 96_000).toISOString() } });
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, { action: 'job', workspaceId: 'ws-1' })).json();
    assert.equal(body.progress.source, 'run status');
    assert.equal(body.progress.phase, 'write');
    assert.equal(body.progress.rows, 51_532);
    assert.deepEqual(body.progress.channels, [
      { id: 'play', status: 'success', rows: 40_000, pages: 0 },
      { id: 'appstore', status: 'partial', rows: 11_532, pages: 0 },
    ]);
    assert.equal(body.progress.overallPercent, null, 'tanpa pekerjaan yang terukur, tidak ada persen yang dikirim');
  });

  test('cap running yang umurnya lewat plafon fungsi dilaporkan sebagai pekerjaan yang ditinggalkan', async () => {
    // Inilah kegagalan yang terukur di produksi: penarikan 50.000+ ulasan dipotong platform
    // tepat di 300 detik dan cap 'running' tidak pernah ditulis ulang. Tanpa aturan ini,
    // peramban menunggu selamanya pada penarikan yang sudah mati.
    const db = fakeDb({ runRow: { id: 10, status: 'running', reviews: null, channels: null, error: null, elapsedMs: null, createdAt: new Date(Date.now() - 400_000).toISOString() } });
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, { action: 'job', workspaceId: 'ws-1' })).json();
    assert.equal(body.pending, false);
    assert.equal(body.finished, true);
    assert.equal(body.abandoned, true);
    assert.equal(body.run.status, 'abandoned');
    assert.match(body.run.error, /platform time limit/);
  });

  test('job tidak mengirim id project yang bentuknya tidak sah ke database', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, { action: 'job', workspaceId: 'x' })).json();
    assert.equal(body.run, null);
    assert.deepEqual(db.seen, []);
  });

  test('penarikan diserahkan ke latar belakang dan menjawab 202 tanpa menunggu', async () => {
    let held = null;
    const db = fakeDb();
    const service = stubService({
      action: 'sync',
      ok: true,
      entity: 'aud',
      fetchedAt: '2026-10-02T00:00:00.000Z',
      reviews: [{ id: 'r-1', platform: 'play' }],
      channels: [{ id: 'play', status: 'success', fetched: 1 }],
      summary: { reviews: 1, analyzed: 1 },
    });
    const handler = createSyncHandler(service, { db, waitUntil: promise => { held = promise; } });
    const response = await run(handler, { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE });
    assert.equal(response.statusCode, 202, 'peramban tidak lagi menahan satu permintaan sampai penarikan selesai');
    const body = response.json();
    assert.equal(body.accepted, true);
    assert.equal(body.pollingMs, 2000, 'setengah interval lama supaya bilah progres bergerak saat penarikan panjang');
    assert.match(body.jobId, /^ws-1:/);
    assert.equal(body.reviews, undefined, 'isi penarikan tidak dikirim pada jawaban pertama');
    assert.ok(held, 'pekerjaan diserahkan ke waitUntil');
    await held;
    assert.deepEqual(db.seen, ['cursor:ws-1', 'run:running:null', 'run:storing:1', 'snap:ws-1:1', 'run:ok:1'], 'penanda dibaca, pekerjaan ditandai berjalan, tahap simpan ditandai, lalu hasil disimpan dan diriwayatkan');
  });

  test('penarikan diberi batas waktu mutlak agar muat sebelum plafon fungsi', async () => {
    const db = fakeDb();
    const service = stubService();
    const handler = createSyncHandler(service, { db, waitUntil: promise => { promise.catch(() => {}); } });
    const before = Date.now();
    await run(handler, { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE });
    await new Promise(resolve => setImmediate(resolve));
    const call = service.calls[0];
    assert.ok(Number.isFinite(call.deadlineAt), 'kanal harus tahu kapan waktu fungsi habis');
    // 300 dtk plafon dikurangi 12 dtk ruang penutup; tidak boleh lebih dari itu.
    const room = call.deadlineAt - before;
    assert.ok(Math.abs(room - 288_000) <= 5_000, `sisa anggaran penarikan ${room}ms menyimpang dari plafon 300 dtk`);
  });

  test('penanda inkremental dan baris tersimpan diteruskan ke penarikan', async () => {
    const db = fakeDb({
      async reviewCursor() { return { revision: 4, fetchedAt: '2026-10-01T00:00:00.000Z', platforms: { play: '2026-09-30T10:00:00.000Z' } }; },
    });
    db.loadDataset = async id => {
      db.seen.push(`load:${id}`);
      return { entity: 'aud', reviews: [{ id: 'r-old', platform: 'play', rating: 1, text: 'aplikasi eror terus', publishedAt: '2026-09-30T10:00:00.000Z' }], channels: [] };
    };
    const service = stubService();
    const handler = createSyncHandler(service, { db });
    await run(handler, { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE });
    const call = service.calls[0];
    assert.deepEqual(call.since, { play: '2026-09-30T10:00:00.000Z' }, 'kanal toko diberi penanda tanggal dari snapshot');
    assert.equal(call.carry.length, 1, 'baris yang sudah tersimpan ikut dianalisis lagi');
    assert.equal(call.carry[0].id, 'r-old');
    assert.equal(db.seen.includes('load:ws-1'), true);
  });

  test('force menolak penanda inkremental', async () => {
    const db = fakeDb({
      async reviewCursor() { return { revision: 4, platforms: { play: '2026-09-30T10:00:00.000Z' } }; },
      async loadDataset() { return { reviews: [{ id: 'r-old', platform: 'play' }] }; },
    });
    const service = stubService();
    const handler = createSyncHandler(service, { db });
    await run(handler, { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE, force: true });
    assert.equal(service.calls[0].since, null);
    assert.equal(service.calls[0].carry, null);
    assert.equal(db.seen.some(entry => entry.startsWith('load:')), false, 'penarikan paksa tidak membaca snapshot lama');
  });

  test('database tanpa metode penanda tetap menarik penuh, bukan gagal', async () => {
    const db = fakeDb();
    delete db.reviewCursor;
    const service = stubService();
    const handler = createSyncHandler(service, { db });
    const response = await run(handler, { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE });
    assert.equal(response.statusCode, 200);
    assert.equal(service.calls[0].since, null);
    assert.match(response.json().incremental.note, /incremental cache unavailable/);
  });
});

describe('hitung ulang dari baris tersimpan', () => {
  const storedReviews = [
    { id: 'a', platform: 'play', rating: 1, text: 'tidak bisa login pakai sidik jari setelah update', publishedAt: '2026-05-01T00:00:00.000Z', analysis: { sentiment: 'negative', topics: ['harus', 'pake'] } },
    { id: 'b', platform: 'play', rating: 1, text: 'eror terus waktu transfer qris', publishedAt: '2026-05-02T00:00:00.000Z', analysis: { sentiment: 'negative', topics: ['dan', 'yang'] } },
    { id: 'c', platform: 'appstore', rating: 5, text: 'mantap banget aplikasinya mulus', publishedAt: '2026-05-03T00:00:00.000Z', analysis: { sentiment: 'positive', topics: ['sekali'] } },
    { id: 'd', platform: 'appstore', rating: 5, text: 'pembayaran qris cepat dan aman', publishedAt: '2026-05-04T00:00:00.000Z', analysis: { sentiment: 'positive', topics: ['untuk'] } },
  ];

  test('menganalisis ulang tanpa menghubungi sumber dan membuang label lama', async () => {
    const saved = [];
    const db = fakeDb({
      async loadDataset() {
        return {
          entity: 'aud',
          fetchedAt: '2026-05-05T00:00:00.000Z',
          engine: { version: 'corpus-rating-v2' },
          channels: [{ id: 'play', status: 'success', app: { listing: 'Aplikasi aud mempercepat transaksi QRIS.' } }],
          reviews: storedReviews,
          model: { version: 'corpus-rating-v2' },
          summary: {},
        };
      },
      async saveSnapshot({ dataset }) {
        this.seen.push(`snap:${dataset.entity ? 'ws-1' : '?'}:${dataset.reviews.length}`);
        saved.push(dataset);
        return { revision: 4, stored: dataset.reviews.length, elapsedMs: 9 };
      },
    });
    const service = stubService();
    const handler = createSyncHandler(service, { db, env: {} });
    const body = (await run(handler, { action: 'recompute', workspaceId: 'ws-1' })).json();
    assert.equal(body.ok, true);
    assert.equal(body.recomputed, true);
    assert.equal(body.rows, storedReviews.length);
    assert.equal(body.engine.version, 'corpus-rating-v3');
    assert.equal(service.calls.length, 0, 'hitung ulang tidak menarik apa pun dari internet');
    assert.ok(body.topics.length > 0, 'korpus ini punya istilah domain');
    assert.ok(body.topics.every(topic => dictionaryLabels.has(topic.name)), 'nama topik hasil hitung ulang adalah label kamus, bukan kata dari ulasan');
    assert.equal(db.seen.includes('snap:ws-1:4'), true);
    assert.equal(db.seen.includes('run:recomputed:4'), true);
    assert.equal(body.message.includes('No source was contacted'), true);
    // Lapisan penamaan ikut dijalankan saat hitung ulang, dan tanpa apa pun yang bisa dinamai ia
    // mengaku apa adanya — bukan menghilang, bukan pura-pura bernama.
    const pain = saved[0].model.painPoints;
    assert.equal(pain.naming.version, 'label-naming-v1');
    assert.equal(pain.naming.status, 'skipped');
    assert.match(pain.naming.reason, /no clusters to name|GEMINI_API_KEY/);
    for (const label of pain.labels) {
      assert.equal(label.heading.includes(label.evidence), true, 'judul label memuat kalimat reviewers');
      if (label.category) assert.equal(label.heading, `${label.category.name}: ${label.evidence}`);
    }
  });

  test('project tanpa baris tersimpan ditolak dengan jujur', async () => {
    const db = fakeDb({ async loadDataset() { return null; } });
    const handler = createSyncHandler(stubService(), { db });
    const response = await run(handler, { action: 'recompute', workspaceId: 'ws-1' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'dataset_missing');
  });

  test('id project yang tidak sah bentuknya tidak dikirim ke database', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const response = await run(handler, { action: 'recompute', workspaceId: 'not-valid!' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'workspace_invalid');
    assert.deepEqual(db.seen, []);
  });
});
