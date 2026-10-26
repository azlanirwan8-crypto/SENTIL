import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createQuota, quotaConfiguration, visitorKey, windowLabel } from '../lib/rate-limit.mjs';

// Jam palsu: satu titik awal, lalu maju sesukanya. Semua jendela dihitung dari detik
// epoch, jadi menggeser jam = memindahkan bucket tanpa perlu tidur sungguhan.
function clock(startMs = Date.parse('2026-10-27T08:00:00.000Z')) {
  let current = startMs;
  return {
    now: () => current,
    advance: ms => { current += ms; },
  };
}

function fakeDb(handler) {
  const calls = [];
  return {
    enabled: true,
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      return handler(params, calls.length);
    },
  };
}

describe('kunci pengunjung', () => {
  test('memakai x-forwarded-for paling depan dan menghashnya', () => {
    const a = visitorKey({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    const b = visitorKey({ 'x-forwarded-for': '203.0.113.7' });
    assert.equal(a, b, 'rantai proxy tidak boleh mengubah kunci pengunjung yang sama');
    assert.match(a, /^[0-9a-f]{24}$/);
    assert.equal(a.includes('203.0.113.7'), false, 'alamat IP tidak pernah tersimpan mentah');
  });

  test('tanpa alamat header kunci anonim, dan salt mengubah hash', () => {
    assert.equal(visitorKey({}), 'anonymous');
    assert.notEqual(visitorKey({ 'x-real-ip': '198.51.100.9' }, 'garam-a'), visitorKey({ 'x-real-ip': '198.51.100.9' }, 'garam-b'));
  });
});

describe('konfigurasi kuota', () => {
  test('batas bawaan longgar untuk pemakaian dan ketat untuk loop', () => {
    const config = quotaConfiguration({});
    assert.equal(config.enabled, true);
    const sync = config.rules.sync;
    assert.deepEqual(sync.map(rule => rule.limit), [6, 40]);
    assert.deepEqual(sync.map(rule => rule.windowSeconds), [600, 86400]);
  });

  test('environment menaikkan atau menurunkan batas, sampah diabaikannya yang bawaan', () => {
    assert.equal(quotaConfiguration({ QUOTA_SYNC_DAY: '120' }).rules.sync[1].limit, 120);
    assert.equal(quotaConfiguration({ QUOTA_SYNC_DAY: '0' }).rules.sync[1].limit, 40, 'nol bukan batas yang sah');
    assert.equal(quotaConfiguration({ QUOTA_SYNC_DAY: 'banyak' }).rules.sync[1].limit, 40);
  });

  test('gerbang bisa dimatikan dari environment', () => {
    assert.equal(quotaConfiguration({ QUOTA_ENABLED: 'false' }).enabled, false);
    assert.equal(quotaConfiguration({ QUOTA_ENABLED: 'off' }).enabled, false);
    assert.equal(quotaConfiguration({ QUOTA_ENABLED: 'true' }).enabled, true);
  });

  test('label jendela terbaca sebagai kalimat, bukan detik', () => {
    assert.equal(windowLabel(60), '1 minute');
    assert.equal(windowLabel(600), '10 minutes');
    assert.equal(windowLabel(3600), '1 hour');
    assert.equal(windowLabel(86400), '1 day');
    assert.equal(windowLabel(172800), '2 days');
  });
});

describe('kuota di memori saat database belum ada', () => {
  test('jendela pendek menghentikan loop sebelum batas harian tersentuh', async () => {
    const time = clock();
    const quota = createQuota({ env: {}, now: time.now });
    for (let index = 0; index < 6; index += 1) {
      const verdict = await quota.take('sync', 'pengunjung-a');
      assert.equal(verdict.allowed, true, `percobaan ${index + 1} masih boleh`);
    }
    const blocked = await quota.take('sync', 'pengunjung-a');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.limit, 6);
    assert.equal(blocked.windowSeconds, 600);
    assert.equal(blocked.window, '10 minutes');
    assert.equal(blocked.hits, 7, 'percobaan yang ditolak tetap terhitung sebagai percobaan');
    assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 600);
    assert.equal(blocked.used.length, 1, 'jendela harian tidak diambil setelah jendela pendek menolak');
  });

  test('jendela mulai ulang sendiri dan pengunjung lain tidak ikut kena', async () => {
    const time = clock();
    const quota = createQuota({ env: {}, now: time.now });
    for (let index = 0; index < 6; index += 1) await quota.take('sync', 'pengunjung-a');
    assert.equal((await quota.take('sync', 'pengunjung-a')).allowed, false);
    assert.equal((await quota.take('sync', 'pengunjung-b')).allowed, true, 'kunci dihitung per pengunjung');
    time.advance(600_000 + 1);
    assert.equal((await quota.take('sync', 'pengunjung-a')).allowed, true, 'jendela sepuluh menit sudah berganti');
  });

  test('batas harian bertahan melintasi jendela-jendela pendek', async () => {
    const time = clock();
    const quota = createQuota({ env: { QUOTA_SYNC_BURST: '2', QUOTA_SYNC_DAY: '4' }, now: time.now });
    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < 2; index += 1) assert.equal((await quota.take('sync', 'p')).allowed, true);
      assert.equal((await quota.take('sync', 'p')).allowed, false, `ronde ${round}: jendela pendek menolak`);
      time.advance(600_000 + 1);
    }
    const dayFull = await quota.take('sync', 'p');
    assert.equal(dayFull.allowed, false);
    assert.equal(dayFull.windowSeconds, 86400, 'setelah jendela pendek pulih, yang menolak adalah batas harian');
    assert.equal(dayFull.window, '1 day');
  });

  test('aksi baca tidak dikenai kuota dan aksi tak dikenal tidak diblokir', async () => {
    const quota = createQuota({ env: {}, now: clock().now });
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await quota.take('state', 'p')).allowed, true);
      assert.equal((await quota.take('state', 'p')).enforced, false);
    }
  });

  test('gerbang yang dimatikan tidak pernah menghitung', async () => {
    const quota = createQuota({ env: { QUOTA_ENABLED: 'false' }, now: clock().now });
    for (let index = 0; index < 50; index += 1) {
      const verdict = await quota.take('sync', 'p');
      assert.equal(verdict.allowed, true);
      assert.equal(verdict.enforced, false);
    }
  });

  test('discover punya jatah sendiri dan lebih besar dari sync', async () => {
    const quota = createQuota({ env: {}, now: clock().now });
    for (let index = 0; index < 20; index += 1) {
      assert.equal((await quota.take('discover', 'p')).allowed, true);
    }
    assert.equal((await quota.take('discover', 'p')).allowed, false);
    assert.equal((await quota.take('sync', 'p')).allowed, true, 'keran discover tidak menghabiskan jatah sync');
  });
});

