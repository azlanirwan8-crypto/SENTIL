import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { CACHE_TTL_MS, createSyncService, SyncError } from '../lib/sync-core.mjs';

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
    assert.match(result.play.message, /tidak memilih kandidat/i);
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
    assert.equal(result.engine.dictionary, 'none');
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
