import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { clusterPainPhrases } from '../lib/label-clusters.mjs';

const TOTAL = 40;

function item(text, dfNegative, extra = {}) {
  return { text, tokens: text.split(' '), size: text.split(' ').length, dfNegative, dfPositive: 0, severity: 2, weight: 10, ...extra };
}

function build(negativeHits, positiveHits = new Map(), items = null, total = TOTAL) {
  const list = items || [...negativeHits.keys()].map(text => item(text, negativeHits.get(text).size));
  return clusterPainPhrases({
    items: list,
    negativeHits,
    positiveHits,
    negativeCount: total,
    positiveCount: 20,
  });
}

const range = (from, to) => new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i));

describe('gerombol frasa menjadi label', () => {
  test('dua frasa yang selalu muncul bersama jadi satu label', () => {
    const result = build(new Map([['sidik jari belum', range(0, 19)], ['belum ada sidik', range(0, 19)]]));
    assert.equal(result.metrics.clusters, 1);
    assert.equal(result.metrics.links, 1);
    const label = result.labels[0];
    assert.equal(label.reviewCount, 20, 'union ulasan, bukan 20 + 20');
    assert.equal(label.phraseCount, 2);
    assert.ok(label.label.includes('sidik'), 'nama label harus frasa asli dari ulasan');
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

  test('ikatan bersifat menular antar frasa', () => {
    const hits = new Map([['a b', range(0, 19)], ['c d', range(0, 19)], ['e f', range(0, 19)]]);
    const result = build(hits);
    assert.equal(result.metrics.clusters, 1);
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
    assert.equal(JSON.parse(JSON.stringify(empty)).labels.length, 0);
  });

  test('satu frasa saja tidak membentuk gerombol tapi tetap jadi label tunggal', () => {
    const result = build(new Map([['sendiri', range(0, 15)]]));
    assert.equal(result.metrics.phrases, 1);
    assert.equal(result.labels.length, 1);
    assert.equal(result.metrics.singletons, 1);
  });
});
