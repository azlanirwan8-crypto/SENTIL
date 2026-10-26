import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncService } from '../lib/sync-core.mjs';
import {
  attemptFromChannel,
  classifyIssue,
  httpStatusFromText,
  LIMIT_STATES,
  monitorFromDataset,
  pushAttempt,
  retryAfterMsFrom,
  summarizeSource,
} from '../lib/limit-monitor.mjs';

const at = '2026-10-25T10:00:00.000Z';

const playChannel = overrides => ({
  id: 'play',
  status: 'success',
  fetched: 57,
  appId: 'id.bni.wfb',
  app: { ratingCount: 77, reviewCountReported: 57 },
  coverage: {
    pools: [
      { label: 'kumpulan bahasa Indonesia', pages: 1, rows: 51, added: 51, complete: true, error: null },
      { label: 'kumpulan bahasa Inggris', pages: 1, rows: 6, added: 6, complete: true, error: null },
    ],
    pages: 2,
    rows: 57,
    reportedReviewCount: 57,
    reportedRatingCount: 77,
  },
  limits: { issues: [] },
  truncated: false,
  error: null,
  ...overrides,
});

describe('klasifikasi sinyal batas sumber', () => {
  test('kode HTTP terbaca dari pesan kegagalan nyata kolektor', () => {
    assert.equal(httpStatusFromText('sumber mengembalikan HTTP 429'), 429);
    assert.equal(httpStatusFromText('detail toko tidak terbaca (sumber mengembalikan HTTP 403)'), 403);
    assert.equal(httpStatusFromText('kumpulan bahasa Indonesia: socket hang up'), null);
  });

  test('429 dan quota masuk kategori batas pemakaian, bukan kegagalan biasa', () => {
    const rate = classifyIssue('sumber mengembalikan HTTP 429');
    assert.equal(rate.kind, 'rate-limit');
    assert.equal(rate.httpStatus, 429);
    assert.equal(classifyIssue('Too Many Requests').kind, 'rate-limit');
    assert.equal(classifyIssue('permintaan ditolak: quota exceeded').kind, 'rate-limit');
  });

  test('Retry-After dibaca dari header maupun teks', () => {
    assert.equal(retryAfterMsFrom('Retry-After: 30'), 30000);
    assert.equal(retryAfterMsFrom('tidak ada header'), null);
    assert.equal(retryAfterMsFrom('Retry-After: 99999'), null, 'nilai di luar nalar tidak dipakai');
    assert.equal(classifyIssue('sumber mengembalikan HTTP 429', { retryAfterMs: 45000 }).retryAfterMs, 45000);
  });

  test('penolakan, tidak tersedia, batas waktu, batas halaman, dan perubahan struktur terpisah', () => {
    assert.equal(classifyIssue('sumber mengembalikan HTTP 403').kind, 'blocked');
    assert.equal(classifyIssue('sumber mengembalikan HTTP 503').kind, 'unavailable');
    assert.equal(classifyIssue('kumpulan bahasa Inggris: batas waktu pengambilan tercapai').kind, 'timeout');
    assert.equal(classifyIssue('network_error: fetch failed').kind, 'network');
    assert.equal(classifyIssue('feed belum tentu habis dalam batas halaman/waktu').kind, 'page-cap');
    assert.equal(classifyIssue('kumpulan bahasa Indonesia: token halaman berikutnya berulang').kind, 'page-cap');
    assert.equal(classifyIssue('parse_error: struktur data ulasan App Store berubah').kind, 'parse-changed');
    assert.equal(classifyIssue('detail toko tidak terbaca (respons bukan JSON yang sah)').kind, 'parse-changed');
    assert.equal(classifyIssue('struktur data: 2 baris tanpa ID ulasan dibuang').kind, 'parse-changed');
  });

  test('kode HTTP di luar pola http biasa tetap dikenali', () => {
    assert.equal(classifyIssue('request gagal: status code 500').kind, 'unavailable');
    assert.equal(classifyIssue('statuscode 429 dari sumber').kind, 'rate-limit');
    assert.equal(classifyIssue('sumber mengembalikan HTTP 408').kind, 'timeout');
    assert.equal(classifyIssue('TimeoutError: deadline dilewati').kind, 'timeout');
    assert.equal(classifyIssue('item lain yang tidak dikenal').kind, 'unknown');
  });
});

