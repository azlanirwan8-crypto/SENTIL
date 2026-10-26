import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCorpus } from '../lib/corpus-engine.mjs';
import { scopeDataset } from '../src/lib/scope.js';

const LISTING = 'DompetPay mempercepat transaksi QRIS. Kami juga melayani transfer saldo dan notifikasi pembayaran.';

// Korpus kecil dengan dua kanal, tanggal yang berbeda-beda, baris tanpa tanggal, dan satu
// istilah yang hanya hidup di keluhan supaya topik benar-benar terbentuk.
function buildDataset() {
  const rows = [];
  let index = 0;
  const push = (platform, rating, text, date) => {
    rows.push({
      id: `r${index}`,
      platform,
      store: platform === 'play' ? 'Google Play' : 'App Store',
      author: `user${index}`,
      rating,
      text,
      date,
      publishedAt: date ? `${date}T00:00:00.000Z` : null,
      sourceUrl: 'https://example.invalid',
      language: null,
      meta: { via: 'test' },
    });
    index += 1;
  };
  for (let i = 0; i < 20; i += 1) push('play', i % 2 ? 1 : 2, 'transaksi gagal terus', i % 4 ? '2026-08-01' : '2026-08-02');
  for (let i = 0; i < 12; i += 1) push('appstore', 1, 'transfer saldo lama', i % 3 ? '2026-08-03' : null);
  for (let i = 0; i < 15; i += 1) push('play', 5, 'pembayaran cepat sekali', '2026-08-04');
  for (let i = 0; i < 10; i += 1) push('appstore', 4, 'notifikasi pembayaran cepat', '2026-08-04');
  for (let i = 0; i < 4; i += 1) push('play', 3, 'biasa saja kok', '2026-08-05');
  const { rows: enriched, model } = analyzeCorpus(rows, { listing: LISTING, entity: 'DompetPay' });
  return { reviews: enriched, model, summary: {} };
}

const sentimentOf = row => row.analysis?.sentiment || 'unclassified';

function topTopic(dataset) {
  assert.ok(dataset.model.topics.length > 0, 'fixture harus membentuk setidaknya satu topik dari teks daftar toko');
  return dataset.model.topics[0];
}

