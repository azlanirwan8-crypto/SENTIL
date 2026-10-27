import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { CACHE_TTL_MS, createSyncService, fetchBudgetMs, DEFAULT_PLAY_BUDGET_MS, FIXED_RESERVE_MS, MEASURED_FETCH_ROWS_PER_SECOND, MEASURED_POST_MS_PER_ROW, SyncError } from '../lib/sync-core.mjs';

const playReview = (id, rating, text, date) => ({
  id: `play-${id}`,
  platform: 'play',
  author: `Ulasan ${id}`,
  text,
  rating,
  date,
  publishedAt: `${date}T00:00:00.000Z`,
  sourceUrl: 'https://play.google.com/store/apps/details?id=com.tes',
});

const appleReview = (id, rating, text, date) => ({
  id: `apple-${id}`,
  platform: 'appstore',
  author: 'N/A',
  text,
  rating,
  date,
  publishedAt: `${date}T00:00:00.000Z`,
  sourceUrl: 'https://apps.apple.com/id/app/id12345',
});

function fakeDeps(overrides = {}) {
  const calls = { play: 0, appstore: 0, discoverPlay: 0, discoverAppStore: 0 };
  const deps = {
    discoverGooglePlay: async () => {
      calls.discoverPlay += 1;
      return [{ appId: 'com.tes', title: 'Aplikasi Tes', developer: 'PT Tes', score: 4.2, ratings: null, url: 'https://play.example/com.tes', store: 'Google Play' }];
    },
    discoverAppStore: async () => {
      calls.discoverAppStore += 1;
      return [{ appId: '12345', title: 'Aplikasi Tes', developer: 'PT Tes', score: 4.6, ratings: 30, url: 'https://apps.example/12345', store: 'App Store' }];
    },
    fetchGooglePlayReviews: async () => {
      calls.play += 1;
      return {
        id: 'play',
        status: 'success',
        appId: 'com.tes',
        fetched: 2,
        reviews: [
          playReview('1', 5, 'mulus cepat stabil', '2026-03-02'),
          playReview('2', 1, 'eror gagal masuk', '2026-03-01'),
        ],
        app: { title: 'Aplikasi Tes', developer: 'PT Tes', url: 'https://play.example/com.tes', score: 4.2, ratingCount: 30, reviewCountReported: 2, installs: '100+', ratingHistogram: [2, 0, 0, 0, 1], ratingHistogramTotal: 3 },
        coverage: { pages: 2, rows: 2, duplicates: 0, reportedReviewCount: 2, reportedRatingCount: 30, sampleLimit: null },
        message: '2 ulasan terbaca',
        truncated: false,
        error: null,
      };
    },
    fetchAppStoreReviews: async () => {
      calls.appstore += 1;
      return {
        id: 'appstore',
        status: 'success',
        appId: '12345',
        fetched: 2,
        reviews: [
          appleReview('9', 5, 'bagus membantu', '2026-03-03'),
          appleReview('8', 2, 'lama tidak update', '2026-02-27'),
        ],
        app: { title: 'Aplikasi Tes', developer: null, url: 'https://apps.example/12345', score: 4.6, ratings: 30, ratingHistogram: [3, 0, 0, 0, 1] },
        coverage: { shelfPages: 1, feedPages: 1, shelfReviews: 2, feedReviews: 0, sharedReviews: 0, feedOnly: 0, skipped: 0 },
        message: '2 ulasan terbaca',
        truncated: false,
        error: null,
      };
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('penemuan identitas toko', () => {
  test('mengembalikan kandidat kedua toko tanpa memilihkan salah satu', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    const result = await service.discover('Aplikasi Tes');
    assert.equal(result.action, 'discover');
    assert.equal(result.play.status, 'ok');
    assert.equal(result.appstore.status, 'ok');
    assert.equal(result.play.candidates[0].appId, 'com.tes');
    assert.equal(result.appstore.candidates[0].appId, '12345');
    assert.match(result.play.message, /does not choose a candidate/i);
    assert.equal(result.selected, undefined, 'server tidak boleh menentukan pilihan');
  });

  test('cache penemuan dipakai ulang dan force menyegarkan', async () => {
    const { deps, calls } = fakeDeps();
    const service = createSyncService({ deps });
    const first = await service.discover('Aplikasi Tes');
    const second = await service.discover('aplikasi tes');
    assert.equal(first.cache.hit, false);
    assert.equal(second.cache.hit, true);
    assert.equal(calls.discoverPlay, 1);
    const forced = await service.discover('Aplikasi Tes', { force: true });
    assert.equal(forced.cache.hit, false);
    assert.equal(calls.discoverPlay, 2);
  });

  test('satu sumber gagal tidak membatalkan sumber lain', async () => {
    const { deps } = fakeDeps({
      discoverGooglePlay: async () => { throw new Error('sumber menolak'); },
    });
    const service = createSyncService({ deps });
    const result = await service.discover('Aplikasi Tes');
    assert.equal(result.play.status, 'error');
    assert.match(result.play.message, /sumber menolak/);
    assert.equal(result.appstore.status, 'ok');
  });

  test('nama entitas divalidasi di sisi server', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    await assert.rejects(() => service.discover('a'), error => error instanceof SyncError && error.code === 'entity_invalid');
    await assert.rejects(() => service.discover('x'.repeat(81)), error => error.code === 'entity_invalid');
  });
});

describe('penarikan dan analisis', () => {
  test('memvalidasi bentuk ID toko dan minimal satu kanal', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    await assert.rejects(() => service.sync({ entity: 'Aplikasi Tes' }), error => error.code === 'target_required');
    await assert.rejects(() => service.sync({ entity: 'Aplikasi Tes', playAppId: 'bukan-id' }), error => error.code === 'target_invalid');
    await assert.rejects(() => service.sync({ entity: 'Aplikasi Tes', appleAppId: '12' }), error => error.code === 'target_invalid');
  });

  test('menggabungkan kanal, membuang duplikat, dan mengurutkan terbaru', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' });
    assert.equal(result.ok, true);
    assert.equal(result.reviews.length, 4);
    assert.equal(result.reviews[0].publishedAt, '2026-03-03T00:00:00.000Z');
    assert.equal(result.summary.reviews, 4);
    assert.deepEqual(result.channels.map(channel => channel.id), ['play', 'appstore']);
    for (const channel of result.channels) {
      assert.equal(channel.reviews, undefined, 'daftar ulasan kanal tidak dikirim dua kali');
    }
    assert.equal(result.engine.dictionary, result.model.taxonomy.version, 'kamus topik dinyatakan versinya, tidak disangkal sebagai "tidak ada"');
    assert.match(result.engine.dictionaryScope, /topic names only/);
    assert.equal(result.engine.languages, result.model.languages.version);
    assert.equal(result.engine.supervision, 'weak-rating');
  });

  test('ulasan dengan ID sama pada kanal berbeda tetap dihitung terpisah', async () => {
    const { deps } = fakeDeps({
      fetchAppStoreReviews: async () => ({
        id: 'appstore', status: 'success', appId: '12345', fetched: 1,
        reviews: [{ ...appleReview('1', 5, 'bagus membantu', '2026-03-04'), id: 'play-1' }],
        app: null, coverage: null, message: '1 ulasan', truncated: false, error: null,
      }),
    });
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' });
    assert.equal(result.reviews.length, 3);
    assert.equal(result.summary.reviews, 3);
  });

  test('cache kanal berlaku satu jam dan force melewatinya', async () => {
    let clock = 1_764_000_000_000;
    const { deps, calls } = fakeDeps();
    const service = createSyncService({ deps, now: () => clock });
    const target = { entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' };
    await service.sync(target);
    const cached = await service.sync(target);
    assert.equal(cached.cache.channels.play.hit, true);
    assert.equal(calls.play, 1);
    clock += CACHE_TTL_MS + 1;
    const expired = await service.sync(target);
    assert.equal(expired.cache.channels.play.hit, false);
    assert.equal(calls.play, 2);
    const forced = await service.sync({ ...target, force: true });
    assert.equal(forced.cache.channels.play.hit, false);
    assert.equal(calls.play, 3);
  });

  test('kanal yang gagal dilaporkan apa adanya dan tidak mengorbankan kanal lain', async () => {
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async () => { throw new Error('permintaan dibatasi sumber'); },
    });
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' });
    const play = result.channels.find(channel => channel.id === 'play');
    const appstore = result.channels.find(channel => channel.id === 'appstore');
    assert.equal(play.status, 'error');
    assert.equal(play.fetched, null);
    assert.match(play.message, /permintaan dibatasi sumber/);
    assert.equal(appstore.status, 'success');
    assert.equal(result.reviews.length, 2);
    assert.equal(result.summary.channels.find(channel => channel.id === 'play').fetched, null);
  });

  test('teks ulasan tidak diubah oleh pipeline sinkronisasi', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' });
    const source = 'eror gagal masuk';
    const row = result.reviews.find(review => review.id === 'play-2');
    assert.equal(row.text, source);
    assert.equal(row.author, 'Ulasan 2');
    assert.equal(row.rating, 1);
    assert.equal(row.analysis.sentiment, 'negative');
  });

  test('teks daftar aplikasi jadi bukti, nama topik datang dari kamus domain', async () => {
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async () => ({
        id: 'play',
        status: 'success',
        appId: 'com.tes',
        fetched: 5,
        reviews: [
          playReview('1', 1, 'verifikasi akun saya tertolak terus', '2026-03-01'),
          playReview('2', 5, 'verifikasi cepat sekali membantu', '2026-03-02'),
          playReview('3', 2, 'verifikasi lama dan notifikasi tidak masuk', '2026-03-03'),
          playReview('4', 1, 'verifikasi tidak selesai sampai sekarang', '2026-03-04'),
          playReview('5', 2, 'verifikasi rekening tertahan', '2026-03-05'),
        ],
        app: { title: 'Aplikasi Tes', developer: 'PT Tes', url: 'https://play.example/com.tes', score: 4.2, ratingCount: 30, ratingHistogram: null, listing: 'Aplikasi Tes mempercepat verifikasi rekening dan notifikasi belanja.' },
        coverage: { pages: 1, rows: 5, duplicates: 0, reportedReviewCount: 5, reportedRatingCount: 30, sampleLimit: null },
        message: '5 ulasan terbaca',
        truncated: false,
        error: null,
      }),
    });
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes' });
    // Teks daftar masih diukur dan masih dipakai menguji kepadatan, tapi tidak lagi menjadi
    // nama yang tampil di chart.
    const verifikasi = result.model.listingTopics.find(topic => topic.id === 'verifikasi');
    assert.ok(verifikasi, 'istilah dari teks daftar aplikasi tetap terukur');
    assert.equal(verifikasi.low, 4, 'empat ulasan 1-2 bintang menyebut verifikasi');
    assert.equal(verifikasi.high, 1);
    assert.equal(verifikasi.listingMentions, 1);
    assert.equal(result.model.topicSource, 'domain-taxonomy');
    assert.equal(result.model.listingTopicSource, 'store-listing');
    assert.deepEqual(result.model.topics.map(topic => topic.id), ['slow_performance'], 'hanya kamus domain yang boleh menamai');
    assert.deepEqual(result.reviews.find(review => review.id === 'play-3').analysis.topics, ['slow_performance']);
    assert.deepEqual(result.reviews.find(review => review.id === 'play-1').analysis.listingTerms, ['verifikasi']);
    assert.equal(result.reviews.find(review => review.id === 'play-1').analysis.topics.length, 0, 'istilah toko tidak menempel sebagai label yang dibaca manajer');
  });

  test('ringkasan sesuai dengan model korpus yang dikembalikan', async () => {
    const { deps } = fakeDeps();
    const service = createSyncService({ deps });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345' });
    const { summary, model } = result;
    assert.equal(summary.analyzed, model.coverage.analyzed);
    assert.equal(summary.positive, model.labels.positive);
    assert.equal(summary.negative, model.labels.negative);
    assert.equal(summary.nss, model.nss);
    assert.equal(summary.rated, 4);
    assert.equal(summary.avgRating, Number(((5 + 1 + 5 + 2) / 4).toFixed(3)));
  });
});

