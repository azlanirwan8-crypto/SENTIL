import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncHandler, rejectsSameSiteCheck } from '../api/sync.js';
import { SyncError } from '../lib/sync-core.mjs';
import { createQuota } from '../lib/rate-limit.mjs';

function fakeRequest({ method = 'POST', headers = {}, body, raw }) {
  const chunks = raw != null ? [Buffer.from(raw)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { host: 'analisa.example', 'sec-fetch-site': 'same-origin', ...headers },
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
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
}

function stubService(responses = {}) {
  const calls = [];
  return {
    calls,
    discover: async (entity, options) => {
      calls.push({ action: 'discover', entity, options });
      return responses.discover || { action: 'discover', entity, play: { candidates: [] }, appstore: { candidates: [] } };
    },
    sync: async payload => {
      calls.push({ action: 'sync', ...payload });
      return responses.sync || { action: 'sync', ok: true, reviews: [], channels: [], summary: {} };
    },
    limits: payload => {
      calls.push({ action: 'limits', ...payload });
      return responses.limits || { action: 'limits', overall: 'idle', sources: [] };
    },
    resetLimits: payload => {
      calls.push({ action: 'limits-reset', ...payload });
      return responses.resetLimits || { action: 'limits-reset', cleared: { cache: [], attempts: [] } };
    },
  };
}

async function run(handler, request) {
  const response = fakeResponse();
  await handler(request, response);
  return response;
}

describe('gerbang asal permintaan', () => {
  test('menolak lintas situs, tanpa host, dan tanpa asal', () => {
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'cross-site', origin: 'https://b.example' }), true);
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'none' }), true);
    assert.equal(rejectsSameSiteCheck({ 'sec-fetch-site': 'same-origin' }), true);
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'same-origin' }), false);
  });

  test('menerima asal yang sama lewat proxy dan http lokal', () => {
    assert.equal(rejectsSameSiteCheck({
      host: 'analisa.example',
      'x-forwarded-host': 'analisa.example',
      'x-forwarded-proto': 'https',
      origin: 'https://analisa.example',
      'sec-fetch-site': 'same-origin',
    }), false);
    assert.equal(rejectsSameSiteCheck({
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
      'sec-fetch-site': 'same-origin',
    }), false);
    assert.equal(rejectsSameSiteCheck({
      host: 'analisa.example',
      'x-forwarded-host': 'analisa.example',
      'x-forwarded-proto': 'https',
      origin: 'https://penyerang.example',
      'sec-fetch-site': 'same-origin',
    }), true);
  });

  test('handler menolak permintaan lintas situs sebelum membaca isi', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://penyerang.example' },
      body: { action: 'discover', entity: 'Aplikasi Tes' },
    }));
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, 'cross_site');
    assert.equal(service.calls.length, 0);
  });
});