describe('scope dashboard: hitung ulang agregat dari baris yang tersaring', () => {
  test('tanpa filter, hasilnya sama persis dengan angka mesin', () => {
    const dataset = buildDataset();
    const scoped = scopeDataset(dataset, {});
    assert.equal(scoped.filtered, false);
    assert.deepEqual(scoped.model.daily, dataset.model.daily, 'deret harian mesin harus tersalin utuh');
    assert.deepEqual(scoped.model.platforms, dataset.model.platforms, 'deret kanal mesin harus tersalin utuh');
    assert.equal(scoped.model.topics.length, dataset.model.topics.length);
    for (const [position, topic] of dataset.model.topics.entries()) {
      assert.deepEqual(scoped.model.topics[position], topic, `topik ${topic.id} harus sama persis`);
    }
    assert.equal(scoped.summary.analyzed, dataset.model.labels.positive + dataset.model.labels.negative + dataset.model.labels.neutral);
    assert.equal(scoped.summary.nss, dataset.model.nss);
    assert.equal(scoped.summary.unclassified, dataset.model.labels.unclassified);
    assert.equal(scoped.summary.reviews, dataset.reviews.length);
    assert.equal(scoped.summary.withText, dataset.model.coverage.withText, 'tanpa filter, jumlah berteks tetap angka mesin');
  });

  test('saring kanal: hanya baris kanal itu yang dihitung, dan seluruh deret ikut berubah', () => {
    const dataset = buildDataset();
    const play = dataset.reviews.filter(row => row.platform === 'play');
    const scoped = scopeDataset(dataset, { platform: 'play' });
    assert.equal(scoped.matched, play.length);
    assert.deepEqual(scoped.model.platforms.map(row => row.id), ['play']);
    const expected = { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
    for (const row of play) expected[sentimentOf(row)] += 1;
    assert.deepEqual(scoped.model.platforms[0], { id: 'play', ...expected, total: play.length });
    assert.equal(scoped.summary.reviews, play.length);
    assert.equal(scoped.summary.analyzed, expected.positive + expected.neutral + expected.negative);
    assert.ok(scoped.summary.withText === null, 'jumlah berteks tidak ditiru dari teks mentah saat tersaring');
  });

  test('saring topik: setiap baris yang tersisa benar-benar menyebut topik itu', () => {
    const dataset = buildDataset();
    const topic = topTopic(dataset);
    const scoped = scopeDataset(dataset, { topic: topic.id });
    assert.ok(scoped.matched > 0, 'topik teratas harus punya baris');
    for (const row of scoped.rows) assert.ok(row.analysis.topics.includes(topic.id), 'tidak ada baris tanpa topik yang ikut masuk');
    const recount = scoped.model.topics.find(entry => entry.id === topic.id);
    const low = scoped.rows.filter(row => Number.isInteger(row.rating) && row.rating <= 2).length;
    assert.equal(recount.low, low, 'jumlah keluhan topik = seluruh baris 1-2★ yang tersaring');
    assert.equal(recount.share, 100, 'pool 1-2★ filter ini seluruhnya menyebut topik ini');
    for (const other of scoped.model.topics) {
      if (other.id === topic.id) continue;
      assert.equal(other.low, 0, 'topik lain tidak boleh membawa hitungan topik yang dipilih');
    }
  });

  test('dua filter sekaligus dan kombinasi yang kosong tetap kosong, tidak dikarang', () => {
    const dataset = buildDataset();
    const topic = topTopic(dataset);
    const both = scopeDataset(dataset, { platform: 'appstore', topic: topic.id });
    const manual = dataset.reviews.filter(row => row.platform === 'appstore' && (row.analysis.topics || []).includes(topic.id));
    assert.equal(both.matched, manual.length);
    assert.equal(both.summary.reviews, manual.length);
    const empty = scopeDataset(dataset, { platform: 'appstore', topic: 'topik-yang-tidak-ada' });
    assert.equal(empty.matched, 0);
    assert.deepEqual(empty.model.daily, []);
    assert.deepEqual(empty.model.platforms, []);
    assert.equal(empty.summary.nss, null, 'tanpa bukti tidak ada skor yang ditampilkan');
    assert.equal(empty.summary.avgRating, null);
  });

  test('ulasan tanpa teks tidak ikut memperkecil porsi keluhan topik', () => {
    const dataset = buildDataset();
    const topic = topTopic(dataset);
    // Baris 1-2★ tanpa teks tidak pernah masuk pool mesin karena tidak punya token, jadi ia
    // harus tetap berada di luar pool saat angkanya dihitung ulang di sisi tampilan.
    dataset.reviews.push({ id: 'tanpa-teks', platform: 'play', rating: 1, text: '', date: '2026-08-01', analysis: { sentiment: 'unclassified', topics: [] } });
    const scoped = scopeDataset(dataset, {});
    const original = dataset.model.topics.find(entry => entry.id === topic.id);
    const shared = scoped.model.topics.find(entry => entry.id === topic.id);
    assert.equal(scoped.summary.reviews, dataset.reviews.length, 'barisnya tetap dihitung sebagai ulasan');
    assert.equal(shared.share, original.share, 'porsi topik tidak bergeser oleh baris tanpa teks');
    assert.equal(shared.low, original.low);
  });

  test('baris tanpa tanggal dihitung sebagai undated, bukan hilang diam-diam', () => {
    const dataset = buildDataset();
    const scoped = scopeDataset(dataset, { platform: 'appstore' });
    const undated = scoped.rows.filter(row => !row.date).length;
    assert.ok(undated > 0, 'fixture harus menyisakan baris tanpa tanggal');
    assert.equal(scoped.summary.undated, undated);
    assert.equal(scoped.model.daily.reduce((sum, day) => sum + day.total, 0), scoped.matched - undated);
  });

  test('pilihan filter dihitung atas seluruh baris supaya kontrol tidak berpindah-pindah', () => {
    const dataset = buildDataset();
    const plain = scopeDataset(dataset, {});
    const filtered = scopeDataset(dataset, { topic: topTopic(dataset).id });
    assert.deepEqual(filtered.options.platforms, plain.options.platforms);
    assert.equal(filtered.options.platforms.reduce((sum, entry) => sum + entry.count, 0), dataset.reviews.length);
    assert.equal(plain.options.topics[0].count, dataset.reviews.filter(row => (row.analysis.topics || []).includes(topTopic(dataset).id)).length);
  });

  test('dataset kosong tidak menjatuhkan tampilan', () => {
    const scoped = scopeDataset(undefined, { platform: 'play', topic: 'x' });
    assert.equal(scoped.matched, 0);
    assert.deepEqual(scoped.options.platforms, []);
    assert.deepEqual(scoped.options.topics, []);
    assert.equal(scoped.summary.nss, null);
  });
});
