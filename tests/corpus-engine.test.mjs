import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  analyzeCorpus,
  ENGINE_VERSION,
  STOPWORD_FRACTION,
  normalizeText,
  normalizeToken,
  tokenize,
} from '../lib/corpus-engine.mjs';

let filler = 0;
const uniqueFiller = () => `isi${(filler += 1)}`;
const makeReview = (rating, words, index) => ({
  id: `r-${index}`,
  platform: index % 2 ? 'play' : 'appstore',
  rating,
  text: [words, uniqueFiller(), uniqueFiller()].join(' '),
  publishedAt: `2026-03-${String((index % 27) + 1).padStart(2, '0')}T00:00:00.000Z`,
});

// Korpus dengan pembuang frekuensi tinggi yang netral kelas ("sekali") agar uji stopword
// deterministik, ditambah banyak token unik supaya ambang 2% korpus memuat beberapa kandidat.
function buildCorpus({ lowExtra = [], highExtra = [] } = {}) {
  const rows = [];
  for (let index = 0; index < 20; index += 1) {
    rows.push(makeReview(5, ['mulus', 'sekali', ...highExtra].join(' '), index));
  }
  for (let index = 0; index < 20; index += 1) {
    rows.push(makeReview(1, ['eror', 'sekali', ...lowExtra].join(' '), index + 20));
  }
  for (let index = 0; index < 140; index += 1) {
    rows.push({ id: `fill-${index}`, platform: 'play', rating: null, text: `isiX${index} sekali`, publishedAt: '2026-03-02T00:00:00.000Z' });
  }
  return rows;
}

describe('normalisasi otonom', () => {
  test('membuang HTML, entity, tautan, dan emoji', () => {
    const cleaned = normalizeText('<p>bagus</p> &amp; cepat https://contoh.id/x 🚀');
    assert.equal(cleaned.includes('<p>'), false);
    assert.equal(cleaned.includes('https://'), false);
    assert.equal(cleaned.includes('🚀'), false);
    assert.match(cleaned, /bagus/);
  });

  test('mereduksi huruf berulang tiga kali atau lebih tanpa kamus', () => {
    assert.equal(normalizeToken('ngelaggggg'), 'ngelag');
    assert.equal(normalizeToken('mantaaap'), 'mantap');
    assert.equal(normalizeToken('lapaaaar'), 'lapar');
  });

  test('mempertahankan huruf ganda yang sah dan menurunkan duplikasi utuh', () => {
    assert.equal(normalizeToken('panas'), 'panas');
    assert.equal(normalizeToken('hallo'), 'hallo');
    assert.equal(normalizeToken('terimakasih'), 'terimakasih');
    assert.equal(normalizeToken('belakali'), 'belakali');
    assert.equal(normalizeToken('sukasuka'), 'suka');
  });

  test('tokenize membuang token pendek, angka murni, dan aksen', () => {
    const tokens = tokenize('Aplikasi éxcelent 5x saya ok');
    assert.equal(tokens.includes('a'), false);
    assert.equal(tokens.includes('ok'), false);
    assert.equal(tokens.includes('5x'), false);
    assert.equal(tokens.includes('excelent'), true);
    assert.equal(tokens.includes('aplikasi'), true);
  });
});