describe('penarikan inkremental', () => {
  test('penanda tanggal diteruskan ke kanal toko dan baris lama ikut dianalisis ulang', async () => {
    const seen = { playOptions: null };
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async (appId, candidate, options) => {
        seen.playOptions = options;
        return {
          id: 'play',
          status: 'success',
          appId,
          fetched: 1,
          reviews: [playReview('3', 1, 'tidak bisa login pakai sidik jari', '2026-03-05')],
          app: { title: 'Aplikasi Tes', developer: 'PT Tes', url: 'https://play.example/com.tes', score: 4.2, ratingCount: 30, reviewCountReported: 3, installs: null, ratingHistogram: null, ratingHistogramTotal: null, listing: 'Transaksi QRIS cepat.' },
          coverage: { pages: 1, rows: 1, duplicates: 0, olderSkipped: 2, incremental: true, reportedReviewCount: 3, reportedRatingCount: 30, sampleLimit: null },
          message: '1 ulasan baru terbaca',
          truncated: false,
          error: null,
        };
      },
    });
    const service = createSyncService({ deps });
    const result = await service.sync({
      entity: 'Aplikasi Tes',
      playAppId: 'com.tes',
      since: { play: '2026-03-02T00:00:00.000Z' },
      carry: [
        { id: 'play-1', platform: 'play', rating: 5, text: 'mulus cepat stabil', publishedAt: '2026-03-02T00:00:00.000Z', analysis: { sentiment: 'positive', topics: ['harus'] } },
        { id: 'play-2', platform: 'play', rating: 1, text: 'eror gagal masuk', publishedAt: '2026-03-01T00:00:00.000Z', analysis: { sentiment: 'negative', topics: ['pake'] } },
      ],
    });
    assert.equal(seen.playOptions.since, '2026-03-02T00:00:00.000Z', 'kanal Play menerima penanda tanggal');
    assert.equal(result.reviews.length, 3, 'baris lama tidak dibuang dari analisis');
    assert.deepEqual(result.incremental, { carried: 2, fresh: 1, since: { play: '2026-03-02T00:00:00.000Z' } });
    assert.equal(result.model.coverage.reviews, 3);
    // Analisis baru menimpa label lama yang tercemar kata tugas.
    const old = result.reviews.find(row => row.id === 'play-1');
    assert.deepEqual(old.analysis.topics, [], 'ulasan lama tidak lagi membawa label dari kata tugas');
    const fresh = result.reviews.find(row => row.id === 'play-3');
    assert.deepEqual(fresh.analysis.topics, ['biometric_login', 'login_access']);
  });

  test('tidak ada baris baru dan tidak dipaksa: analisis tidak diulang, snapshot tidak ditulis ulang', async () => {
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async () => ({
        id: 'play',
        status: 'success',
        appId: 'com.tes',
        fetched: 2,
        reviews: [
          playReview('1', 5, 'mulus cepat stabil', '2026-03-02'),
          playReview('2', 1, 'eror gagal masuk', '2026-03-01'),
        ],
        app: { title: 'Aplikasi Tes', listing: null },
        coverage: { pages: 1, rows: 2, duplicates: 0, olderSkipped: 0, incremental: true },
        message: '0 ulasan baru',
        truncated: false,
        error: null,
      }),
    });
    const service = createSyncService({ deps });
    const carry = [
      { id: 'play-1', platform: 'play', rating: 5, text: 'mulus cepat stabil', publishedAt: '2026-03-02T00:00:00.000Z' },
      { id: 'play-2', platform: 'play', rating: 1, text: 'eror gagal masuk', publishedAt: '2026-03-01T00:00:00.000Z' },
    ];
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', since: { play: '2026-03-02T00:00:00.000Z' }, carry });
    assert.equal(result.unchanged, true);
    assert.equal(result.reviews, null, 'tidak ada array ulasan yang dikirim dua kali lewat jaringan');
    assert.equal(result.model, null);
    assert.deepEqual(result.incremental, { carried: 2, fresh: 0, since: { play: '2026-03-02T00:00:00.000Z' } });
    assert.match(result.message, /left exactly as they were/);
    assert.equal(result.channels.length, 1, 'kanal tetap dilaporkan supaya monitor batas sumber tidak buta');
  });

  test('force tetap menganalisis ulang walaupun tidak ada baris baru', async () => {
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async () => ({
        id: 'play',
        status: 'success',
        appId: 'com.tes',
        fetched: 1,
        reviews: [playReview('1', 5, 'mulus cepat stabil', '2026-03-02')],
        app: { title: 'Aplikasi Tes', listing: null },
        coverage: { pages: 1, rows: 1, duplicates: 0 },
        message: '1 ulasan terbaca',
        truncated: false,
        error: null,
      }),
    });
    const service = createSyncService({ deps });
    const result = await service.sync({
      entity: 'Aplikasi Tes',
      playAppId: 'com.tes',
      force: true,
      carry: [{ id: 'play-1', platform: 'play', rating: 5, text: 'mulus cepat stabil', publishedAt: '2026-03-02T00:00:00.000Z' }],
    });
    assert.equal(result.unchanged, undefined, 'penarikan paksa membangun analisis dari awal lagi');
    assert.equal(result.reviews.length, 1);
    assert.equal(result.model.version, 'corpus-rating-v3');
  });
});