describe('kuota yang diambil dari Postgres', () => {
  test('memakai fungsi sentil_take_slot dengan batas dan bucket jendela', async () => {
    const time = clock();
    const db = fakeDb(() => [{ allowed: true, hits: 1, reset_at: '2026-10-27T08:10:00.000Z' }]);
    const quota = createQuota({ env: { QUOTA_SYNC_BURST: '1', QUOTA_SYNC_DAY: '2' }, now: time.now, db });
    const verdict = await quota.take('sync', 'abc');
    assert.equal(verdict.allowed, true);
    assert.equal(db.calls.length, 2, 'satu panggilan per jendela');
    assert.equal(db.calls[0].name, 'sentil_take_slot');
    assert.equal(db.calls[0].params.p_scope, 'sync:abc');
    assert.equal(db.calls[0].params.p_limit, 1);
    assert.equal(db.calls[0].params.p_window_seconds, 600);
    assert.equal(Number(db.calls[0].params.p_bucket) * 600 <= time.now() / 1000, true);
    assert.equal(db.calls[1].params.p_window_seconds, 86400);
    assert.equal(verdict.used[0].via, 'database');
  });

  test('penolakan dari database diteruskan apa adanya beserta reset_at-nya', async () => {
    const time = clock();
    const db = fakeDb((params, index) => (index === 1
      ? [{ allowed: false, hits: 2, reset_at: new Date(time.now() + 5 * 60_000).toISOString() }]
      : [{ allowed: true, hits: 1, reset_at: null }]));
    const quota = createQuota({ env: {}, now: time.now, db });
    const verdict = await quota.take('sync', 'abc');
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.hits, 2);
    assert.equal(db.calls.length, 1, 'jendela harian tidak diambil setelah database menolak');
    assert.ok(verdict.retryAfterSeconds <= 300 && verdict.retryAfterSeconds > 0);
  });

  test('database yang menolak menjawab jatuh ke memori, bukan menolak pengunjung', async () => {
    const time = clock();
    let attempts = 0;
    const db = fakeDb(() => { attempts += 1; throw new Error('the database rejected the request (404).'); });
    const quota = createQuota({ env: { QUOTA_SYNC_BURST: '2' }, now: time.now, db });
    const first = await quota.take('sync', 'p');
    assert.equal(first.allowed, true);
    assert.equal(first.used[0].via, 'memory-after-database-failure', 'kegagalan penyimpanan kuota tidak menolak pengunjung');
    assert.equal((await quota.take('sync', 'p')).allowed, true);
    const third = await quota.take('sync', 'p');
    assert.equal(third.allowed, false, 'memori instance tetap menghitung walau penyimpanan gagal');
    assert.equal(third.used[0].via, 'memory', 'setelah tiga kegagalan, instance berhenti mencoba sama sekali');
    assert.equal(attempts, 3, 'dua jendela dicoba sekali, lalu geretan jatuh dan tidak ada bolak-balik lagi');
    // Setelah tiga kegagalan berturut-turut instance berhenti mencoba: penarikan
    // berikutnya tidak boleh membayar bolak-balik jaringan yang pasti gagal.
    let calls = 0;
    const dead = createQuota({
      env: { QUOTA_SYNC_BURST: '5' },
      now: clock().now,
      db: fakeDb(() => { calls += 1; throw new Error('down'); }),
    });
    for (let index = 0; index < 8; index += 1) await dead.take('sync', 'p');
    assert.equal(calls, 3, 'hanya tiga percobaan pertama yang membayar bolak-balik jaringan');
  });

  test('database tanpa kunci berhenti dipanggil sama sekali', async () => {
    const db = { enabled: false, reason: 'SUPABASE_URL is not set.', calls: [], async rpc() { this.calls.push(1); return []; } };
    const quota = createQuota({ env: {}, now: clock().now, db });
    await quota.take('sync', 'p');
    assert.equal(db.calls.length, 0);
  });

  test('jawaban tanpa angka dianggap gagal dan dihitung di memori', async () => {
    const db = fakeDb(() => [{ allowed: true }]);
    const quota = createQuota({ env: { QUOTA_SYNC_BURST: '1' }, now: clock().now, db });
    assert.equal((await quota.take('sync', 'p')).allowed, true);
    assert.equal((await quota.take('sync', 'p')).allowed, false);
  });
});
