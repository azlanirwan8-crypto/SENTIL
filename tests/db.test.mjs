import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import { DbError, createDatabase, dbConfiguration } from '../lib/db.mjs';

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-palsu',
};

function reviewOf(index) {
  return {
    id: `r-${index}`,
    platform: index % 2 ? 'play' : 'appstore',
    rating: (index % 5) + 1,
    text: `ulasan ${index}`,
    publishedAt: '2026-10-01T00:00:00.000Z',
  };
}

function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      prefer: options.headers.prefer || null,
      body,
    });
    return handler({ url, method: options.method || 'GET', body, calls });
  };
  return { calls, fetchImpl };
}

function ok(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return payload === null ? '' : JSON.stringify(payload);
    },
  };
}

function noContent() {
  return { ok: true, status: 204, async text() { return ''; } };
}

function fail(status, text) {
  return { ok: false, status, async text() { return text; } };
}

describe('konfigurasi database', () => {
  test('tanpa url dan tanpa kunci service role, database dilaporkan tidak aktif', () => {
    assert.equal(dbConfiguration({}).enabled, false);
    assert.match(dbConfiguration({}).reason, /SUPABASE_URL/);
    assert.equal(dbConfiguration({ SUPABASE_URL: 'https://x.supabase.co' }).enabled, false);
    const missingKey = dbConfiguration({ SUPABASE_URL: 'https://x.supabase.co' }).reason;
    assert.match(missingKey, /SERVICE_ROLE/);
    // Pesan ini muncul di spanduk peramban, jadi harus menyebut tempat kunci itu diambil
    // dan bahwa kunci publishable tidak diterima — pengguna pernah salah tempel kunci.
    assert.match(missingKey, /Secret key/i);
    assert.match(missingKey, /publishable/i);
  });

  test('url non-https atau memuat kredensial ditolak', () => {
    const base = { SUPABASE_SERVICE_ROLE_KEY: 'k' };
    assert.equal(dbConfiguration({ ...base, SUPABASE_URL: 'http://x.supabase.co' }).enabled, false);
    assert.equal(dbConfiguration({ ...base, SUPABASE_URL: 'https://user:pass@x.supabase.co' }).enabled, false);
    assert.equal(dbConfiguration({ ...base, SUPABASE_URL: 'bukan-url' }).enabled, false);
  });

  test('url valid dirapikan tanpa slash penutup', () => {
    const config = dbConfiguration(ENV);
    assert.equal(config.enabled, true);
    assert.equal(config.baseUrl, 'https://example.supabase.co');
  });

  test('setiap metode yang dipanggil pemakai database benar-benar ada di objeknya', () => {
    // db.test selama ini memakai stub yang punya semua metode, jadi metode yang lupa
    // diekspor dari createDatabase lolos pengujian dan baru meledak di produksi sebagai 500.
    // Yang dipindai karena itu semua pemakai, bukan hanya satu pintu API.
    const consumers = ['../api/sync.js', '../lib/persist.mjs', '../lib/refresh-core.mjs'];
    const used = [...new Set(consumers.flatMap(file => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      return [...source.matchAll(/\bdb\.([a-zA-Z]+)\(/g)].map(match => match[1]);
    }))];
    assert.ok(used.length >= 8, `daftar metode terlalu pendek: ${used.join(',')}`);
    const db = createDatabase({ env: ENV });
    for (const name of used) {
      assert.equal(typeof db[name], 'function', `createDatabase() tidak mengekspos ${name}()`);
    }
  });

  test('status jujur ketika database belum dipasang, tanpa permintaan jaringan', () => {
    const { calls, fetchImpl } = recorder(() => ok([]));
    const db = createDatabase({ env: {}, fetchImpl });
    return db.status().then(status => {
      assert.equal(status.enabled, false);
      assert.equal(status.reachable, false);
      assert.equal(calls.length, 0, 'tidak ada permintaan saat konfigurasi tidak ada');
    });
  });
});