describe('/api/sync', () => {
  test('hanya menerima POST', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, { method: 'GET', headers: { host: 'a.example' }, async *[Symbol.asyncIterator]() {} });
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'POST');
  });

  test('aksi discover diteruskan apa adanya', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'discover', entity: '  Aplikasi Tes  ' } }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().action, 'discover');
    assert.equal(service.calls[0].entity, '  Aplikasi Tes  ');
    assert.deepEqual(service.calls[0].options, { force: false });
  });

  test('aksi sync meneruskan identitas toko, kanal sosial, dan force', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      body: {
        action: 'sync',
        entity: 'Aplikasi Tes',
        playAppId: 'com.tes',
        appleAppId: '12345',
        social: { news: { enabled: true }, youtube: { enabled: true, videoIds: ['abc'] } },
        force: true,
      },
    }));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(service.calls[0], {
      action: 'sync',
      entity: 'Aplikasi Tes',
      playAppId: 'com.tes',
      appleAppId: '12345',
      social: { news: { enabled: true }, youtube: { enabled: true, videoIds: ['abc'] } },
      force: true,
    });
  });

  test('kanal sosial saja tetap diterima tanpa identitas toko', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      body: { action: 'sync', entity: 'Aplikasi Tes', social: { news: { enabled: true } } },
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(service.calls[0].playAppId, undefined);
    assert.deepEqual(service.calls[0].social, { news: { enabled: true } });
  });

  test('isi permintaan sosial yang bukan objek dinormalisasi menjadi kosong', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes', playAppId: 'com.tes', social: ['bahaya'] } }));
    assert.deepEqual(service.calls[0].social, {}, 'array atau string tidak boleh lolos sebagai target kanal');
  });

  test('aksi limits membaca monitor tanpa menarik ulang', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      body: { action: 'limits', entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345', force: true },
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().action, 'limits');
    assert.deepEqual(service.calls[0], { action: 'limits', entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345', social: {} },
      'limits tidak meneruskan force karena tidak memanggil sumber');
  });

  test('aksi limits-reset membersihkan catatan dan membalas daftar yang dihapus', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      body: { action: 'limits-reset', entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: null },
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().action, 'limits-reset');
    assert.deepEqual(service.calls[0], { action: 'limits-reset', entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: null, social: {} });
  });

  test('limits tanpa target dibalas 400, bukan 500', async () => {
    const service = stubService();
    service.limits = () => { throw new SyncError('target_required', 'Pilih minimal satu identitas toko.', 400); };
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'limits', entity: 'Aplikasi Tes' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'target_required');
  });

  test('aksi tak dikenal ditolak dengan 400', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ body: { action: 'hapus' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'action_invalid');
  });

  test('kesalahan validasi layanan dipetakan ke status 4xx-nya', async () => {
    const service = stubService();
    service.sync = async () => { throw new SyncError('target_required', 'Pilih minimal satu identitas toko.', 400); };
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'target_required');
    assert.match(response.json().message, /minimal satu/);
  });

  test('kesalahan tak terduga tidak membocorkan isi error', async () => {
    const service = stubService();
    service.sync = async () => { throw new Error('rahasia internal di token db://kredensial'); };
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes' } }));
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error, 'internal_error');
    assert.equal(response.json().message.includes('kredensial'), false);
  });

  test('isi permintaan divalidasi: kosong, bukan JSON, dan bukan objek', async () => {
    const handler = createSyncHandler(stubService());
    assert.equal((await run(handler, fakeRequest({}))).json().error, 'body_required');
    assert.equal((await run(handler, fakeRequest({ raw: 'bukan json' }))).json().error, 'body_invalid');
    assert.equal((await run(handler, fakeRequest({ raw: '[1,2,3]' }))).json().error, 'body_invalid');
  });

  test('isi permintaan yang terlalu besar ditolak', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ raw: JSON.stringify({ action: 'discover', entity: 'x'.repeat(40000) }) }));
    assert.equal(response.statusCode, 413);
    assert.equal(response.json().error, 'body_too_large');
  });

  test('respons selalu no-store agar cache tidak menumpuk di tepi', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ body: { action: 'discover', entity: 'Aplikasi Tes' } }));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });
});

function fakeDb(overrides = {}) {
  const seen = [];
  return {
    enabled: true,
    reason: null,
    seen,
    async status() { return { enabled: true, reachable: true, reason: null }; },
    async listWorkspaces() {
      seen.push('list');
      return [{ id: 'ws-1', label: 'Audit', entity: 'aud', stores: {}, channels: {}, snapshot: null }];
    },
    async loadDataset(id) {
      seen.push(`load:${id}`);
      return { entity: 'aud', reviews: [{ id: 'r-1', platform: 'play' }], model: {}, summary: {} };
    },
    async loadDatasetHeads(ids) {
      seen.push(`heads:${ids.join('|')}`);
      return ids.map(id => ({
        workspaceId: id,
        entity: id,
        fetchedAt: '2026-10-20T00:00:00.000Z',
        engine: { version: 'corpus-rating-v2' },
        summary: { reviews: 10, analyzed: 8, unclassified: 2, rated: 10, avgRating: 3, positive: 5, negative: 3, neutral: 0, nss: 25, channels: [] },
        model: { version: 'corpus-rating-v2', nss: 25, labels: { positive: 5, negative: 3, neutral: 0, unclassified: 2 }, coverage: { ratingBreakdown: [4, 1, 1, 1, 3] }, daily: [], painPoints: { items: [] }, topics: [] },
        channels: [],
        stored: { revision: 1, reviewCount: 10, assembled: 0 },
      }));
    },
    async saveWorkspace(workspace) { seen.push(`save:${workspace.id}`); },
    async deleteWorkspace(id) { seen.push(`delete:${id}`); return true; },
    async saveSnapshot({ workspace, dataset }) {
      seen.push(`snap:${workspace.id}:${dataset.reviews.length}`);
      return { revision: 3, stored: dataset.reviews.length, elapsedMs: 12 };
    },
    async logRun(run) { seen.push(`run:${run.status}:${run.reviews}`); },
    ...overrides,
  };
}

