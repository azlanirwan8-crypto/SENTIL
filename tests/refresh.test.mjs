import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { accepted, createRefreshHandler } from '../api/refresh.js';
import { createRefreshService, isStale, refreshConfiguration } from '../lib/refresh-core.mjs';

const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const HOUR = 3_600_000;

function timer(start = T0) {
  let current = start;
  return { now: () => current, advance: ms => { current += ms; } };
}

function fakeRequest({ method = 'GET', url = '/api/refresh', headers = {} } = {}) {
  return { method, url, headers: { host: 'sentil.example', ...headers } };
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

async function run(handler, request) {
  const response = fakeResponse();
  await handler(request, response);
  return response;
}

describe('konfigurasi penarikan terjadwal', () => {
  test('ambang baku enam jam dan anggaran dikekang ke bawah maxDuration', () => {
    const config = refreshConfiguration({});
    assert.equal(config.staleAfterMs, 6 * HOUR);
    assert.equal(config.budgetMs, 270_000);
    assert.equal(config.minRoomMs, 150_000);
    assert.equal(config.requireAuth, true);
  });

  test('environment boleh mengubah umur dan anggaran tetapi tidak bisa melewatinya', () => {
    assert.equal(refreshConfiguration({ REFRESH_STALE_HOURS: '24' }).staleAfterMs, 24 * HOUR);
    assert.equal(refreshConfiguration({ REFRESH_STALE_HOURS: '0' }).staleAfterMs, 1 * HOUR, 'nol jam berarti setiap penarikan dianggap perlu');
    assert.equal(refreshConfiguration({ REFRESH_STALE_HOURS: 'sembilan ribu' }).staleAfterMs, 6 * HOUR);
    assert.equal(refreshConfiguration({ REFRESH_BUDGET_MS: '900000' }).budgetMs, 280_000, 'fungsi mati di 300 detik');
    assert.equal(refreshConfiguration({ REFRESH_BUDGET_MS: '900000', REFRESH_MIN_ROOM_MS: '900000' }).minRoomMs, 240_000);
    assert.equal(refreshConfiguration({ REFRESH_BUDGET_MS: '60000' }).minRoomMs, 50_000, 'sisa tidak boleh lebih besar daripada anggarannya sendiri');
  });

  test('gerbang kunci bisa dibuka hanya dengan pernyataan tertulis', () => {
    assert.equal(refreshConfiguration({}).requireAuth, true);
    assert.equal(refreshConfiguration({ REFRESH_ALLOW_UNAUTHENTICATED: 'true' }).requireAuth, false);
    assert.equal(refreshConfiguration({ REFRESH_ALLOW_UNAUTHENTICATED: '1' }).requireAuth, true);
  });
});

describe('penolakan alamat tua', () => {
  test('workspace tanpa cap dianggap setua mungkin', () => {
    assert.equal(isStale({ id: 'a' }, T0, 6 * HOUR), true);
    assert.equal(isStale({ lastSyncedAt: new Date(T0 - 7 * HOUR).toISOString() }, T0, 6 * HOUR), true);
    assert.equal(isStale({ lastSyncedAt: new Date(T0 - 5 * HOUR).toISOString() }, T0, 6 * HOUR), false);
    assert.equal(isStale({ snapshot: { fetchedAt: new Date(T0 - 5 * HOUR).toISOString() } }, T0, 6 * HOUR), false,
      'cap snapshot dipakai bila cap penarikan terakhir tidak ada');
    assert.equal(isStale({ lastSyncedAt: 'bukan tanggal' }, T0, 6 * HOUR), true);
  });
});

function fakeDb(workspaces, overrides = {}) {
  const calls = [];
  return {
    enabled: true,
    reason: null,
    calls,
    async status() { calls.push('status'); return { enabled: true, reachable: true, reason: null }; },
    async listWorkspaces() { calls.push('list'); return workspaces; },
    async saveWorkspace(workspace) { calls.push(`ws:${workspace.id}`); return workspace; },
    async saveSnapshot({ workspace, dataset }) {
      calls.push(`snap:${workspace.id}:${dataset.reviews.length}`);
      return { revision: 4, stored: dataset.reviews.length, elapsedMs: 5 };
    },
    async logRun(run) { calls.push(`run:${run.workspaceId}:${run.status}:${run.reviews}`); },
    ...overrides,
  };
}

const pulled = (entity, count = 3) => ({
  action: 'sync',
  ok: true,
  entity,
  fetchedAt: new Date(T0).toISOString(),
  reviews: Array.from({ length: count }, (_, index) => ({ id: `${entity}-${index}`, platform: 'play' })),
  channels: [{ id: 'play', status: 'success', fetched: count }],
  summary: { reviews: count, analyzed: count },
});

const oldest = { id: 'ws-old', label: 'Old', entity: 'old', lastSyncedAt: new Date(T0 - 40 * HOUR).toISOString(), stores: { play: { appId: 'com.old' } }, channels: {} };
const middle = { id: 'ws-mid', label: 'Mid', entity: 'mid', lastSyncedAt: new Date(T0 - 20 * HOUR).toISOString(), stores: { appstore: { appId: '99' } }, channels: {} };
const fresh = { id: 'ws-fresh', label: 'Fresh', entity: 'fresh', lastSyncedAt: new Date(T0 - HOUR).toISOString(), stores: { play: { appId: 'com.fresh' } }, channels: {} };
const bare = { id: 'ws-bare', label: 'Bare', entity: 'bare', lastSyncedAt: null, stores: {}, channels: {} };

function serviceWith(handler) {
  const seen = [];
  return {
    seen,
    sync: async payload => {
      seen.push(payload);
      return handler ? handler(payload) : pulled(payload.entity);
    },
  };
}

describe('penarik terjadwal memilih workspace yang benar', () => {
  test('hanya yang tua, dan yang paling tua lebih dulu', async () => {
    const time = timer();
    const db = fakeDb([fresh, middle, oldest]);
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.deepEqual(service.seen.map(entry => entry.entity), ['old', 'mid'], 'urutan dari yang paling perlu disegarkan');
    assert.equal(result.considered, 2);
    assert.equal(result.workspaces, 3);
    assert.equal(result.counts.pulled, 2);
    assert.equal(service.seen[0].force, false, 'cron tidak boleh memaksa tulis ulang snapshot yang isinya sama');
    assert.equal(service.seen[0].bypassCache, true, 'penarikan terjadwal tidak boleh dibendung cache satu jam');
    assert.deepEqual(db.calls, ['status', 'list', 'snap:ws-old:3', 'run:ws-old:ok:3', 'snap:ws-mid:3', 'run:ws-mid:ok:3']);
  });

  test('penanda inkremental dibaca dan baris tersimpan ikut dikirim kembali', async () => {
    const time = timer();
    const db = fakeDb([oldest], {
      async reviewCursor(workspaceId) { return { workspaceId, head: 4, platforms: { play: '2026-10-20T00:00:00.000Z' } }; },
      async loadDataset(workspaceId) { return { reviews: [{ id: `${workspaceId}-0`, platform: 'play' }, { id: `${workspaceId}-1`, platform: 'play' }] }; },
    });
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.deepEqual(service.seen[0].since, { play: '2026-10-20T00:00:00.000Z' });
    assert.equal(service.seen[0].carry.length, 2, 'baris yang sudah tersimpan tetap dianalisis, tidak dibuang');
    assert.equal(result.results[0].status, 'pulled');
  });

  test('sumber menjawab tanpa ulasan baru berarti snapshot tidak disentuh', async () => {
    const time = timer();
    const db = fakeDb([oldest]);
    const service = serviceWith(async () => ({
      action: 'sync',
      ok: true,
      unchanged: true,
      entity: 'old',
      fetchedAt: new Date(T0).toISOString(),
      incremental: { carried: 60_000, fresh: 0, since: { play: '2026-10-20T00:00:00.000Z' } },
      channels: [{ id: 'play', status: 'success', fetched: 0 }],
      reviews: null,
      model: null,
    }));
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.equal(result.results[0].status, 'unchanged');
    assert.equal(result.results[0].rows, 60_000);
    assert.equal(result.ok, true, 'tidak ada perubahan bukan kegagalan cron');
    assert.deepEqual(db.calls, ['status', 'list', 'ws:ws-old', 'run:ws-old:unchanged:60000'], 'hanya cap waktu dan riwayat runs yang ditulis, snapshot tidak');
  });

  test('workspace tanpa kanal aktif dilewati, bukan dicoba lalu nol', async () => {
    const time = timer();
    const db = fakeDb([{ ...bare, lastSyncedAt: new Date(T0 - 30 * HOUR).toISOString() }]);
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.equal(service.seen.length, 0);
    assert.equal(result.results[0].status, 'skipped');
    assert.match(result.results[0].reason, /No channel is enabled/);
    assert.equal(result.ok, true, 'melewati project yang memang belum punya kanal bukan kegagalan runs');
  });

  test('satu project boleh disuruh ulang walau masih segar', async () => {
    const time = timer();
    const db = fakeDb([fresh, oldest]);
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run({ workspaceId: 'ws-fresh' });
    assert.deepEqual(service.seen.map(entry => entry.entity), ['fresh']);
    assert.equal(result.considered, 1);
  });

  test('all menarik semuanya tetapi tetap dari yang tertua', async () => {
    const time = timer();
    const db = fakeDb([fresh, middle, oldest]);
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run({ all: true });
    assert.deepEqual(service.seen.map(entry => entry.entity), ['old', 'mid', 'fresh']);
    assert.equal(result.counts.pulled, 3);
  });

  test('sisa waktu yang tidak cukup menunda, bukan memotong di tengah jalan', async () => {
    const time = timer();
    const db = fakeDb([oldest, middle]);
    const service = serviceWith(async () => { time.advance(140_000); return pulled('old'); });
    const result = await createRefreshService({ service, db, env: { REFRESH_BUDGET_MS: '200000', REFRESH_MIN_ROOM_MS: '150000' }, now: time.now }).run();
    assert.equal(service.seen.length, 1, 'project kedua tidak dimulai kalau sisanya tidak muat');
    assert.equal(result.results[1].status, 'deferred');
    assert.match(result.results[1].reason, /60s of 150s needed/);
    assert.equal(result.counts.deferred, 1);
  });

  test('penarikan yang gagal tidak menghapus snapshot sebelumnya', async () => {
    const time = timer();
    const db = fakeDb([oldest]);
    const service = serviceWith(async () => { throw new Error('network blew up'); });
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.equal(result.results[0].status, 'failed');
    assert.match(result.results[0].reason, /previous snapshot is still in use/);
    assert.equal(result.ok, false, 'runs tanpa satu pun hasil nyata harus bisa dikenali cron sebagai kegagalan');
    assert.equal(db.calls.includes('snap:ws-old:3'), false);
  });

  test('kegagalan tulis dilaporkan sebagai not_stored dengan alasan aslinya', async () => {
    const time = timer();
    const db = fakeDb([oldest], { async saveSnapshot() { throw new Error('Database menolak permintaan (500).'); } });
    const result = await createRefreshService({ service: serviceWith(), db, env: {}, now: time.now }).run();
    assert.equal(result.results[0].status, 'not_stored');
    assert.match(result.results[0].reason, /500/);
    assert.equal(result.results[0].reviews, 3, 'barisnya tetap terbaca walau tidak tersimpan');
  });

  test('database yang belum terpasang menghentikan runs sebelum sumber disentuh', async () => {
    const time = timer();
    const db = {
      enabled: false,
      reason: 'SUPABASE_URL is not set in the server environment.',
      async status() { return { enabled: false, reachable: false, reason: this.reason }; },
      async listWorkspaces() { throw new Error('tidak boleh dipanggil'); },
    };
    const service = serviceWith();
    const result = await createRefreshService({ service, db, env: {}, now: time.now }).run();
    assert.equal(result.ok, false);
    assert.match(result.reason, /SUPABASE_URL/);
    assert.equal(service.seen.length, 0);
  });

  test('nol project adalah hasil yang sehat, bukan kegagalan', async () => {
    const time = timer();
    const result = await createRefreshService({ service: serviceWith(), db: fakeDb([fresh]), env: {}, now: time.now }).run();
    assert.equal(result.ok, true);
    assert.equal(result.considered, 0);
    assert.deepEqual(result.results, []);
  });
});

describe('/api/refresh sebagai fungsi serverless', () => {
  const token = 'cron-token-super-rahasia';

  test('tanpa CRON_SECRET fungsi menolak bekerja, bukan membuka diri', async () => {
    const handler = createRefreshHandler({ run: async () => { throw new Error('tidak boleh jalan'); } }, { env: {} });
    const response = await run(handler, fakeRequest({ headers: { authorization: `Bearer ${token}` } }));
    assert.equal(response.statusCode, 501);
    assert.match(response.json().message, /CRON_SECRET is not installed/);
  });

  test('bearer yang salah atau hilang ditolak tanpa memanggil penarik', async () => {
    let called = 0;
    const service = { run: async () => { called += 1; return { ok: true, results: [] }; } };
    const handler = createRefreshHandler(service, { env: { CRON_SECRET: token } });
    assert.equal((await run(handler, fakeRequest())).statusCode, 401);
    assert.equal((await run(handler, fakeRequest({ headers: { authorization: 'Bearer salah' } }))).statusCode, 401);
    assert.equal((await run(handler, fakeRequest({ headers: { authorization: `Bearer ${token}x` } }))).statusCode, 401);
    assert.equal(called, 0);
  });

  test('cron yang sah mendapat ringkasan dan jawabannya no-store', async () => {
    const service = { run: async options => ({ action: 'refresh', ok: true, results: [], echo: options }) };
    const handler = createRefreshHandler(service, { env: { CRON_SECRET: token } });
    const response = await run(handler, fakeRequest({ headers: { authorization: `Bearer ${token}` } }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });

  test('hanya GET dan POST; bentuk query dibatasi sebelum menyentuh database', async () => {
    const service = { run: async options => ({ action: 'refresh', ok: true, results: [], echo: options }) };
    const handler = createRefreshHandler(service, { env: { CRON_SECRET: token } });
    assert.equal((await run(handler, fakeRequest({ method: 'DELETE' }))).statusCode, 405);

    const hostile = await run(handler, fakeRequest({
      url: '/api/refresh?workspace=id%20palsu&limit=9999&all=yes',
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(hostile.statusCode, 400);
    assert.equal(hostile.json().error, 'workspace_invalid');

    const capped = await run(handler, fakeRequest({
      url: '/api/refresh?limit=9999&all=true',
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(capped.statusCode, 200);
    assert.deepEqual(capped.json().echo, { workspaceId: null, limit: 20, all: true });

    const single = await run(handler, fakeRequest({
      url: '/api/refresh?workspace=ws-1&limit=2',
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.deepEqual(single.json().echo, { workspaceId: 'ws-1', limit: 2, all: false });
  });

  test('kegagalan tak terduga tidak membocorkan isi error', async () => {
    const service = { run: async () => { throw new Error('db://token-rahasia menolak'); } };
    const handler = createRefreshHandler(service, { env: { CRON_SECRET: token } });
    const response = await run(handler, fakeRequest({ headers: { authorization: `Bearer ${token}` } }));
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().message.includes('token-rahasia'), false);
  });

  test('penarik yang mengembalikan ok false dipetakan ke 502', async () => {
    const service = { run: async () => ({ action: 'refresh', ok: false, reason: 'The database could not be reached.', results: [] }) };
    const handler = createRefreshHandler(service, { env: { CRON_SECRET: token } });
    const response = await run(handler, fakeRequest({ headers: { authorization: `Bearer ${token}` } }));
    assert.equal(response.statusCode, 502);
  });

  test('perbandingan token tidak membandingkan panjang yang berbeda', () => {
    assert.equal(accepted({ authorization: `Bearer ${token}` }, token), true);
    assert.equal(accepted({ authorization: `Bearer ${token.slice(0, 8)}` }, token), false);
    assert.equal(accepted({}, token), false);
    assert.equal(accepted({ authorization: token }, token), false, 'tanpa skema Bearer tidak diterima');
    assert.equal(accepted({ authorization: `Bearer ${token}` }, ''), false);
  });
});
