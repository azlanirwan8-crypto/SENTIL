import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildComparison, COMPARE_VERSION } from '../lib/compare-engine.mjs';
import { analyzeCorpus } from '../lib/corpus-engine.mjs';

const head = ({ id, volume, nss, positive, negative, neutral, analyzed, breakdown, daily = [], channels = [], pain = [], avgRating = null }) => ({
  workspaceId: id,
  entity: id,
  fetchedAt: '2026-10-20T00:00:00.000Z',
  engine: { version: 'corpus-rating-v2' },
  summary: { reviews: volume, analyzed, withText: volume, unclassified: volume - analyzed, rated: breakdown ? breakdown.reduce((s, v) => s + v, 0) : 0, avgRating, positive, negative, neutral, nss, channels: [] },
  model: {
    version: 'corpus-rating-v2',
    status: 'ready',
    nss,
    labels: { positive, negative, neutral, unclassified: volume - analyzed },
    coverage: { withText: volume, withoutText: 0, unclassified: volume - analyzed, ratingBreakdown: breakdown },
    daily,
    painPoints: { version: 'pain-phrase-v2', items: pain },
    topics: [],
  },
  channels,
  stored: { revision: 1, reviewCount: volume, assembled: 0 },
});

const workspace = id => ({ id, label: id.toUpperCase(), entity: id });

const days = entries => entries.map(([date, total]) => ({ date, total, positive: 0, negative: 0, neutral: 0, unclassified: 0 }));