const WORKSPACE = {
  id: 'ws-1',
  label: 'Audit',
  entity: 'aud',
  stores: { play: { appId: 'com.aud', title: 'Aud', url: 'https://play.google.com/x' } },
  channels: { news: { enabled: true } },
};

describe('aksi penyimpanan database', () => {
  test('state membaca daftar workspace lewat probe lebih dulu', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const response = await run(handler, fakeRequest({ body: { action: 'state' } }));
    assert.equal(response.json().db.reachable, true);
    assert.equal(response.json().workspaces[0].id, 'ws-1');
    assert.deepEqual(db.seen, ['list']);
  });

  test('state tetap jujur ketika database belum dipasang', async () => {
    const db = fakeDb({
      enabled: false,
      reason: 'SUPABASE_URL belum dipasang pada environment server.',
      async status() { return { enabled: false, reachable: false, reason: this.reason }; },
    });
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'state' } }))).json();
    assert.equal(body.db.enabled, false);
    assert.deepEqual(body.workspaces, []);
    assert.match(body.db.reason, /SUPABASE_URL/);
  });

  test('sync menyimpan snapshot dan mencatat riwayat penarikan', async () => {
    const db = fakeDb();
    const service = stubService({
      sync: {
        action: 'sync',
        ok: true,
        entity: 'aud',
        fetchedAt: '2026-10-02T00:00:00.000Z',
        reviews: [{ id: 'r-1', platform: 'play' }, { id: 'r-2', platform: 'play' }],
        channels: [{ id: 'play', status: 'success', fetched: 2 }],
        summary: { reviews: 2, analyzed: 2 },
      },
    });
    const handler = createSyncHandler(service, { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE } }))).json();
    assert.equal(body.stored.ok, true);
    assert.equal(body.stored.rows, 2);
    assert.equal(body.reviews.length, 2, 'hasil penarikan tetap dikembalikan utuh ke klien');
    assert.deepEqual(db.seen, ['snap:ws-1:2', 'run:ok:2']);
  });

  test('sync tanpa identitas workspace tetap mengembalikan data tetapi melaporkan tidak disimpan', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes', playAppId: 'com.tes' } }))).json();
    assert.equal(body.stored.ok, false);
    assert.match(body.stored.reason, /workspace identity/);
    assert.equal(db.seen.length, 0);
  });

  test('kegagalan tulis database tidak menggagalkan penarikan', async () => {
    const db = fakeDb({
      async saveSnapshot() { throw new Error('Database menolak permintaan (500).'); },
    });
    const handler = createSyncHandler(stubService(), { db });
    const response = await run(handler, fakeRequest({ body: { action: 'sync', entity: 'aud', playAppId: 'com.aud', workspace: WORKSPACE } }));
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.stored.ok, false);
    assert.match(body.stored.reason, /500/);
  });

  test('dataset workspace tanpa snapshot dikembalikan null, bukan array kosong', async () => {
    const db = fakeDb({ async loadDataset(id) { this.seen.push(`load:${id}`); return null; } });
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'dataset', workspaceId: 'ws-9' } }))).json();
    assert.equal(body.dataset, null);
    assert.deepEqual(db.seen, ['load:ws-9']);
  });

  test('workspace-save menolak bentuk yang tidak sah', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'workspace-save', workspace: { id: 'x', label: 'A', entity: 'b' } } }))).json();
    assert.equal(body.workspace, null);
    assert.equal(db.seen.length, 0, 'tidak ada tulis sebelum bentuknya sah');
  });

  test('workspace-save merapikan kolom yang disimpan', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({
      body: {
        action: 'workspace-save',
        workspace: { ...WORKSPACE, label: '  Audit  ', stores: { ...WORKSPACE.stores, play: { appId: 'com.aud', url: 'javascript:alert(1)' } } },
      },
    }))).json();
    assert.equal(body.workspace.id, 'ws-1');
    assert.equal(body.workspace.label, 'Audit');
    assert.equal(body.workspace.stores.play.url, null, 'hanya https yang boleh tersimpan');
    assert.deepEqual(db.seen, ['save:ws-1']);
  });

  test('workspace-delete menolak id di luar bentuk yang sah', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'workspace-delete', workspaceId: 'id palsu' } }))).json();
    assert.equal(body.deleted, false);
    assert.equal(db.seen.length, 0);
  });

  test('aksi yang tidak dikenal tetap ditolak dengan pesan daftar aksi', async () => {
    const handler = createSyncHandler(stubService(), { db: fakeDb() });
    const body = (await run(handler, fakeRequest({ body: { action: 'drop-tables' } }))).json();
    assert.equal(body.error, 'action_invalid');
    assert.match(body.message, /workspace-delete/);
    assert.match(body.message, /compare/);
  });
});