describe('riwayat percobaan tanpa salinan kanal', () => {
  const attempt = overrides => ({
    at,
    ms: 900,
    cacheAgeMs: null,
    status: 'error',
    fetched: 0,
    kinds: ['network'],
    limited: false,
    cacheHit: false,
    pages: null,
    httpStatuses: [],
    ...overrides,
  });

  test('percobaan gagal terakhir dinilai Gagal dibaca, bukan Belum ditarik', () => {
    const source = summarizeSource(null, { id: 'play', attempts: [attempt()], now: Date.parse(at) });
    assert.equal(source.state, 'failed');
    assert.equal(source.stateLabel, LIMIT_STATES.failed.label);
    assert.equal(source.staleLedger, true);
    assert.equal(source.read, null);
    assert.match(source.note, /the last attempt ended error/);
  });

  test('percobaan terakhir yang membentur batas dinilai Limit habis dan memberi jeda', () => {
    const source = summarizeSource(null, {
      id: 'appstore',
      attempts: [attempt({ kinds: ['rate-limit'], limited: true, status: 'partial' })],
      now: Date.parse(at),
    });
    assert.equal(source.state, 'exhausted');
    assert.equal(source.cooldownMs, 60000, 'jeda baku dipakai ketika Retry-After tidak ada');
    assert.equal(source.nextSafeAt, Date.parse(at) + 60000);
  });

  test('instance yang benar-benar belum pernah mencoba tetap Belum ditarik', () => {
    const source = summarizeSource(null, { id: 'play', attempts: [], now: Date.parse(at) });
    assert.equal(source.state, 'idle');
    assert.equal(source.staleLedger, false);
    assert.equal(source.nextSafeAt, null, 'waktu tanpa jangkar tidak boleh menghasilkan NaN');
  });

  test('hitungan masalah hanya memakai percobaan yang benar-benar memanggil sumber', () => {
    const source = summarizeSource(playChannel({}), {
      attempts: [
        attempt(),
        attempt({ cacheHit: true, status: 'success', fetched: 57, kinds: [] }),
        attempt({ at: '2026-10-25T10:05:00.000Z', status: 'partial' }),
      ],
      now: Date.parse(at),
    });
    assert.equal(source.sourceCalls, 2, 'cache hit bukan panggilan sumber');
    assert.equal(source.errorCount, 2);
    assert.equal(source.attempts, 3);
  });
});

