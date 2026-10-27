import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCorpus } from '../lib/corpus-engine.mjs';
import { isJunkTerm } from '../lib/domain-taxonomy.mjs';
import { PAIN_VERSION, derivePainPoints } from '../lib/pain-points.mjs';

// Daftar kata struktur di bawah hanya alat ukur untuk tes ini. Di produksi daftar yang sama
// dihitung dari frekuensi korpus oleh buildStopwords, bukan ditulis di berkas.
const STRUCTURE = new Set(['yang', 'dan', 'di', 'ke', 'untuk', 'sangat', 'ini', 'itu', 'saya']);

const docOf = (index, rating, text) => ({ index, rating, tokens: String(text).split(/\s+/).filter(Boolean) });

function corpusOf({ negative, positive, neutral = 0, unrated = 0 }) {
  const documents = [];
  let index = 0;
  const push = (rating, text) => documents.push(docOf(index++, rating, text));
  for (const text of negative) push(1 + (index % 2), text);
  for (const text of positive) push(4 + (index % 2), text);
  for (let cursor = 0; cursor < neutral; cursor += 1) push(3, 'lumayan lah biasa aja');
  for (let cursor = 0; cursor < unrated; cursor += 1) push(null, 'tidak_rating sama sekali');
  return documents;
}

const contains = (haystack, needle) => {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

const SERVER_CORPUS = {
  negative: [
    'server error terus dari pagi',
    'server error bikin rugi uang saya',
    'hampir tiap jam server error muncul',
    'server error waktu transfer saldo jalan',
    'lagi butuh uang malah server error',
    'server error terus laporan tidak masuk',
    'dibuka malam hari server error lagi',
    'kenapa server error tidak selesai selesai',
  ],
  positive: [
    'mantap sekali fitur baru enak',
    'mantap sekali transfer cepat sekali',
    'mantap sekali desain nyaman dipakai',
    'mantap sekali aman tidak pernah masalah',
    'mantap sekali layanan bantu cepat',
    'mantap sekali mudah dipakai harian',
  ],
};

describe('frasa pain point dari klaster negatif', () => {
  test('frasa yang hanya hidup di ulasan rating rendah diangkat apa adanya', () => {
    const result = derivePainPoints(corpusOf(SERVER_CORPUS), STRUCTURE);
    assert.equal(result.version, PAIN_VERSION);
    assert.equal(result.status, 'ready');
    assert.equal(result.pools.negative, 8);
    assert.equal(result.pools.positive, 6);
    const item = result.items.find(entry => entry.text === 'server error');
    assert.ok(item, 'frasa dari klaster negatif harus muncul');
    assert.deepEqual(item.tokens, ['server', 'error']);
    assert.equal(item.dfNegative, 8);
    assert.equal(item.dfPositive, 0);
    assert.ok(item.severity > 0);
    assert.ok(['server', 'error'].includes(item.anchor), 'jangkar harus salah satu token frasa');
  });

  test('setiap frasa keluaran adalah urutan token yang benar-benar bersebelahan di ulasan nyata', () => {
    const documents = corpusOf(SERVER_CORPUS);
    const negative = documents.filter(document => document.rating <= 2);
    const result = derivePainPoints(documents, STRUCTURE);
    assert.ok(result.items.length, 'korpus ini punya cukup sinyal untuk menghasilkan frasa');
    for (const item of result.items) {
      const exists = negative.some(document => contains(document.tokens, item.tokens));
      assert.ok(exists, `frasa "${item.text}" tidak ditemukan sebagai urutan token nyata`);
    }
  });

  test('frasa yang terbukti condong ke pujian dibuang dan jumlahnya dilaporkan', () => {
    // 'buka aplikasi' sengaja dibuat MAKNA berbeda antar kelas tapi ke arah yang salah:
    // hampir semua pujian memakainya, hanya satu keluhan memakainya.
    const documents = corpusOf({
      negative: [...SERVER_CORPUS.negative, 'buka aplikasi biasa saja sekali'],
      positive: [
        'buka aplikasi mantap sekali fitur',
        'buka aplikasi mantap sekali cepat',
        'buka aplikasi mantap sekali desain',
        'buka aplikasi mantap sekali aman',
        'buka aplikasi mantap sekali bantu',
        'buka aplikasi mantap sekali mudah',
      ],
    });
    const result = derivePainPoints(documents, STRUCTURE);
    assert.equal(result.items.some(entry => entry.text === 'buka aplikasi'), false, 'frasa condong pujian bukan pain point');
    assert.ok(result.metrics.droppedWrongDirection >= 1, 'yang dibuang harus dihitung, bukan senyap');
  });

  test('frasa satu dua ulasan tidak bisa dibedakan dari nol, jadi bukan masalah', () => {
    const result = derivePainPoints(corpusOf({
      negative: [...SERVER_CORPUS.negative, 'mampus sekalian tuh aplikasi', 'mampus sekalian tuh server'],
      positive: SERVER_CORPUS.positive,
    }), STRUCTURE);
    assert.equal(result.items.some(entry => entry.text === 'mampus sekalian'), false);
    assert.ok(result.metrics.droppedNotDistinct > 0, 'dibuang karena buktinya tipis, bukan karena ambangan angka tetap');
    assert.equal(result.minSupport, undefined, 'tidak ada lagi ambang dukungan yang dipilih tangan');
  });

  test('potongan pendek dari frasa panjang yang setara diakui sebagai varian', () => {
    const documents = corpusOf({
      negative: Array.from({ length: 8 }, (_, index) => `app lama banget error versi ${index}`),
      positive: Array.from({ length: 6 }, (_, index) => `app baru banget oke versi ${index}`),
    });
    const result = derivePainPoints(documents, STRUCTURE);
    const kept = result.items.map(entry => entry.text);
    assert.ok(kept.includes('app lama banget error'), 'frasa maksimal yang dipertahankan');
    assert.equal(kept.includes('app lama banget'), false);
    assert.equal(kept.includes('lama banget'), false);
    assert.ok(result.metrics.droppedCovered > 0);
    assert.equal(result.metrics.keptPhrases, kept.length);
  });

  test('indeks varian hanya menutup frasa yang benar-benar termuat di dalamnya', () => {
    // Dua frasa ber-document frequency sama tapi tidak saling memuat harus dua-duanya tetap
    // ada; satu frasa pendek yang bentuk panjangnya punya df berbeda juga tidak boleh ditutup.
    const documents = corpusOf({
      negative: [
        'sinyal lemah banget kesal', 'sinyal lemah banget kesal', 'sinyal lemah banget kesal',
        'sinyal lemah terus muncul', 'sinyal lemah muncul lambat', 'sinyal lemah bikin rugi',
        'kuota cepat habis melulu', 'kuota cepat habis melulu', 'kuota cepat habis melulu',
        'kuota cepat lama sekali', 'kuota cepat terus naik', 'kuota cepat bikin sebal',
      ],
      positive: Array.from({ length: 6 }, (_, index) => `mantap enak dipakai versi ${index}`),
    });
    const result = derivePainPoints(documents, STRUCTURE);
    const kept = result.items.map(entry => entry.text);
    const byText = new Map(result.items.map(entry => [entry.text, entry]));

    assert.ok(kept.includes('sinyal lemah'), 'df 6, tidak ada frasa lebih panjang ber-df 6 yang memuatnya');
    assert.ok(kept.includes('kuota cepat'), 'df sama dengan "sinyal lemah" tapi tidak termuat di dalamnya');
    assert.equal(kept.includes('lemah banget'), false, 'termuat di "sinyal lemah banget" yang ber-df sama');
    assert.equal(byText.get('sinyal lemah').dfNegative, byText.get('kuota cepat').dfNegative, 'kasus uji ini menuntut df yang sama');
  });

  test('kata jangkar minimal seluas frasa yang dinaungkannya', () => {
    const result = derivePainPoints(corpusOf(SERVER_CORPUS), STRUCTURE);
    const anchors = new Map(result.anchors.map(anchor => [anchor.term, anchor]));
    assert.ok(result.items.length);
    assert.ok(result.anchors.length);
    for (const item of result.items) {
      assert.ok(anchors.has(item.anchor), `jangkar ${item.anchor} tidak ikut dilaporkan`);
      const anchor = anchors.get(item.anchor);
      assert.ok(item.tokens.includes(anchor.term), 'jangkar harus bagian dari frasa');
      assert.ok(anchor.dfNegative >= item.dfNegative, `jangkar ${anchor.term} lebih sempit dari frasa ${item.text}`);
    }
  });

  test('ulasan panjang tetap dibaca sampai token terakhir', () => {
    const documents = corpusOf({
      // Isian dibuat unik per ulasan supaya tidak ikut menjadi calon frasa; yang diuji
      // di sini hanya apakah posisi frasa di ujung ulasan masih dijangkau.
      negative: Array.from({ length: 5 }, (_, row) => `${Array.from({ length: 40 }, (_, index) => `isian${index}x${row}`).join(' ')} transfer tertahan terus`),
      positive: SERVER_CORPUS.positive,
    });
    const result = derivePainPoints(documents, STRUCTURE);
    assert.equal(result.pools.negative, 5);
    assert.ok(result.items.some(entry => entry.text === 'transfer tertahan terus'), 'frasa di ujung ulasan tidak boleh hilang');
    assert.equal(result.items.some(entry => entry.text === 'transfer tertahan'), false, 'potongan pendek dihitung sebagai varian, bukan keluhan baru');
    assert.ok(result.metrics.droppedCovered > 0);
  });

  test('ujung frasa tidak pernah kata struktur', () => {
    const documents = corpusOf({
      negative: [
        'uang saya tidak kembali sama sekali',
        'uang saya tidak kembali untuk kedua',
        'uang saya tidak kembali ini parah',
        'uang saya tidak kembali sangat lama',
        'uang saya tidak kembali di malam hari',
      ],
      positive: SERVER_CORPUS.positive,
    });
    const result = derivePainPoints(documents, STRUCTURE);
    assert.ok(result.items.length);
    for (const item of result.items) {
      assert.equal(STRUCTURE.has(item.tokens[0]), false, `"${item.text}" dimulai dari kata struktur`);
      assert.equal(STRUCTURE.has(item.tokens[item.tokens.length - 1]), false, `"${item.text}" diakhiri kata struktur`);
    }
  });

  test('hasil deterministik untuk korpus yang sama', () => {
    const documents = corpusOf(SERVER_CORPUS);
    const first = derivePainPoints(documents, STRUCTURE);
    const second = derivePainPoints(documents, STRUCTURE);
    assert.deepEqual(first.items, second.items);
    assert.deepEqual(first.anchors, second.anchors);
    assert.deepEqual(first.metrics, second.metrics);
  });

  test('pool kecil tidak dipaksa menghasilkan angka', () => {
    const result = derivePainPoints(corpusOf({
      negative: ['server error lagi', 'server error lagi dua', 'server error lagi tiga'],
      positive: ['mantap sekali satu', 'mantap sekali dua'],
    }), STRUCTURE);
    // Bukan karena batas pool yang ditulis tangan: pada tiga ulasan melawan dua, simpangan
    // baku estimasi setiap frasa lebih besar daripada selisihnya, jadi tidak ada yang lolos.
    assert.equal(result.status, 'insufficient');
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.anchors, []);
    assert.equal(result.pools.negative, 3);
    assert.equal(result.pools.positive, 2);
  });

  test('masukan rusak tidak menjatuhkan mesin', () => {
    for (const input of [[], null, undefined, [{ index: 0 }, { index: 1, rating: 1 }, { index: 2, tokens: [], rating: 1 }]]) {
      const result = derivePainPoints(input, STRUCTURE);
      assert.equal(result.status, 'insufficient');
      assert.deepEqual(result.items, []);
    }
    const noStopwords = derivePainPoints(corpusOf(SERVER_CORPUS));
    assert.equal(noStopwords.status, 'ready');
  });

  test('korpus puluhan ribu baris diproses seluruhnya tanpa sampling', () => {
    const documents = [];
    let index = 0;
    for (let block = 0; block < 200; block += 1) {
      for (let cursor = 0; cursor < 60; cursor += 1) {
        documents.push(docOf(index++, 1 + (cursor % 2), `server error transfer tertahan kode ${block} ${cursor}`));
      }
      for (let cursor = 0; cursor < 65; cursor += 1) {
        documents.push(docOf(index++, 4 + (cursor % 2), `mantap sekali transfer cepat fitur ${block} ${cursor}`));
      }
    }
    const startedAt = Date.now();
    const result = derivePainPoints(documents, STRUCTURE);
    const elapsedMs = Date.now() - startedAt;
    assert.equal(documents.length, 25000);
    assert.equal(result.pools.reviews, 25000);
    assert.equal(result.pools.negative, 12000);
    assert.equal(result.pools.positive, 13000);
    assert.ok(result.items.length <= 40);
    assert.ok(result.anchors.length <= 10);
    assert.ok(result.metrics.matchedReviews <= result.pools.negative);
    assert.ok(result.metrics.candidatePhrases > 0);
    assert.ok(elapsedMs < 4000, `pemrosesan 25.000 ulasan butuh ${elapsedMs}ms`);
  });
});