describe('tulis snapshot', () => {
  test('ulasan ditulis per tahap dan penanda revisi dipindah setelah lengkap', async () => {
    const reviews = Array.from({ length: 2500 }, (_, index) => reviewOf(index));
    const { calls, fetchImpl } = recorder(({ url, method }) => {
      if (method === 'GET' && url.pathname.endsWith('sentil_dataset')) return ok([{ revision: 4 }]);
      if (method === 'POST' && url.pathname.endsWith('sentil_workspace')) return noContent();
      if (method === 'POST' && url.pathname.endsWith('sentil_review')) return noContent();
      if (method === 'DELETE') return noContent();
      return ok([]);
    });
    const db = createDatabase({ env: ENV, fetchImpl });
    const saved = await db.saveSnapshot({
      workspace: { id: 'ws-1', label: 'Audit', entity: 'aud', stores: {}, channels: {} },
      dataset: { reviews, summary: { reviews: 2500 }, model: { status: 'ready' }, fetchedAt: '2026-10-01T00:00:00.000Z' },
    });

    assert.equal(saved.revision, 5, 'revisi berikutnya dari penanda yang ada');
    assert.equal(saved.stored, 2500);
    const writes = calls.filter(call => call.method === 'POST' && call.path.startsWith('/rest/v1/sentil_review'));
    assert.deepEqual(writes.map(call => call.body.length), [1000, 1000, 500], 'batch terduga tanpa kehilangan baris');
    assert.equal(writes.every(call => call.body.every(row => row.revision === 5)), true);
    assert.deepEqual(writes[0].body.map(row => row.ordinal).slice(0, 3), [0, 1, 2]);
    assert.deepEqual(writes[2].body[0].payload, reviewOf(2000), 'payload disimpan utuh seperti hasil mesin');

    const head = calls.find(call => call.method === 'POST' && call.path.startsWith('/rest/v1/sentil_dataset'));
    assert.equal(JSON.parse(`"${head.body[0].workspace_id}"`), 'ws-1');
    assert.equal(head.body[0].revision, 5);
    assert.equal(head.body[0].review_count, 2500);
    assert.equal(head.prefer.includes('merge-duplicates'), true);

    const sweeps = calls.filter(call => call.method === 'DELETE' && call.path.startsWith('/rest/v1/sentil_review'));
    assert.equal(sweeps.length, 2, 'satu sapuan yatim sebelum tulis, satu pembuangan setelah penanda pindah');
    assert.equal(sweeps[0].path.includes('revision=gt.4'), true, 'sisa penulisan gagal di atas pointer dibuang sebelum insert');
    assert.equal(sweeps[1].path.includes('revision=lt.5'), true, 'revisi lama dibuang setelah penanda dipindah');
    const firstInsert = calls.findIndex(call => call.method === 'POST' && call.path.startsWith('/rest/v1/sentil_review'));
    assert.ok(calls.indexOf(sweeps[0]) < firstInsert, 'sapuan yatim harus mendahului penyisipan');
    const headIndex = calls.findIndex(call => call.path.startsWith('/rest/v1/sentil_dataset') && call.method === 'POST');
    assert.ok(headIndex < calls.indexOf(sweeps[1]));
  });

  test('workspace baru memulai dari revisi satu dan ulasan kosong tetap menulis penanda', async () => {
    const { calls, fetchImpl } = recorder(({ url, method }) => {
      if (method === 'GET' && url.pathname.endsWith('sentil_dataset')) return ok([]);
      return noContent();
    });
    const db = createDatabase({ env: ENV, fetchImpl });
    const saved = await db.saveSnapshot({ workspace: { id: 'ws-2', label: 'B', entity: 'b' }, dataset: { reviews: [] } });
    assert.equal(saved.revision, 1);
    assert.equal(calls.filter(call => call.method === 'POST' && call.path.startsWith('/rest/v1/sentil_review')).length, 0);
    assert.equal(calls.some(call => call.method === 'POST' && call.path.startsWith('/rest/v1/sentil_dataset')), true);
  });

  test('tolakan database surfaced sebagai DbError dengan status aslinya', async () => {
    const { fetchImpl } = recorder(({ method }) => (method === 'GET' ? ok([]) : fail(400, '{"message":"invalid input syntax"}')));
    const db = createDatabase({ env: ENV, fetchImpl });
    await assert.rejects(
      () => db.saveSnapshot({ workspace: { id: 'ws-3', label: 'C', entity: 'c' }, dataset: { reviews: [reviewOf(0)] } }),
      error => error instanceof DbError && error.status === 400 && /invalid input syntax/.test(error.detail),
    );
  });
});