describe('status kanal untuk panel batas', () => {
  test('penarikan bersih dinilai Aktif tanpa mengarang sisa kuota', () => {
    const source = summarizeSource(playChannel({}));
    assert.equal(source.state, 'ok');
    assert.equal(source.stateLabel, LIMIT_STATES.ok.label);
    assert.equal(source.signals.length, 0);
    assert.equal(source.read, 57);
    assert.equal(source.reported, 57);
    assert.equal(source.reportedRatings, 77);
    assert.equal(source.pages, 2);
    assert.equal(source.cooldownMs, null);
    assert.equal(source.nextSafeAt, null);
  });

  test('sumber tanpa angka yang dilaporkan tetap null, bukan nol', () => {
    const source = summarizeSource(playChannel({
      app: { ratingCount: null, reviewCountReported: null },
      coverage: { pools: [], pages: 0, reportedReviewCount: null, reportedRatingCount: null },
    }));
    assert.equal(source.reported, null);
    assert.equal(source.reportedRatings, null);
  });

  test('kanal yang berhenti di tengah jalan karena batas waktu dinilai Terbatas', () => {
    const source = summarizeSource(playChannel({
      status: 'partial',
      truncated: true,
      limits: { issues: [{ source: 'kumpulan bahasa Inggris', text: 'kumpulan bahasa Inggris: batas waktu pengambilan tercapai', at }] },
    }));
    assert.equal(source.state, 'limited');
    assert.equal(source.signals[0].kind, 'timeout');
    assert.equal(source.fallback.used, true, 'satu kumpulan gagal, kumpulan lain tetap membawa hasil');
  });

  test('kanal yang seluruhnya ditolak sumber dinilai Limit habis dan memakai jeda Retry-After', () => {
    const source = summarizeSource(playChannel({
      status: 'error',
      fetched: 0,
      truncated: true,
      error: 'kumpulan bahasa Indonesia: sumber mengembalikan HTTP 429',
      limits: { issues: [{ source: 'kumpulan bahasa Indonesia', text: 'kumpulan bahasa Indonesia: sumber mengembalikan HTTP 429 (HTTP 429)', httpStatus: 429, retryAfterMs: 120000, at }] },
    }), { now: Date.parse(at) });
    assert.equal(source.state, 'exhausted');
    assert.equal(source.rateLimited, true);
    assert.equal(source.cooldownMs, 120000);
    assert.equal(new Date(source.nextSafeAt).toISOString(), '2026-10-25T10:02:00.000Z');
  });

  test('jeda tanpa informasi Retry-After memakai baku 60 detik dan dibatasi 15 menit', () => {
    const blind = summarizeSource(playChannel({
      status: 'error',
      fetched: 0,
      error: 'sumber mengembalikan HTTP 429',
      limits: { issues: [{ source: 'play', text: 'sumber mengembalikan HTTP 429', httpStatus: 429, at }] },
    }));
    assert.equal(blind.cooldownMs, 60000);
    assert.equal(new Date(blind.nextSafeAt).toISOString(), '2026-10-25T10:01:00.000Z');
    const capped = summarizeSource(playChannel({
      status: 'error',
      fetched: 0,
      limits: { issues: [{ source: 'play', text: 'HTTP 429', httpStatus: 429, retryAfterMs: 20 * 60000, at }] },
    }));
    assert.equal(capped.cooldownMs, 15 * 60000, 'Retry-After yang lebih lama dari plafon dipotong ke 15 menit');
    assert.equal(capped.nextSafeAt - Date.parse(at), 15 * 60000);
  });

  test('kanal tanpa data dan kanal yang menjawab tapi nol ulasan dibedakan', () => {
    assert.equal(summarizeSource(null).state, 'idle');
    assert.equal(summarizeSource(playChannel({ status: 'empty', fetched: 0, reviews: [] })).state, 'empty');
    assert.equal(summarizeSource(playChannel({ status: 'error', fetched: 12, error: 'network_error: fetch failed', limits: { issues: [{ text: 'network_error: fetch failed' }] } })).state, 'failed');
  });

  test('App Store menilai jalur silang sebagai fallback ketika hanya feed yang mengembalikan baris', () => {
    const source = summarizeSource({
      id: 'appstore',
      status: 'partial',
      fetched: 9,
      appId: '6741567238',
      truncated: true,
      coverage: { shelfPages: 0, feedPages: 1, shelfReviews: 0, feedReviews: 9, sharedReviews: 0, feedOnly: 9, skipped: 0, shelfError: 'sumber mengembalikan HTTP 403', feedError: null },
      limits: { issues: [{ source: 'halaman ulasan rak', text: 'sumber mengembalikan HTTP 403', httpStatus: 403 }] },
    });
    assert.equal(source.state, 'limited');
    assert.equal(source.fallback.used, true);
    assert.match(source.fallback.detail, /the customer feed covered 9 reviews/);
    assert.equal(source.pages, 1);
  });
});