describe('lapisan frasa di dalam model korpus', () => {
  const reviewOf = (id, rating, text) => ({ id: String(id), platform: 'play', rating, text, publishedAt: '2026-01-05T00:00:00Z' });

  test('analyzeCorpus menambahkan painPoints tanpa mengubah baris dan topik', () => {
    const reviews = [];
    let id = 0;
    for (const text of SERVER_CORPUS.negative) reviews.push(reviewOf(id++, 1, text));
    for (const text of SERVER_CORPUS.positive) reviews.push(reviewOf(id++, 5, text));
    reviews.push(reviewOf(id++, 3, 'lumayan lah biasa saja'));
    const { rows, model } = analyzeCorpus(reviews, { generatedAt: '2026-01-06T00:00:00.000Z', listing: '', entity: 'Uji Sinyal' });
    assert.equal(rows.length, reviews.length, 'tidak boleh ada baris yang hilang');
    assert.equal(rows.every(row => row.analysis && typeof row.analysis.sentiment === 'string'), true);
    assert.equal(model.painPoints.version, PAIN_VERSION);
    assert.equal(model.painPoints.status, 'ready');
    assert.ok(model.painPoints.items.every(item => item.tokens.length >= 2 && item.tokens.length <= 4));
    assert.equal(model.listingTopics.length, 0, 'tanpa teks daftar aplikasi, bukti berbasis daftar tetap kosong');
    assert.equal(model.listingTopicSource, null);
    assert.equal(model.topicSource, 'domain-taxonomy', 'nama topik tidak membutuhkan teks daftar');
    assert.ok(model.painPoints.items.some(item => item.text === 'server error'), 'frasa harus datang dari ulasan itu sendiri');
  });

  test('frasa disusun dari token hasil normalisasi mesin, bukan kata mentah penulis', () => {
    const reviews = [];
    let id = 0;
    for (let cursor = 0; cursor < 8; cursor += 1) reviews.push(reviewOf(id++, 1, `Server ERRRRROR transfer tertahan lagi ${cursor}`));
    for (const text of SERVER_CORPUS.positive) reviews.push(reviewOf(id++, 5, text));
    const { model } = analyzeCorpus(reviews, { generatedAt: '2026-01-06T00:00:00.000Z', listing: '', entity: 'Uji Sinyal' });
    const texts = model.painPoints.items.map(item => item.text);
    // "ERRRRROR" direduksi aturan huruf berulang menjadi "eror", jadi hanya bentuk hasil
    // normalisasi yang boleh muncul sebagai frasa.
    assert.ok(texts.length, 'korpus cukup sinyal untuk membentuk frasa');
    assert.ok(texts.some(text => text.includes('eror')), `huruf berulang belum direduksi: ${texts.join(' | ')}`);
    assert.equal(texts.some(text => /r{3,}/.test(text)), false, 'bentuk mentah tidak boleh lolos jadi frasa');
    assert.ok(model.painPoints.metrics.droppedCovered > 0, 'potongan pendek dari frasa yang sama dihitung sebagai varian');
  });

  test('label diturunkan dari frasa korpus, bukan ditulis tangan', () => {
    const reviews = [];
    let id = 0;
    for (const text of SERVER_CORPUS.negative) reviews.push(reviewOf(id++, 1, text));
    for (const text of SERVER_CORPUS.positive) reviews.push(reviewOf(id++, 5, text));
    const { model } = analyzeCorpus(reviews, { generatedAt: '2026-01-06T00:00:00.000Z', listing: '', entity: 'Uji Sinyal' });
    const pain = model.painPoints;
    const known = new Set(pain.items.map(item => item.text));
    assert.ok(pain.labels.length, 'korpus cukup untuk membentuk label');
    for (const label of pain.labels) {
      assert.ok(known.has(label.evidence), `bukti label bukan frasa asli korpus: ${label.evidence}`);
      // Nama boleh satu kata (jangkar) atau satu frasa, tetapi tidak boleh bukan teks korpus.
      const tokens = new Set(label.phrases.flatMap(entry => entry.text.split(' ')));
      assert.ok(
        label.nameSource === 'phrase' ? known.has(label.name) : tokens.has(label.name),
        `nama label bukan istilah/frasa korpus: ${label.name}`,
      );
      assert.ok(label.phrases.every(entry => known.has(entry.text)), 'anggota gerombol harus frasa asli');
      const biggest = Math.max(...label.phrases.map(entry => entry.dfNegative));
      const sum = label.phrases.reduce((total, entry) => total + entry.dfNegative, 0);
      assert.equal(label.phrases.length, label.phraseCount, 'seluruh anggota gerombol dikirim ke klien');
      assert.ok(label.reviewCount >= biggest, `union ulasan kurang dari frasa terbesarnya: ${label.name}`);
      assert.ok(label.reviewCount <= sum, 'satu ulasan tidak boleh dihitung dua kali');
      assert.ok(label.reviewCount <= pain.pools.negative, 'dukungan label tidak boleh melebihi pool 1-2★');
      assert.equal(label.early + label.late + label.undated, label.reviewCount, 'arah label harus menutup seluruh dukungannya');
    }
    assert.equal(new Set(pain.labels.map(label => label.name)).size, pain.labels.length, 'nama label harus berbeda satu sama lain');
    assert.equal(pain.labelMetrics.clusters >= pain.labelMetrics.reportedLabels, true);
    assert.equal(pain.labelMetrics.reportedLabels, pain.labels.length, 'pemangkasan harus dilaporkan, bukan diam-diam');
    assert.ok(pain.labelMetrics.namedFromTerm <= pain.labels.length);
    // Judul yang dibaca manajer: nama kamus + kalimat reviewers, atau kalimat reviewers saja kalau
    // tidak ada topik yang lolos uji kepadatan. Tidak ada bentuk lain.
    for (const label of pain.labels) {
      if (label.category) {
        assert.equal(label.headingSource, 'dictionary', 'kategori kamus selalu dipakai sebagai judul');
        assert.equal(label.heading, `${label.category.name}: ${label.evidence}`);
        assert.ok(label.category.nameId, 'kategori kamus juga punya nama Indonesia untuk jalur baca');
      } else {
        assert.equal(label.headingSource, 'phrase');
        assert.equal(label.heading, label.evidence);
      }
      if (label.nameSource === 'term') {
        assert.equal(isJunkTerm(label.name), false, `judul satu kata tidak boleh kata tugas: ${label.name}`);
      }
    }
    assert.equal(pain.labelMetrics.headed, pain.labels.filter(label => label.headingSource === 'dictionary').length);
    assert.deepEqual(Object.keys(pain.labelRules).sort(), ['category', 'closure', 'heading', 'link', 'maxLabels', 'naming', 'sharedReviews', 'support', 'trend']);
    assert.equal(pain.labelMetrics.trend.firstDay, '2026-01-05');
  });

  test('label selamat melewati JSON karena tidak memakai Map', () => {
    const reviews = [];
    let id = 0;
    for (const text of SERVER_CORPUS.negative) reviews.push(reviewOf(id++, 1, text));
    for (const text of SERVER_CORPUS.positive) reviews.push(reviewOf(id++, 5, text));
    const { model } = analyzeCorpus(reviews, { generatedAt: '2026-01-06T00:00:00.000Z', listing: '', entity: 'Uji Sinyal' });
    const restored = JSON.parse(JSON.stringify(model.painPoints));
    assert.equal(restored.labels.length, model.painPoints.labels.length);
    assert.equal(restored.labels[0].reviewCount, model.painPoints.labels[0].reviewCount);
    assert.equal(restored.labelMetrics.clusters, model.painPoints.labelMetrics.clusters);
  });
});