describe('matriks perbandingan lintas project', () => {
  test('memuat kepala dataset, bukan baris ulasan', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const body = (await run(handler, fakeRequest({ body: { action: 'compare', workspaceIds: ['ws-1', 'ws-2'] } }))).json();
    assert.equal(body.ok, true);
    assert.equal(body.projects.length, 2);
    assert.equal(body.reference.kind, 'median-across-selected');
    assert.equal(body.rows.find(row => row.key === 'nss').values.length, 2);
    assert.equal(db.seen.includes('load:ws-1'), false, 'jalur compare tidak boleh menarik seluruh ulasan per project');
    assert.equal(db.seen.some(entry => entry.startsWith('heads:')), true);
  });

  test('satu project saja ditolak, dan id asing disaring sebelum menyentuh database', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const single = (await run(handler, fakeRequest({ body: { action: 'compare', workspaceIds: ['ws-1'] } }))).json();
    assert.equal(single.error, 'compare_targets_invalid');

    const hostile = (await run(handler, fakeRequest({ body: { action: 'compare', workspaceIds: ['ws-1', "ws-2) or delete sentil_review --"] } })));
    assert.equal(hostile.statusCode, 400);
    assert.equal(hostile.json().error, 'compare_targets_invalid');
    assert.equal(db.seen.filter(entry => entry.startsWith('heads:')).length, 0, 'id yang tidak sah tidak diteruskan ke query');
  });

  test('id duplikat diringkas dan jumlah kolom dibatasi', async () => {
    const db = fakeDb();
    const handler = createSyncHandler(stubService(), { db });
    const many = Array.from({ length: 20 }, (_, index) => `ws-${index}`);
    const body = (await run(handler, fakeRequest({ body: { action: 'compare', workspaceIds: ['ws-1', 'ws-1', ...many] } }))).json();
    assert.equal(body.projects.length, 12, 'anggaran kolom matriks');
    const heads = db.seen.find(entry => entry.startsWith('heads:'));
    const sent = heads.split(':').slice(1).join(':').split('|');
    assert.equal(sent.length, 12);
    assert.equal(new Set(sent).size, 12, 'id duplikat tidak boleh menghasilkan kolom kembar');
    assert.equal(sent[0], 'ws-1', 'kemunculan pertama menentukan urutan kolom');
    assert.equal(sent[1], 'ws-0', 'urutan mengikuti permintaan, bukan urutan server');
  });

  test('database tak terjangkau: matriks kosong, bukan angka nol yang menyamar', async () => {
    const db = fakeDb({
      async status() { return { enabled: true, reachable: false, reason: 'The database could not be reached (ENOTFOUND).' }; },
      async loadDatasetHeads() { throw new Error('tidak boleh dipanggil'); },
    });
    const body = (await run(createSyncHandler(stubService(), { db }), fakeRequest({ body: { action: 'compare', workspaceIds: ['ws-1', 'ws-2'] } }))).json();
    assert.deepEqual(body.projects, []);
    assert.deepEqual(body.rows, []);
    assert.equal(body.db.reachable, false);
  });
});