describe('baca snapshot', () => {
  test('halaman ulasan dirangkai sampai halaman terakhir habis', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => ({ payload: reviewOf(index) }));
    const second = Array.from({ length: 400 }, (_, index) => ({ payload: reviewOf(1000 + index) }));
    const { calls, fetchImpl } = recorder(({ url }) => {
      if (url.pathname.endsWith('sentil_dataset')) return ok([{ revision: 7, review_count: 1400, entity: 'aud', model: {}, summary: {} }]);
      const offset = Number(url.searchParams.get('offset'));
      if (offset === 0) return ok(first);
      if (offset === 1000) return ok(second);
      return ok([]);
    });
    const db = createDatabase({ env: ENV, fetchImpl });
    const dataset = await db.loadDataset('ws-1');
    assert.equal(dataset.reviews.length, 1400);
    assert.equal(dataset.reviews[1399].id, 'r-1399');
    assert.equal(dataset.stored.revision, 7);
    assert.equal(calls.filter(call => call.path.startsWith('/rest/v1/sentil_review')).length, 2, 'halaman pendek menghentikan paging tanpa permintaan tambahan');
    assert.equal(calls[1].path.includes('revision=eq.7'), true, 'hanya revisi aktif yang dibaca');
  });

  test('workspace tanpa snapshot mengembalikan null, bukan data kosong yang mengira berhasil', async () => {
    const { fetchImpl } = recorder(() => ok([]));
    const db = createDatabase({ env: ENV, fetchImpl });
    assert.equal(await db.loadDataset('ws-none'), null);
  });

  test('daftar workspace dipetakan ke bentuk klien', async () => {
    const { fetchImpl } = recorder(() => ok([{
      id: 'ws-9',
      label: 'Audit',
      entity: 'aud',
      stores: { play: { appId: 'com.aud' } },
      channels: { news: { enabled: true } },
      snapshot: { reviews: 12 },
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
      last_synced_at: null,
    }]));
    const db = createDatabase({ env: ENV, fetchImpl });
    const [workspace] = await db.listWorkspaces();
    assert.deepEqual(Object.keys(workspace).sort(), ['channels', 'createdAt', 'entity', 'id', 'label', 'lastSyncedAt', 'snapshot', 'stores', 'updatedAt'].sort());
    assert.equal(workspace.stores.play.appId, 'com.aud');
  });

  test('permintaan yang gagal di jaringan dilaporkan sebagai db_unreachable', async () => {
    const db = createDatabase({ env: ENV, fetchImpl: async () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }); } });
    await assert.rejects(() => db.listWorkspaces(), error => error.code === 'db_unreachable' && /TimeoutError/.test(error.message));
  });
});


describe('kontrak skema db/supabase.sql', () => {
  const sql = readFileSync(new URL('../db/supabase.sql', import.meta.url), 'utf8');
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(match => match[1]);
  // Yang diuji hanyalah bagian yang benar-benar jalan: skema menyimpan contoh kebijakan
  // baca untuk peramban sebagai komentar, dan itu belum boleh dihitung sebagai hak.
  const active = sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');

  test('setiap tabel yang dibuat dikunci RLS dan dicabut dari anon', () => {
    assert.ok(tables.length >= 5, `tabel yang dikenal terlalu sedikit: ${tables.join(',')}`);
    for (const table of tables) {
      assert.match(sql, new RegExp(`alter table public\.${table} +enable row level security`), `${table} tanpa RLS`);
      assert.match(sql, new RegExp(`revoke all on public\.${table} +from anon, authenticated`), `${table} masih bisa dibaca publishable key`);
    }
  });

  test('tabel kuota dan fungsi pengambil jatah ada serta atomik', () => {
    assert.ok(tables.includes('sentil_quota'), 'kuota tidak akan tersimpan lintas instance function');
    assert.match(sql, /primary key \(scope, bucket\)/);
    assert.match(sql, /create or replace function public\.sentil_take_slot\(/);
    assert.match(sql, /on conflict \(scope, bucket\) do update/i);
    assert.match(sql, /where q\.hits < p_limit/i, 'naik hanya selama belum melewati batas');
    assert.match(sql, /language sql/i, 'satu statement supaya ambil jatah dan baca hasilnya tidak terpisah');
  });

  test('hanya service_role yang boleh menyentuh skema ini', () => {
    assert.match(sql, /grant execute on function public\.sentil_take_slot\(text, bigint, integer, integer\) to service_role/);
    assert.equal(/to anon/.test(active), false, 'tidak ada hak yang diberikan ke peran publik');
    assert.equal(/to authenticated/.test(active), false);
    assert.equal(/create policy/.test(active), false, 'jalur baca langsung ke peramban belum waktunya dibuka');
  });
});