describe('monitor gabungan dan catatan percobaan', () => {
  test('monitor menurunkan status terburuk dari kedua kanal', () => {
    const monitor = monitorFromDataset({
      entity: 'Wondr Merchant',
      fetchedAt: at,
      target: { playAppId: 'id.bni.wfb', appleAppId: '6741567238' },
      channels: [
        playChannel({}),
        { id: 'appstore', status: 'partial', fetched: 9, appId: '6741567238', coverage: { shelfPages: 1, feedPages: 1, feedOnly: 2, shelfError: null, feedError: null }, limits: { issues: [{ source: 'feed pelanggan', text: 'feed belum tentu habis dalam batas halaman/waktu' }] }, truncated: true },
      ],
    }, { now: Date.parse(at) });
    assert.equal(monitor.sources.length, 2);
    assert.equal(monitor.overall, 'limited');
    assert.equal(monitor.sources[0].configured, true);
    assert.equal(monitor.sources[1].state, 'limited');
    assert.match(monitor.hint, /Some paths were cut/i);
  });

  test('kanal yang tidak pernah ditarik dinilai idle dan status gabungan ikut idle', () => {
    const monitor = monitorFromDataset({ entity: 'X', fetchedAt: at, target: { playAppId: 'com.tes', appleAppId: null }, channels: [] });
    assert.equal(monitor.sources.length, 1, 'kanal yang tidak dikonfigurasi tidak memenuhi panel');
    assert.equal(monitor.sources[0].state, 'idle');
    assert.equal(monitor.sources[0].id, 'play', 'kanal tanpa data tetap dikenal sebagai kanal aslinya');
    assert.equal(monitor.sources[0].configured, true);
    assert.equal(monitor.overall, 'idle', 'belum ada penarikan tidak boleh diklaim sebagai semua jalur terbaca');
    assert.match(monitor.hint, /no limit signal to report/i);
  });

  test('kanal sosial yang menunggu kredensial dinilai Perlu kredensial, bukan gagal', () => {
    const monitor = monitorFromDataset({
      entity: 'X',
      fetchedAt: at,
      target: { playAppId: null, appleAppId: null, social: { news: { enabled: true }, youtube: { enabled: true } } },
      channels: [
        { id: 'news', status: 'success', fetched: 7, limits: { issues: [] } },
        { id: 'youtube', status: 'needs_setup', fetched: 0, limits: { issues: [] }, message: 'kunci API belum dipasang' },
      ],
    });
    const youtube = monitor.sources.find(source => source.id === 'youtube');
    assert.equal(youtube.state, 'setup');
    assert.equal(youtube.stateLabel, LIMIT_STATES.setup.label);
    assert.equal(monitor.overall, 'ok', 'kanal yang siap tidak tertutup kanal tanpa kredensial');
    const onlySetup = monitorFromDataset({
      entity: 'X',
      fetchedAt: at,
      target: { social: { youtube: { enabled: true } } },
      channels: [{ id: 'youtube', status: 'needs_setup', fetched: 0, limits: { issues: [] } }],
    });
    assert.equal(onlySetup.overall, 'setup');
    assert.match(onlySetup.hint, /waiting for credentials/i);
  });

  test('satu kanal idle tidak menutupi kanal yang terpotong', () => {
    const monitor = monitorFromDataset({
      entity: 'X',
      fetchedAt: at,
      target: { playAppId: 'com.tes', appleAppId: '12345' },
      channels: [playChannel({
        status: 'partial',
        truncated: true,
        limits: { issues: [{ source: 'kumpulan bahasa Inggris', text: 'kumpulan bahasa Inggris: batas waktu pengambilan tercapai' }] },
      })],
    });
    assert.equal(monitor.sources[0].state, 'limited');
    assert.equal(monitor.sources[1].state, 'idle');
    assert.equal(monitor.overall, 'limited');
  });

  test('catatan percobaan dipangkas pada 24 entri terakhir', () => {
    let list = [];
    for (let index = 0; index < 30; index += 1) {
      list = pushAttempt(list, { at: `2026-10-25T10:${String(index).padStart(2, '0')}:00.000Z`, status: 'success', fetched: index });
    }
    assert.equal(list.length, 24);
    assert.equal(list[0].fetched, 6);
    assert.equal(list[list.length - 1].fetched, 29);
  });

  test('percobaan menyimpan status, durasi, jalur cache, dan kode HTTP yang terlihat', () => {
    const attempt = attemptFromChannel(playChannel({
      status: 'partial',
      truncated: true,
      limits: { issues: [{ source: 'kumpulan bahasa Inggris', text: 'kumpulan bahasa Inggris: sumber mengembalikan HTTP 429 (HTTP 429)', httpStatus: 429 }] },
    }), { at, ms: 1234 });
    assert.equal(attempt.status, 'partial');
    assert.equal(attempt.ms, 1234);
    assert.equal(attempt.limited, true);
    assert.deepEqual(attempt.kinds, ['rate-limit']);
    assert.deepEqual(attempt.httpStatuses, [429]);
    assert.equal(attempt.cacheHit, false);
    const cached = attemptFromChannel(playChannel({}), { at, ms: 5000, cacheHit: true });
    assert.equal(cached.cacheHit, true);
    assert.equal(cached.limited, false);
  });
});