describe('gerbang kuota per pengunjung', () => {
  // Jam dibekukan supaya seluruh permintaan dalam satu uji jatuh di jendela yang sama.
  const frozen = () => { let t = Date.parse('2026-10-27T08:00:00.000Z'); return { now: () => t, advance: ms => { t += ms; } }; };
  const quotaFor = env => { const time = frozen(); return { time, quota: createQuota({ env, now: time.now }) }; };
  const from = ip => ({ headers: { 'x-forwarded-for': ip } });

  test('penarikan yang melampaui jendela pendek dibalas 429 dengan retry-after', async () => {
    const { quota } = quotaFor({ QUOTA_SYNC_BURST: '2', QUOTA_SYNC_DAY: '50' });
    const service = stubService();
    const handler = createSyncHandler(service, { db: fakeDb(), quota });
    const body = { action: 'sync', entity: 'aud', playAppId: 'com.aud' };
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.1'), body }))).statusCode, 200);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.1'), body }))).statusCode, 200);
    const blocked = await run(handler, fakeRequest({ ...from('203.0.113.1'), body }));
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error, 'quota_exceeded');
    assert.equal(blocked.json().limit, 2);
    assert.equal(blocked.json().window, '10 minutes');
    assert.equal(Number(blocked.headers['retry-after']) > 0, true);
    assert.equal(Number(blocked.headers['retry-after']) <= 600, true);
    assert.equal(blocked.headers['cache-control'], 'no-store');
    assert.equal(service.calls.filter(call => call.action === 'sync').length, 2, 'penarikan ketiga tidak sampai ke sumber');
    assert.match(blocked.json().message, /not changed/, 'penolakan harus menyatakan data tersimpan aman');
  });

  test('kunci dihitung per pengunjung, bukan per fungsi', async () => {
    const { quota } = quotaFor({ QUOTA_SYNC_BURST: '1', QUOTA_SYNC_DAY: '50' });
    const handler = createSyncHandler(stubService(), { db: fakeDb(), quota });
    const body = { action: 'sync', entity: 'aud', playAppId: 'com.aud' };
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.1'), body }))).statusCode, 200);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.2'), body }))).statusCode, 200);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.1'), body }))).statusCode, 429);
  });

  test('permintaan yang cacat bentuk tidak menghabiskan jatah', async () => {
    const { quota } = quotaFor({ QUOTA_SYNC_BURST: '1', QUOTA_SYNC_DAY: '50' });
    const handler = createSyncHandler(stubService(), { db: fakeDb(), quota });
    assert.equal((await run(handler, fakeRequest(from('203.0.113.9')))).statusCode, 400);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.9'), raw: 'bukan json' }))).statusCode, 400);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.9'), body: { action: 'sync', entity: 'aud', playAppId: 'com.aud' } }))).statusCode, 200,
      'satu penarikan sah masih tersedia setelah dua permintaan rusak');
  });

  test('aksi mahal dikenai kuota dan aksi baca tidak', async () => {
    const { quota } = quotaFor({ QUOTA_DISCOVER_BURST: '1', QUOTA_SYNC_BURST: '1' });
    const handler = createSyncHandler(stubService(), { db: fakeDb(), quota });
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.4'), body: { action: 'discover', entity: 'Aud' } }))).statusCode, 200);
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.4'), body: { action: 'discover', entity: 'Aud' } }))).statusCode, 429);
    for (let index = 0; index < 25; index += 1) {
      const response = await run(handler, fakeRequest({ ...from('203.0.113.4'), body: { action: 'state' } }));
      assert.equal(response.statusCode, 200, 'dasbor harus tetap terbaca walau jatah penarikan habis');
    }
    const limits = await run(handler, fakeRequest({ ...from('203.0.113.4'), body: { action: 'limits', entity: 'Aud', playAppId: 'com.aud' } }));
    assert.equal(limits.statusCode, 200);
  });

  test('satu keran tidak memakan keran lain', async () => {
    const { quota } = quotaFor({ QUOTA_SYNC_BURST: '1', QUOTA_DISCOVER_BURST: '1' });
    const handler = createSyncHandler(stubService(), { db: fakeDb(), quota });
    await run(handler, fakeRequest({ ...from('203.0.113.5'), body: { action: 'sync', entity: 'Aud', playAppId: 'com.aud' } }));
    assert.equal((await run(handler, fakeRequest({ ...from('203.0.113.5'), body: { action: 'discover', entity: 'Aud' } }))).statusCode, 200);
  });

  test('tanpa alamat proxy semua permintaan berbagi kunci anonim', async () => {
    const { quota } = quotaFor({ QUOTA_SYNC_BURST: '1', QUOTA_SYNC_DAY: '50' });
    const handler = createSyncHandler(stubService(), { db: fakeDb(), quota });
    const body = { action: 'sync', entity: 'aud', playAppId: 'com.aud' };
    assert.equal((await run(handler, fakeRequest({ body }))).statusCode, 200);
    assert.equal((await run(handler, fakeRequest({ body }))).statusCode, 429);
    assert.equal(quota.enabled, true);
  });
});
