import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  analyzeCorpus,
  ENGINE_VERSION,
  normalizeText,
  normalizeToken,
  tokenize,
} from '../lib/corpus-engine.mjs';

let filler = 0;
const uniqueFiller = () => `isi${(filler += 1)}`;
// Teks daftar aplikasi tiruan: memuat nama fitur panjang yang dipakai ulasan uji di bawah.
const TOPIC_LISTING = 'Aplikasi Contoh menawarkan transaksi cepat, verifikasi aman, dan notifikasi instan untuk QRIS serta EDC merchant.';
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

function buildTopicCorpus() {
  const groups = [['transaksi', 24, 1], ['verifikasi', 18, 2], ['notifikasi', 12, 1]];
  const rows = [];
  let index = 0;
  for (const [term, count, rating] of groups) {
    for (let i = 0; i < count; i += 1) {
      rows.push({ id: `low-${index}`, platform: 'play', rating, text: `${term} eror ${uniqueFiller()} ${uniqueFiller()}`, publishedAt: '2026-06-01T00:00:00.000Z' });
      index += 1;
    }
  }
  for (let i = 0; i < 20; i += 1) {
    rows.push({ id: `high-${i}`, platform: 'appstore', rating: 5, text: `mulus ${uniqueFiller()} ${uniqueFiller()}`, publishedAt: '2026-06-02T00:00:00.000Z' });
  }
  for (let i = 0; i < 30; i += 1) {
    rows.push({ id: `nr-${i}`, platform: 'play', rating: null, text: `isiX${i}`, publishedAt: '2026-06-03T00:00:00.000Z' });
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
    assert.equal(ENGINE_VERSION, 'corpus-rating-v2');
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

  test('pemisah kosakata adalah uji kemaknaan, bukan fraksi frekuensi yang dipilih tangan', () => {
    const { model } = analyzeCorpus(buildCorpus());
    const informative = model.metrics.informativeTerms;
    const dull = model.metrics.nonInformativeTerms;
    assert.ok(informative >= 1, 'korpus ini punya istilah yang bisa dibedakan dari nol');
    assert.ok(dull >= 1, 'dan istilah yang tidak bisa dibedakan juga harus dihitung');
    assert.equal(informative + dull, model.metrics.vocabulary, 'pemisahan harus menutup seluruh kosakata');
    assert.equal(model.metrics.stopwordFraction, undefined, 'tidak ada lagi fraksi 2% yang dilaporkan');
    const removed = model.terms.stopwords.map(entry => entry.term);
    assert.ok(removed.includes('sekali'), 'kata sering yang netral terhadap kelas harus jadi beban kosakata');
  });

  test('kata sering yang memisahkan kelas rating tidak masuk daftar beban kosakata', () => {
    const { model } = analyzeCorpus(buildCorpus({ lowExtra: ['tidak'] }));
    const removed = model.terms.stopwords.map(entry => entry.term);
    assert.equal(removed.includes('tidak'), false, 'kata yang terbukti memisahkan kelas bukan beban kosakata');
  });

  test('daftar beban kosakata tidak memangkas fitur skoring: korpus kecil tetap terklasifikasi', () => {
    const { model } = analyzeCorpus(buildCorpus());
    assert.ok(model.metrics.learnedTerms >= 1, 'setiap istilah dengan bukti tetap mendapat bobot');
    const classified = model.labels.positive + model.labels.negative + model.labels.neutral;
    assert.ok(classified > 0, 'pemangkasan kosakata tidak boleh membuat mesin berhenti mengklasifikasi');
    assert.equal(model.labels.unclassified, model.coverage.reviews - classified);
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

  test('pita netral hanya diklaim kalau ulasan 3 bintang benar-benar memberi bukti', () => {
    const { model } = analyzeCorpus(buildCorpus());
    // Korpus uji ini tidak memuat ulasan 3 bintang, jadi mesin tidak punya dasar untuk
    // membentuk pita netral dan harus mengakuinya dengan margin 0 — bukan mengarang pita dari
    // selisih median seperti versi sebelumnya.
    assert.equal(model.coverage.midRatings, 0);
    assert.equal(model.metrics.neutralMargin, 0);
    assert.equal(model.labels.neutral, 0);

    // Dengan ulasan 3 bintang yang memuat campuran istilah berbobot, pita netral terbentuk
    // dan batasnya berada di antara median kelas.
    const rows = [];
    let id = 0;
    const push = (rating, text) => rows.push({ id: `r${id++}`, platform: 'play', rating, text, publishedAt: '2026-01-01T00:00:00Z' });
    for (let i = 0; i < 40; i += 1) push(1, 'rusak lambat error');
    for (let i = 0; i < 40; i += 1) push(2, 'rusak lambat error hang');
    for (let i = 0; i < 40; i += 1) push(5, 'mantap halus cepat');
    for (let i = 0; i < 40; i += 1) push(4, 'mantap halus aman');
    for (let i = 0; i < 40; i += 1) push(3, i % 2 ? 'mantap lambat' : 'rusak cepat');
    const spread = analyzeCorpus(rows);
    assert.ok(spread.model.metrics.neutralMargin > 0, 'bukti 3 bintang harus menghasilkan pita netral');
    assert.ok(spread.model.labels.neutral > 0, 'skor di dalam pita tidak dipaksa ke salah satu kelas');
    assert.ok(spread.model.metrics.threshold > spread.model.metrics.lowMedian);
    assert.ok(spread.model.metrics.threshold < spread.model.metrics.highMedian);
    assert.equal(spread.model.labels.positive + spread.model.labels.negative + spread.model.labels.neutral + spread.model.labels.unclassified, rows.length);
  });

  test('topik hanya dibentuk dari ulasan rating rendah dan tidak melebih jumlah dokumennya', () => {
    const rows = buildTopicCorpus();
    const { model } = analyzeCorpus(rows, { listing: TOPIC_LISTING, entity: 'Contoh App' });
    const lowWithText = rows.filter(review => review.rating <= 2 && review.text.trim().length).length;
    assert.deepEqual(model.topics.map(topic => topic.id), ['transaksi', 'verifikasi', 'notifikasi'], 'diurutkan dari keluhan terbanyak');
    assert.equal(model.topics[0].low, 24);
    assert.equal(model.topics[1].low, 18);
    assert.equal(model.topics[2].low, 12);
    assert.equal(model.coverage.topicReviews, 54, 'setiap ulasan keluhan mendapat topiknya');
    for (const topic of model.topics) {
      assert.ok(topic.low <= lowWithText, 'jumlah keluhan topik tidak boleh melebihi dokumen rating rendah');
      assert.ok(topic.total >= topic.low, 'total sebutan harus menutup jumlah keluhan');
      assert.ok(topic.share > 0 && topic.share <= 100, 'porsi dihitung dari pool keluhan 1-2 bintang');
      assert.ok(topic.listingMentions >= 1, 'setiap topik harus benar-benar tertulis di teks daftar aplikasi');
    }
  });

  test('baris topik menutup dirinya: jumlah baris per topik sama dengan total sebutan', () => {
    const rows = buildTopicCorpus();
    const { rows: enriched, model } = analyzeCorpus(rows, { listing: TOPIC_LISTING, entity: 'Contoh App' });
    const counted = new Map();
    for (const row of enriched) {
      for (const id of row.analysis.topics || []) {
        assert.ok(model.topics.some(topic => topic.id === id), `topik ${id} harus terdaftar di model`);
        counted.set(id, (counted.get(id) || 0) + 1);
      }
    }
    for (const topic of model.topics) {
      assert.equal(counted.get(topic.id), topic.total, `baris topik ${topic.id} harus sama dengan total sebutannya`);
    }
    assert.equal(counted.size, model.topics.length, 'setiap topik terdaftar harus punya baris');
    assert.equal(enriched.filter(row => (row.analysis.topics || []).length).length, model.coverage.topicReviews);
    assert.ok(model.coverage.topicReviews <= model.coverage.withText, 'baris tanpa teks tidak boleh berpura-pura punya topik');
  });

  test('topik menolak nama proyek, kata tugas pendek, dan istilah yang lebih sering dipuji', () => {
    const listing = 'Contoh App mempercepat transaksi QRIS. Kami juga membantu verifikasi akun serta notifikasi belanja. Dan bisa juga sesuai seperti sekarang aplikasinya.';
    const rows = [];
    let index = 0;
    const push = (rating, text) => {
      rows.push({ id: `t-${index}`, platform: 'play', rating, text: `${text} isi${(index += 1)}`, publishedAt: '2026-06-01T00:00:00.000Z' });
    };
    for (let i = 0; i < 30; i += 1) push(1, 'transaksi qris gagal terus');
    for (let i = 0; i < 24; i += 1) push(2, 'verifikasi akun tidak selesai');
    for (let i = 0; i < 18; i += 1) push(1, 'notifikasi tidak masuk');
    for (let i = 0; i < 20; i += 1) push(5, 'verifikasi cepat sekali');
    const { model } = analyzeCorpus(rows, { listing, entity: 'Contoh App' });
    const ids = model.topics.map(topic => topic.id);
    assert.deepEqual(ids, ['qris', 'transaksi', 'notifikasi'], 'topik diurutkan dari keluhan terbanyak');
    for (const banned of ['contoh', 'app', 'dan', 'bisa', 'juga', 'akun', 'selesai', 'aplikasinya', 'sekarang']) {
      assert.equal(ids.includes(banned), false, `${banned} bukan topik: nama proyek, kata tugas pendek, atau bentuk berjulukan`);
    }
    assert.equal(ids.includes('verifikasi'), false, 'verifikasi lebih sering dipuji daripada dikeluhkan di korpus ini');
    const qris = model.topics[0];
    assert.equal(qris.name, 'QRIS', 'label memakai bentuk tulisan di teks toko, bukan hasil penormalan');
    assert.equal(qris.nameLike, true, 'akronim kapital menjadi topik walau panjangnya empat huruf');
    assert.equal(qris.low, 30);
    assert.equal(qris.high, 0);
    assert.equal(model.topics.find(topic => topic.id === 'notifikasi').low, 18);
    assert.ok(qris.listingMentions >= 1);
  });

  test('tanpa teks daftar aplikasi tidak ada topik yang dikarang', () => {
    const rows = buildCorpus();
    const { rows: enriched, model } = analyzeCorpus(rows);
    assert.deepEqual(model.topics, []);
    assert.equal(model.coverage.topicReviews, 0);
    assert.equal(model.topicSource, null);
    assert.ok(enriched.every(row => row.analysis.topics.length === 0), 'baris tidak boleh punya topik tanpa sumber');
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
    assert.deepEqual(model.topics, []);
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