describe('layanan sinkron menyematkan monitor batas', () => {
  const failingPlay = async () => ({
    ...playChannel({
      status: 'error',
      fetched: 0,
      reviews: [],
      truncated: true,
      error: 'kumpulan bahasa Indonesia: sumber mengembalikan HTTP 429',
      limits: { issues: [{ source: 'kumpulan bahasa Indonesia', text: 'kumpulan bahasa Indonesia: sumber mengembalikan HTTP 429 (HTTP 429)', httpStatus: 429, retryAfterMs: 90000 }] },
    }),
    reviews: [],
  });
  const okApple = async () => ({
    id: 'appstore',
    status: 'success',
    fetched: 2,
    appId: '6741567238',
    reviews: [
      { id: 'apple-1', platform: 'appstore', author: 'A', text: 'mulus cepat', rating: 5, date: '2026-03-02', publishedAt: '2026-03-02T00:00:00.000Z' },
      { id: 'apple-2', platform: 'appstore', author: 'B', text: 'lama tidak update', rating: 1, date: '2026-03-01', publishedAt: '2026-03-01T00:00:00.000Z' },
    ],
    app: { title: 'wondr merchant by BNI', ratings: 17, ratingHistogram: [1, 0, 0, 0, 1] },
    coverage: { shelfPages: 1, feedPages: 1, shelfReviews: 2, feedReviews: 2, sharedReviews: 2, feedOnly: 0, skipped: 0, shelfError: null, feedError: null },
    limits: { issues: [] },
    truncated: false,
    error: null,
  });

  test('respons sync memuat limits per kanal beserta riwayat percobaan', async () => {
    const service = createSyncService({
      deps: { fetchGooglePlayReviews: failingPlay, fetchAppStoreReviews: okApple },
      now: () => Date.parse(at),
    });
    const result = await service.sync({ entity: 'Wondr Merchant', playAppId: 'id.bni.wfb', appleAppId: '6741567238' });
    const play = result.limits.sources.find(source => source.id === 'play');
    const apple = result.limits.sources.find(source => source.id === 'appstore');
    assert.equal(result.limits.overall, 'exhausted');
    assert.equal(play.state, 'exhausted');
    assert.equal(play.rateLimited, true);
    assert.deepEqual(play.history[0].httpStatuses, [429]);
    assert.equal(play.history.length, 1);
    assert.equal(play.cooldownMs, 90000);
    assert.equal(apple.state, 'ok');
    assert.equal(apple.cache?.hit, false);
  });

  test('aksi limits membaca dari cache instance dan limits-reset membersihkan catatan', async () => {
    const service = createSyncService({
      deps: { fetchGooglePlayReviews: failingPlay, fetchAppStoreReviews: okApple },
      now: () => Date.parse(at),
    });
    await service.sync({ entity: 'Wondr Merchant', playAppId: 'id.bni.wfb', appleAppId: '6741567238' });

    const monitor = service.limits({ entity: 'Wondr Merchant', playAppId: 'id.bni.wfb', appleAppId: '6741567238' });
    assert.equal(monitor.action, 'limits');
    assert.equal(monitor.instanceScope, 'warm instance memory');
    assert.equal(monitor.sources.find(source => source.id === 'appstore').state, 'ok', 'kanal sukses masih ada di cache');
    assert.equal(monitor.sources.find(source => source.id === 'play').state, 'exhausted', 'riwayat gagal tetap dinilai kegagalan, bukan Belum ditarik');
    assert.equal(monitor.sources.find(source => source.id === 'play').staleLedger, true);
    assert.equal(monitor.sources.find(source => source.id === 'play').read, null);
    assert.equal(monitor.sources.find(source => source.id === 'play').history.length, 1, 'riwayat percobaan tetap tinggal');

    const reset = service.resetLimits({ entity: 'Wondr Merchant', playAppId: 'id.bni.wfb', appleAppId: '6741567238' });
    assert.deepEqual(reset.cleared.cache, ['appstore:6741567238']);
    assert.equal(reset.cleared.attempts.length, 2);
    const after = service.limits({ entity: 'Wondr Merchant', playAppId: 'id.bni.wfb', appleAppId: '6741567238' });
    assert.equal(after.sources.every(source => source.state === 'idle'), true);
    assert.equal(after.sources.every(source => source.history.length === 0), true);
  });

  test('limits menolak target kosong dengan kode yang sah', () => {
    const service = createSyncService({ deps: { fetchGooglePlayReviews: failingPlay, fetchAppStoreReviews: okApple } });
    assert.throws(() => service.limits({ entity: 'Wondr Merchant' }), error => error.code === 'target_required');
  });
});