describe('mesin korpus tanpa kamus', () => {
  test('versi mesin konstan dan tidak ada kamus yang diekspor', async () => {
    const module = await import('../lib/corpus-engine.mjs');
    assert.equal(ENGINE_VERSION, 'corpus-rating-v1');
    const dictionaryExports = Object.keys(module).filter(key => /dictionary|lexicon|keyword/i.test(key));
    assert.deepEqual(dictionaryExports, []);
  });

  test('setiap baris dihitung: total label sama persis dengan jumlah ulasan', () => {
    const { rows, model } = analyzeCorpus(buildCorpus());
    assert.equal(model.coverage.reviews, rows.length);
    const labels = model.labels;
    assert.equal(labels.positive + labels.negative + labels.neutral + labels.unclassified, rows.length);
    assert.equal(rows.length, 180);
  });

  test('stopword diambil dari 2% frekuensi teratas korpus', () => {
    const { model } = analyzeCorpus(buildCorpus());
    assert.equal(model.metrics.stopwordFraction, STOPWORD_FRACTION);
    assert.ok(model.metrics.stopwordCandidates >= 1, 'ambang 2% harus menghasilkan kandidat');
    assert.ok(model.metrics.stopwordsRemoved >= 1);
    const removed = model.terms.stopwords.map(entry => entry.term);
    assert.ok(removed.includes('sekali'), 'kata paling sering yang netral kelas harus dibuang');
    assert.ok(model.metrics.stopwordsRemoved <= model.metrics.stopwordCandidates);
    assert.ok(model.metrics.stopwordCandidates <= Math.floor(model.metrics.vocabulary * STOPWORD_FRACTION) + 1);
  });

  test('kata frekuensi tinggi yang diskriminatif dipertahankan, bukan dibuang', () => {
    const { model } = analyzeCorpus(buildCorpus({ lowExtra: ['tidak'] }));
    const protectedTerms = model.terms.protectedStopwords.map(entry => entry.term);
    const removed = model.terms.stopwords.map(entry => entry.term);
    assert.ok(protectedTerms.includes('tidak'), 'kata sering yang memisahkan kelas rating harus jadi fitur');
    assert.equal(removed.includes('tidak'), false);
    assert.ok(model.metrics.protectedSignalTerms >= 1);
  });

  test('bobot kata dipelajari dari korelasi bintang, bukan aturan manual', () => {
    const { model } = analyzeCorpus(buildCorpus());
    const positive = model.terms.positive.find(entry => entry.term === 'mulus');
    const negative = model.terms.negative.find(entry => entry.term === 'eror');
    assert.ok(positive, 'kata yang hanya muncul di bintang 5 harus berbobot positif');
    assert.ok(negative, 'kata yang hanya muncul di bintang 1 harus berbobot negatif');
    assert.ok(positive.weight > 0);
    assert.ok(negative.weight < 0);
    assert.equal(model.metrics.smoothing, 'jeffreys-0.5');
    assert.ok(Math.abs(positive.weight) <= 4 && Math.abs(negative.weight) <= 4, 'bobot harus tercekang rentang');
  });

  test('NSS dan label dihitung dari rumus yang sama seperti yang ditampilkan', () => {
    const { model } = analyzeCorpus(buildCorpus());
    const { positive, negative, neutral } = model.labels;
    const analyzed = positive + negative + neutral;
    assert.equal(model.coverage.analyzed, analyzed);
    assert.equal(model.nss, Number((((positive - negative) / analyzed) * 100).toFixed(4)));
  });

  test('batas netral mencegah skor dekat ambang dipaksa ke salah satu kelas', () => {
    const { model } = analyzeCorpus(buildCorpus());
    assert.ok(model.metrics.neutralMargin > 0);
    assert.ok(model.metrics.threshold < model.metrics.highMedian);
    assert.ok(model.metrics.threshold > model.metrics.lowMedian);
    assert.ok(model.metrics.separation > 0);
  });

  test('klaster hanya dibentuk dari ulasan rating rendah dan tidak melebih jumlah dokumennya', () => {
    const rows = buildCorpus();
    const { model } = analyzeCorpus(rows);
    const lowWithText = rows.filter(review => review.rating <= 2 && review.text.trim().length).length;
    assert.ok(model.clusters.length > 0);
    assert.ok(model.clusters.length <= 12);
    for (const cluster of model.clusters) {
      assert.ok(cluster.count <= lowWithText, 'jumlah ulasan klaster tidak boleh melebihi dokumen rating rendah');
      assert.ok(cluster.terms.length >= 1);
      assert.ok(cluster.threshold > 0 && cluster.threshold <= 1);
    }
  });

  test('agregat harian dan kanal menutup seluruh baris', () => {
    const { model } = analyzeCorpus(buildCorpus());
    const dailyTotal = model.daily.reduce((sum, day) => sum + day.total, 0);
    const platformTotal = model.platforms.reduce((sum, platform) => sum + platform.total, 0);
    assert.equal(platformTotal, model.coverage.reviews);
    assert.equal(dailyTotal + model.coverage.undated, model.coverage.reviews);
    for (const day of model.daily) {
      assert.equal(day.positive + day.negative + day.neutral + day.unclassified, day.total);
    }
  });

  test('korpus tanpa kelas kontras menghasilkan status insufficient, bukan angka karangan', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `h-${index}`,
      platform: 'play',
      rating: 5,
      text: `aplikasi bagus ${uniqueFiller()} ${uniqueFiller()}`,
      publishedAt: '2026-04-01T00:00:00.000Z',
    }));
    const { model } = analyzeCorpus(rows);
    assert.equal(model.status, 'insufficient');
    assert.equal(model.nss, null);
    assert.equal(model.metrics.threshold, null);
    assert.equal(model.labels.unclassified, rows.length);
    assert.deepEqual(model.clusters, []);
  });

  test('masukan kosong dan non-array tidak melempar', () => {
    for (const input of [[], null, undefined, 'bukan daftar']) {
      const { rows, model } = analyzeCorpus(input);
      assert.deepEqual(rows, []);
      assert.equal(model.coverage.reviews, 0);
      assert.equal(model.nss, null);
      assert.equal(model.status, 'insufficient');
    }
  });

  test('ulasan tanpa teks tetap dihitung sebagai baris tetapi tidak diberi label', () => {
    const rows = [
      ...buildCorpus(),
      { id: 'tanpa-teks', platform: 'play', rating: 2, text: '', publishedAt: '2026-03-05T00:00:00.000Z' },
    ];
    const { model } = analyzeCorpus(rows);
    assert.equal(model.coverage.reviews, rows.length);
    assert.equal(model.coverage.withoutText, 1);
    assert.ok(model.labels.unclassified >= 1);
  });
});