describe('mesin perbandingan lintas project', () => {
  const threeProjects = {
    'p-alpha': head({ id: 'p-alpha', volume: 1000, analyzed: 900, nss: -40, positive: 200, negative: 600, neutral: 100, breakdown: [500, 100, 100, 100, 200], daily: days([['2026-01-01', 10], ['2026-01-03', 30], ['2026-01-05', 60]]), pain: [{ text: 'blokir rekening', size: 2, anchor: 'blokir', share: 0.04, dfNegative: 488, severity: 4.08 }] }),
    'p-beta': head({ id: 'p-beta', volume: 2000, analyzed: 1800, nss: 10, positive: 900, negative: 300, neutral: 600, breakdown: [100, 100, 200, 400, 1200], daily: days([['2026-01-01', 100], ['2026-01-05', 100]]), pain: [{ text: 'blokir rekening', size: 2, anchor: 'blokir', share: 0.01, dfNegative: 20, severity: 3.1 }, { text: 'suka logout', size: 2, anchor: 'logout', share: 0.02, dfNegative: 40, severity: 3.4 }] }),
    'p-gamma': head({ id: 'p-gamma', volume: 500, analyzed: 400, nss: -5, positive: 150, negative: 200, neutral: 50, breakdown: [80, 40, 40, 100, 240], channels: [{ id: 'play', app: { ratingHistogram: [10, 20, 30, 40, 900], ratingCount: 1000 } }], daily: days([['2026-02-01', 5]]), pain: [] }),
  };
  const ids = ['p-alpha', 'p-beta', 'p-gamma'];

  const build = (list = ids, datasets = threeProjects) => buildComparison({
    workspaces: list.map(workspace),
    datasets,
    generatedAt: '2026-10-26T00:00:00.000Z',
  });

  test('versi matriks konstan dan setiap baris metrik terisi', () => {
    const result = build();
    assert.equal(result.version, COMPARE_VERSION);
    assert.equal(result.projects.length, 3);
    assert.ok(result.rows.length >= 12);
    assert.equal(result.rows.every(row => row.values.length === 3), true, 'setiap baris harus punya satu sel per kolom');
  });

  test('acuan delta adalah median lintas kolom, bukan angka yang ditulis tangan', () => {
    const all = build();
    const volume = all.rows.find(row => row.key === 'volume');
    assert.equal(volume.reference, 1000, 'median dari 1000/2000/500');
    assert.deepEqual(volume.values.map(entry => entry.value), [1000, 2000, 500]);
    assert.deepEqual(volume.values.map(entry => entry.delta), [0, 1000, -500]);

    // Mengurangi satu kolom mengubah acuannya: bukti bahwa tidak ada baseline diam-diam.
    const two = build(['p-alpha', 'p-gamma']);
    assert.equal(two.rows.find(row => row.key === 'volume').reference, 750, 'median 1000 dan 500');
  });

  test('arah metrik menentukan siapa menang, dan volume sengaja tidak dinilai', () => {
    const result = build();
    const nss = result.rows.find(row => row.key === 'nss');
    assert.equal(nss.direction, 'up');
    assert.equal(nss.values.find(entry => entry.id === 'p-beta').rank, 1, 'NSS tertinggi peringkat satu');
    assert.equal(nss.values.find(entry => entry.id === 'p-alpha').rank, 3);

    const negative = result.rows.find(row => row.key === 'negativeShare');
    assert.equal(negative.direction, 'down');
    assert.equal(negative.values.find(entry => entry.id === 'p-alpha').rank, 3, 'pangsa negatif terbesar justru peringkat terakhir');

    assert.equal(result.rows.find(row => row.key === 'volume').direction, 'neutral', 'jumlah ulasan bukan nilai baik/buruk');
  });

  test('kecepatan dan momentum dihitung dari rentang tanggal project itu sendiri', () => {
    const result = build();
    const alpha = result.projects.find(project => project.id === 'p-alpha');
    assert.equal(alpha.observedSpanDays, 5, '1 Jan sampai 5 Jan');
    assert.equal(alpha.metrics.velocity.perDay, 20, '(10+30+60) / 5 hari');
    assert.equal(alpha.metrics.velocity.peak.date, '2026-01-05');
    // Paruh pertama (1,3 Jan) vs paruh kedua (5 Jan) dari rentang yang sama.
    assert.ok(alpha.metrics.velocity.momentum > 1, 'keluhan mengalir makin akhir');

    const gamma = result.projects.find(project => project.id === 'p-gamma');
    assert.equal(gamma.observedSpanDays, 1, 'satu hari teramati tidak boleh jadi nol atau NaN');
    assert.equal(Number.isFinite(gamma.metrics.velocity.perDay), true);
  });

  test('pangsa 1★ hasil baca dan 1★ histogram toko tidak pernah digabung', () => {
    const result = build();
    const gamma = result.projects.find(project => project.id === 'p-gamma');
    assert.equal(gamma.metrics.oneStarIngested, 80 / 500, 'dari ulasan yang terbaca');
    assert.equal(gamma.metrics.oneStarStore, 900 / 1000, 'dari histogram toko');
    assert.equal(gamma.store.channel, 'play');
    assert.equal(gamma.metrics.storeRating, 1.2, 'rata-rata berbobot histogram toko (indeks 0 = bintang 5)');

    // Project tanpa histogram: selnya kosong, bukan nol.
    const alpha = result.projects.find(project => project.id === 'p-alpha');
    assert.equal(alpha.metrics.oneStarStore, null);
    const storeRow = result.rows.find(row => row.key === 'oneStarStore');
    assert.equal(storeRow.values.find(entry => entry.id === 'p-alpha').value, null);
    assert.equal(storeRow.reference, 0.9, 'median hanya dari kolom yang punya data toko');
  });

  test('heatmap pain point: sel kosong berarti tidak terdeteksi, bukan nol', () => {
    const result = build();
    const shared = result.painPoints.find(row => row.text === 'blokir rekening');
    assert.equal(shared.projectCount, 2);
    assert.equal(shared.cells['p-alpha'].share, 0.04);
    assert.equal(shared.cells['p-gamma'], undefined, 'project yang tidak melaporkan frasa ini tidak diisi nol');
    assert.equal(result.painPoints[0].text, 'blokir rekening', 'baris lintas project didahulukan');

    const logout = result.painPoints.find(row => row.text === 'suka logout');
    assert.equal(logout.projectCount, 1);
  });

  test('hasil compare bertahan melewati JSON karena dikirim lewat HTTP', () => {
    // Map terserialisasi menjadi {} tanpa peringatan, jadi pembaca di peramban kehilangan
    // seluruh sel heatmap dan view-nya crash. Bentuknya harus objek biasa sejak awal.
    const round = JSON.parse(JSON.stringify(build()));
    const shared = round.painPoints.find(row => row.text === 'blokir rekening');
    assert.equal(Object.keys(shared.cells).length, 2);
    assert.equal(shared.cells['p-alpha'].share, 0.04);
    assert.equal(shared.cells['p-gamma'], undefined);
    for (const row of round.painPoints) {
      assert.equal(typeof row.cells, 'object');
      assert.equal(row.projectCount, Object.values(row.cells).length, 'projectCount harus sama dengan isi sel setelah round-trip');
    }
  });

  test('leaderboard NSS memberi jarak ke pemuncak tanpa mengarang angka', () => {
    const result = build();
    assert.deepEqual(result.leaderboard.map(entry => entry.id), ['p-beta', 'p-gamma', 'p-alpha']);
    assert.equal(result.leaderboard[0].gapToLeader, 0);
    assert.equal(result.leaderboard[1].gapToLeader, -15);
    assert.equal(result.leaderboard[2].gapToLeader, -50);
  });

  test('kesimpulan otomatis hanya menyebut kolom yang benar-benar berbeda', () => {
    const result = build();
    assert.ok(result.insights.length >= 1);
    for (const insight of result.insights) {
      assert.notEqual(insight.winnerId, insight.loserId, 'pemenang dan pecundang harus kolom berbeda');
      assert.ok(result.projects.some(project => project.id === insight.winnerId), 'tidak boleh menyebut project yang tidak ada');
      assert.ok(insight.absolute > 0);
    }
    // Semua kolom sama -> tidak ada kesimpulan yang bisa ditarik, dan mesin tidak mengarang.
    const one = build(['p-alpha', 'p-beta'], { 'p-alpha': threeProjects['p-alpha'], 'p-beta': JSON.parse(JSON.stringify(threeProjects['p-alpha'])) });
    assert.equal(one.insights.length, 0, 'kolom kembar tidak menghasilkan perbedaan palsu');
  });

  test('project tanpa snapshot dikeluarkan dari median dan dilaporkan jujur', () => {
    const result = build([...ids, 'p-kosong'], { ...threeProjects, 'p-kosong': null });
    assert.equal(result.reference.projects, 3, 'hanya kolom berisi data yang jadi acuan');
    assert.equal(result.projects.find(project => project.id === 'p-kosong').hasData, false);
    assert.equal(result.caveats.some(text => text.includes('1 selected project')), true);
    const volume = result.rows.find(row => row.key === 'volume');
    assert.equal(volume.values.find(entry => entry.id === 'p-kosong').value, null);
    assert.equal(volume.reference, 1000);
  });

  test('matriks deterministik dan bebas NaN', () => {
    const first = JSON.stringify(build());
    const second = JSON.stringify(build());
    assert.equal(first, second);
    assert.equal(first.includes('NaN'), false, 'NaN tidak boleh lolos ke keluaran');
  });

  test('rincian bintang benar-benar datang dari mesin korpus, bukan fixture', () => {
    const reviews = [];
    for (let index = 0; index < 30; index += 1) reviews.push({ id: `a${index}`, platform: 'play', rating: 1, text: `server error blokir rekening ${index}`, publishedAt: '2026-01-05T00:00:00Z' });
    for (let index = 0; index < 10; index += 1) reviews.push({ id: `b${index}`, platform: 'play', rating: 5, text: `mantap sekali aman ${index}`, publishedAt: '2026-01-06T00:00:00Z' });
    const { model } = analyzeCorpus(reviews, { generatedAt: '2026-10-26T00:00:00.000Z', listing: '', entity: 'Uji Matriks' });
    assert.deepEqual(model.coverage.ratingBreakdown, [30, 0, 0, 0, 10]);
    assert.equal(model.coverage.ratingBreakdown.reduce((sum, value) => sum + value, 0), reviews.length, 'rincian harus menutup seluruh baris');
  });
});
