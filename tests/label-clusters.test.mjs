import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { clusterPainPhrases } from '../lib/label-clusters.mjs';

const TOTAL = 40;

function item(text, dfNegative, extra = {}) {
  return {
    text,
    tokens: text.split(' '),
    size: text.split(' ').length,
    dfNegative,
    dfPositive: 0,
    severity: 2,
    weight: 10,
    anchor: null,
    ...extra,
  };
}

function build(negativeHits, positiveHits = new Map(), items = null, total = TOTAL, days = new Map(), extra = {}) {
  const list = items || [...negativeHits.keys()].map(text => item(text, negativeHits.get(text).size));
  return clusterPainPhrases({
    items: list,
    negativeHits,
    positiveHits,
    negativeCount: total,
    positiveCount: 20,
    days,
    ...extra,
  });
}

const range = (from, to) => new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i));

describe('gerombol frasa menjadi label', () => {
  test('dua frasa yang selalu muncul bersama jadi satu label', () => {
    const hits = new Map([['sidik jari belum', range(0, 19)], ['belum ada sidik', range(0, 19)]]);
    const items = [item('sidik jari belum', 20, { anchor: 'sidik' }), item('belum ada sidik', 20, { anchor: 'sidik' })];
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.metrics.links, 1);
    const label = result.labels[0];
    assert.equal(label.reviewCount, 20, 'union ulasan, bukan 20 + 20');
    assert.equal(label.phraseCount, 2);
    assert.equal(label.name, 'sidik', 'nama = kata jangkar yang dijagokan dua anggota');
    assert.equal(label.nameSource, 'term');
    assert.ok(label.evidence.split(' ').includes('sidik'), 'bukti harus frasa asli dari ulasan');
  });

  test('dua frasa dari ulasan yang berbeda tidak digabung', () => {
    const result = build(new Map([['satu', range(0, 19)], ['dua', range(20, 39)]]));
    assert.equal(result.metrics.links, 0);
    assert.equal(result.metrics.clusters, 2);
    assert.deepEqual(result.labels.map(label => label.reviewCount), [20, 20]);
  });

  test('muncul bersama tapi lebih jarang daripada kebetulan tidak dianggap ikatan', () => {
    // 'satu' di 20 ulasan, 'dua' di 20 ulasan, hanya 2 ulasan memuat keduanya — di bawah
    // latar independence 0,5, jadi ini justru bukti penolakan, bukan bukti keterkaitan.
    const scattered = new Set([0, 1, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
    const result = build(new Map([['satu', range(0, 19)], ['dua', scattered]]));
    assert.equal(result.metrics.links, 0);
    assert.equal(result.metrics.clusters, 2);
  });

  test('satu ulasan tidak dihitung tiga kali', () => {
    const hits = new Map([['a b', range(0, 3)], ['c d', range(0, 3)], ['e f', range(0, 3)]]);
    const result = build(hits);
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.labels[0].reviewCount, 4, 'union tiga frasa di empat ulasan yang sama = 4, bukan 12');
    assert.equal(result.labels[0].phraseCount, 3);
  });

  test('tiga frasa yang saling terhubung penuh jadi satu gerombol', () => {
    const hits = new Map([['a b', range(0, 19)], ['c d', range(0, 19)], ['e f', range(0, 19)]]);
    const result = build(hits);
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.metrics.links, 3, 'tiga pasangan lolos uji');
    assert.equal(result.metrics.merges, 2, 'dua gabungan membentuk satu gerombol');
    assert.equal(result.labels[0].phraseCount, 3);
  });

  test('dukungan pujian juga dihitung sebagai union ulasan', () => {
    const hits = new Map([['a b', range(0, 9)], ['c d', range(0, 9)]]);
    const praise = new Map([['a b', new Set([0, 1])], ['c d', new Set([1, 2])]]);
    const result = build(hits, praise);
    assert.equal(result.labels[0].praiseCount, 3);
    assert.equal(result.labels[0].praiseShare, 0.15);
  });

  test('ikatan satu arah saja tidak cukup', () => {
    // 'frasa jarang' hanya hidup di 2 ulasan dan keduanya memuat 'frasa umum' — dari sisi frasa
    // jarang ini tampak terkait. Dari sisi frasa umum, 2 dari 200 ulasan sama sekali tidak
    // melampaui latar 2/400, jadi hubungannya searah dan tidak dipakai.
    const rare = range(0, 1);
    const common = new Set([0, 1, ...range(2, 199)]);
    const hits = new Map([['frasa jarang', rare], ['frasa umum', common]]);
    const items = [...hits.keys()].map(text => item(text, hits.get(text).size));
    assert.equal(items[1].dfNegative, 200);
    const result = build(hits, new Map(), items, 400);
    assert.equal(result.metrics.links, 0);
    assert.equal(result.metrics.clusters, 2);
  });

  test('semua anggota gerombol dikirim, tidak dipotong enam', () => {
    const hits = new Map();
    for (let cursor = 0; cursor < 8; cursor += 1) hits.set(`frasa ${cursor}`, range(0, 3));
    const items = [...hits.keys()].map(text => item(text, 4));
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.labels[0].phraseCount, 8);
    assert.equal(result.labels[0].phrases.length, 8, 'union tidak bisa diverifikasi pembaca kalau anggotanya dipotong');
    assert.equal(result.labels[0].reviewCount, 4);
  });

  test('rantai ditolak: dua gerombol tidak menyatu lewat satu penghubung', () => {
    // 'ads banyak' (ulasan 0-9) dan 'bank lain' (20-29) tidak pernah muncul bersama. Keduanya
    // terhubung kuat ke 'tidak bisa' yang hidup di kedua kelompok — inilah bentuk rantai yang
    // membuat satu label raksasa. Complete-linkage menolak gabungan keduanya.
    const hits = new Map([
      ['ads banyak', range(0, 9)],
      ['tidak bisa', new Set([...range(0, 9), ...range(20, 29)])],
      ['bank lain', range(20, 29)],
    ]);
    const items = [
      item('ads banyak', 10, { anchor: 'ads' }),
      item('tidak bisa', 20, { anchor: 'bisa' }),
      item('bank lain', 10, { anchor: 'bank' }),
    ];
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.links, 2, 'dua pasangan lolos uji ko-occurrence');
    assert.equal(result.metrics.merges, 1, 'satu gabungan diterima');
    assert.equal(result.metrics.rejectedMerges, 1, 'gabungan rantai ditolak');
    assert.equal(result.metrics.clusters, 2);
    assert.deepEqual(result.labels.map(label => label.reviewCount).sort((a, b) => b - a), [20, 10]);
  });

  test('pemangkasan dilaporkan, tidak hilang diam-diam', () => {
    // 15 kelompok frasa yang saling lepas: tiap kelompok menempati 4 ulasan yang tidak
    // dipakai kelompok lain, jadi 15 gerombol tidak bisa menyatu karena kebetulan.
    const hits = new Map();
    for (let group = 0; group < 15; group += 1) {
      const from = group * 4;
      hits.set(`frasa ${group}`, range(from, from + 3));
    }
    const items = [...hits.keys()].map(text => item(text, hits.get(text).size));
    const result = build(hits, new Map(), items, 64);
    assert.equal(result.metrics.clusters, 15);
    assert.equal(result.metrics.reportedLabels, 12);
    assert.equal(result.metrics.trimmedLabels, 3);
    assert.equal(result.labels.length, 12, 'yang di luar anggaran tidak dikirim ke klien');
  });

  test('keluaran aman untuk JSON dan bentuknya lengkap saat kosong', () => {
    const empty = clusterPainPhrases({ items: [], negativeHits: new Map(), negativeCount: 0, positiveCount: 0 });
    assert.deepEqual(empty.labels, []);
    assert.equal(empty.metrics.clusters, 0);
    assert.equal(empty.metrics.namedFromTerm, 0);
    assert.equal(empty.metrics.trend, null, 'tanpa tanggal, arah tidak dikarang');
    assert.equal(JSON.parse(JSON.stringify(empty)).labels.length, 0);
  });

  test('satu frasa saja tetap jadi label, dengan nama = frasa itu sendiri', () => {
    const result = build(new Map([['sendiri', range(0, 15)]]));
    assert.equal(result.metrics.phrases, 1);
    assert.equal(result.labels.length, 1);
    assert.equal(result.metrics.singletons, 1);
    assert.equal(result.labels[0].name, 'sendiri');
    assert.equal(result.labels[0].nameSource, 'phrase', 'satu anggota tidak punya dasar untuk dipangkas jadi satu kata');
    assert.equal(result.metrics.namedFromTerm, 0);
  });

  test('jangkar yang hanya dijagokan satu anggota tidak dijadikan nama', () => {
    const hits = new Map([['iklan ganggu', range(0, 9)], ['iklan maksa', range(0, 9)]]);
    const items = [item('iklan ganggu', 10, { anchor: 'ganggu' }), item('iklan maksa', 10, { anchor: 'maksa' })];
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.labels[0].nameSource, 'phrase');
    assert.ok(result.labels[0].name.includes('iklan'), `nama jatuh ke frasa asli: ${result.labels[0].name}`);
  });

  test('satu istilah tidak dipakai dua label', () => {
    // Dua gerombol terpisah yang sama-sama dijagokan 'iklan': yang lebih besar dapat namanya,
    // yang kecil kembali ke frasa aslinya, bukan mengarang pembeda.
    const hits = new Map([
      ['iklan ganggu', range(0, 19)],
      ['iklan maksa', range(0, 19)],
      ['iklan baru', range(20, 39)],
      ['iklan besok', range(20, 39)],
    ]);
    const items = [
      item('iklan ganggu', 20, { anchor: 'iklan', weight: 30 }),
      item('iklan maksa', 20, { anchor: 'iklan', weight: 20 }),
      item('iklan baru', 20, { anchor: 'iklan', weight: 30 }),
      item('iklan besok', 20, { anchor: 'iklan', weight: 20 }),
    ];
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.clusters, 2);
    assert.deepEqual(result.labels.map(label => label.name), ['iklan', 'iklan baru']);
    assert.equal(result.labels[1].nameSource, 'phrase');
    assert.equal(new Set(result.labels.map(label => label.name)).size, 2);
  });

  test('istilah yang dipakai banyak gerombol tidak dijadikan nama', () => {
    // 'iklan' dan 'tidak' sama-sama dijagokan dua frasa di gerombol ini. 'tidak' juga jadi
    // jangkar gerombol lain, jadi ia tidak membedakan apa pun — yang dipakai adalah 'iklan'.
    const shared = range(0, 19);
    const hits = new Map([
      ['iklan maksa muncul', shared],
      ['iklan muncul terus', shared],
      ['tidak bisa tutup', shared],
      ['tidak bisa masuk', shared],
      ['tidak jelas sekali', range(20, 39)],
      ['tidak ada bunyi', range(20, 39)],
    ]);
    const items = [
      item('iklan maksa muncul', 20, { anchor: 'iklan', weight: 30 }),
      item('iklan muncul terus', 20, { anchor: 'iklan', weight: 28 }),
      item('tidak bisa tutup', 20, { anchor: 'tidak', weight: 40 }),
      item('tidak bisa masuk', 20, { anchor: 'tidak', weight: 38 }),
      item('tidak jelas sekali', 20, { anchor: 'tidak', weight: 20 }),
      item('tidak ada bunyi', 20, { anchor: 'tidak', weight: 18 }),
    ];
    const result = build(hits, new Map(), items);
    assert.equal(result.metrics.clusters, 2);
    const ad = result.labels.find(label => label.phrases.some(entry => entry.text === 'iklan maksa muncul'));
    assert.equal(ad.name, 'iklan', 'istilah yang hanya hidup di gerombol ini yang menang');
    assert.equal(ad.nameSource, 'term');
    const other = result.labels.find(label => label.id !== ad.id);
    assert.ok(other.name !== 'iklan');

    // Kata tugas tidak boleh menjadi nama walaupun tidak ada pesaing: headline jatuh ke frasa
    // terberat, yang masih berisi keluhan yang sebenarnya ditulis reviewer.
    const alone = build(new Map([['tidak jelas sekali', range(0, 19)], ['tidak ada bunyi', range(0, 19)]]), new Map(), [items[4], items[5]]);
    assert.equal(alone.labels[0].name, 'tidak jelas sekali');
    assert.equal(alone.labels[0].nameSource, 'phrase', 'kata tugas tidak lagi dijadikan istilah nama');
    assert.notEqual(alone.labels[0].name, 'tidak');
  });

  test('arah label dihitung dari rentang tanggal yang teramati', () => {
    const hits = new Map([['a b', range(0, 3)], ['c d', range(0, 3)]]);
    const days = new Map([[0, '2026-01-01'], [1, '2026-01-01'], [2, '2026-01-03'], [3, '2026-01-03']]);
    const result = build(hits, new Map(), null, TOTAL, days, { negativeIndexes: [...range(0, TOTAL - 1)] });
    const label = result.labels[0];
    assert.deepEqual(result.metrics.trend, {
      firstDay: '2026-01-01',
      lastDay: '2026-01-03',
      datedReviews: 4,
      earlyNegative: 2,
      lateNegative: 2,
      undatedNegative: 36,
    });
    assert.equal(label.early, 2, 'dua ulasan sebelum tengah rentang');
    assert.equal(label.late, 2, 'dua ulasan sesudahnya');
    assert.equal(label.undated, 0);
    // Paruh pertama 2 hari, paruh kedua 1 hari: laju harian duakali lipat, bukan jumlah kasarnya.
    assert.equal(label.momentum, 2);

    const blind = build(hits);
    assert.equal(blind.labels[0].momentum, null, 'tanpa tanggal, arah tidak dikarang');
    assert.equal(blind.labels[0].undated, null);
  });

  test('setiap label membawa rincian kanal dan pool kanal aslinya', () => {
    const hits = new Map([['a b', range(0, 24)], ['c d', range(0, 24)]]);
    const items = [item('a b', 25, { anchor: 'a' }), item('c d', 25, { anchor: 'a' })];
    // play menyumbang 20 dari 25 ulasan label ini dan memegang 20 dari 40 keluhan korpus.
    const channelOf = new Map();
    for (const index of range(0, TOTAL - 1)) channelOf.set(index, index < 20 ? 'play' : 'reddit');
    const result = build(hits, new Map(), items, TOTAL, new Map(), {
      negativeIndexes: [...range(0, TOTAL - 1)],
      channelOf,
    });
    const label = result.labels[0];
    assert.equal(label.reviewCount, 25);
    assert.deepEqual(label.channels, [
      { id: 'play', count: 20, pool: 20 },
      { id: 'reddit', count: 5, pool: 20 },
    ]);
  });

  test('kanal tanpa ulasan tidak dikirim sebagai nol', () => {
    const hits = new Map([['a b', range(0, 4)]]);
    const channelOf = new Map();
    for (const index of range(0, TOTAL - 1)) channelOf.set(index, 'play');
    const result = build(hits, new Map(), null, TOTAL, new Map(), {
      negativeIndexes: [...range(0, TOTAL - 1)],
      channelOf,
    });
    assert.deepEqual(result.labels[0].channels, [{ id: 'play', count: 5, pool: 40 }]);
  });

  test('kategori = istilah halaman toko yang lebih padat di dalam gerombol', () => {
    const hits = new Map([['lama sekali', range(0, 2)], ['tidak jelas', range(0, 2)]]);
    const items = [item('lama sekali', 3, { anchor: 'lama' }), item('tidak jelas', 3, { anchor: 'jelas' })];
    const topicsOf = new Map([[0, ['pencairan']], [1, ['pencairan']], [2, ['aplikasi']]]);
    for (let index = 3; index < 23; index += 1) topicsOf.set(index, ['aplikasi']);
    const result = build(hits, new Map(), items, 40, new Map(), {
      negativeIndexes: [...Array(40).keys()],
      topicsOf,
      topicNames: new Map([['pencairan', 'Pencairan'], ['aplikasi', 'Aplikasi']]),
    });
    const label = result.labels[0];
    assert.equal(label.reviewCount, 3);
    assert.equal(label.category.id, 'pencairan');
    assert.equal(label.category.name, 'Pencairan');
    assert.equal(label.category.inside, 2);
    assert.equal(label.category.pool, 2);
    assert.equal(result.metrics.categorized, 1);
  });

  test('satu ulasan yang kebetulan memuat istilah toko tidak cukup untuk menamai kategori', () => {
    const hits = new Map([['lama sekali', range(0, 2)]]);
    const items = [item('lama sekali', 3)];
    const topicsOf = new Map([[0, ['pencairan']]]);
    const result = build(hits, new Map(), items, 40, new Map(), {
      negativeIndexes: [...Array(40).keys()],
      topicsOf,
    });
    assert.equal(result.labels[0].category, null);
    assert.equal(result.metrics.categorized, 0);
  });
});