describe('anggaran waktu penarikan terhadap plafon fungsi', () => {
  test('tanpa deadline, anggaran tetap dibatasi plafon baris satu penarikan', () => {
    const budget = fetchBudgetMs({ configured: DEFAULT_PLAY_BUDGET_MS });
    // 70.000 baris pada 900 baris/detik = 77,8 dtk; itu batas memori, bukan batas waktu.
    assert.ok(budget < DEFAULT_PLAY_BUDGET_MS, 'satu penarikan tidak boleh membawa korpus tak terbatas');
    assert.ok(budget >= 70_000 && budget <= 80_000, `anggaran ${budget}ms tidak sesuai plafon 70.000 baris`);
  });

  test('deadline menyisihkan biaya analisis dan tulis, bukan hanya sisa waktu', async () => {
    // 288 dtk sisa, dikurangi cadangan tetap 35 dtk = 253 dtk yang boleh dipakai.
    // Baris yang ditarik pada jendela itu harus dianalisis dan ditulis juga, jadi anggaran
    // tarik dibagi (1 + 0,6 ms/baris x 900 baris/dtk / 1000) = 1,54.
    const started = 1_800_000_000_000;
    const budget = fetchBudgetMs({
      deadlineAt: started + 120_000,
      now: started,
      configured: DEFAULT_PLAY_BUDGET_MS,
      maxRows: Number.POSITIVE_INFINITY,
    });
    assert.ok(budget < 120_000 - FIXED_RESERVE_MS, `anggaran ${budget}ms harus mengecil saat waktu menipis`);
    const rows = (budget / 1000) * MEASURED_FETCH_ROWS_PER_SECOND;
    assert.ok(budget + rows * MEASURED_POST_MS_PER_ROW + FIXED_RESERVE_MS <= 120_000, 'tarik + pasca + cadangan tidak boleh lewat plafon');
  });

  test('waktu yang sudah habis tetap diberi ruang menulis, bukan nol', () => {
    const started = 1_800_000_000_000;
    assert.equal(fetchBudgetMs({ deadlineAt: started - 60_000, now: started, configured: 180_000 }), 10_000);
  });

  test('kanal menerima anggaran yang sudah disesuaikan deadline', async () => {
    const seen = [];
    const { deps } = fakeDeps({
      fetchGooglePlayReviews: async (appId, candidate, options) => {
        seen.push(options.budgetMs);
        return { id: 'play', status: 'success', appId, fetched: 0, reviews: [], app: {}, coverage: {}, message: 'kosong', truncated: true, error: null };
      },
    });
    const service = createSyncService({ deps });
    const started = Date.now();
    await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', deadlineAt: started + 100_000 });
    assert.equal(seen.length, 1);
    assert.ok(seen[0] < DEFAULT_PLAY_BUDGET_MS, `anggaran ${seen[0]}ms harus diperkecil oleh deadline 100 dtk`);
    assert.ok(seen[0] >= 10_000);
  });
});
