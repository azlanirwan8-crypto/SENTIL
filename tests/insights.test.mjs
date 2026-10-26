import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { analyzeCorpus } from '../lib/corpus-engine.mjs';
import { deriveSignals, SIGNAL_VERSION } from '../lib/insights.mjs';

// Model palsu di bawah hanya alat ukur: angkanya disusun supaya tiap jenis sinyal punya kasus
// "lolos uji" dan kasus "tidak lolos uji" yang bisa dihitung tangan. Yang diuji adalah aturan
// penerbitan sinyalnya, bukan isi model.
const labelOf = (name, over = {}) => ({
  id: name,
  name,
  nameSource: 'term',
  evidence: `${name} sekali`,
  reviewCount: 100,
  share: 0.1,
  praiseCount: 0,
  praiseShare: 0,
  severity: 2,
  weight: 20,
  phraseCount: 2,
  channels: [],
  early: null,
  late: null,
  undated: null,
  momentum: null,
  phrases: [],
  ...over,
});

function modelOf({ labels = [], pools = { negative: 1000, positive: 800 }, trend, label = {}, pain = {}, coverage = {} } = {}) {
  const defaultTrend = { firstDay: '2026-01-01', lastDay: '2026-03-31', datedReviews: 1800, earlyNegative: 500, lateNegative: 500, undatedNegative: 0 };
  return {
    coverage: { reviews: 2000, analyzed: 1900, unclassified: 100, ...coverage },
    platforms: [{ id: 'play' }, { id: 'reddit' }],
    painPoints: {
      pools: { reviews: 2000, withText: 1950, ...pools },
      metrics: { matchedReviews: 700, ...pain },
      labelMetrics: {
        phrases: 40, links: 20, merges: 10, rejectedMerges: 3, clusters: 14, reportedLabels: labels.length,
        trimmedLabels: 2, singletons: 5, namedFromTerm: 6, trend: trend === null ? null : { ...defaultTrend, ...trend },
        ...label,
      },
      labels,
    },
  };
}

const rendered = new Intl.NumberFormat('en-GB');
const render = entry => (entry.unit === 'percent' ? `${(entry.value * 100).toFixed(1)}%`
  : entry.unit === 'ratio' ? entry.value.toFixed(2)
    : entry.unit === 'text' ? String(entry.value)
      : rendered.format(entry.value));

// Penjaga anti-halusinasi: setiap angka yang dibaca manusia di kalimat sinyal harus merupakan
// nilai hasil ukur yang juga dikirim di `facts`, dan sebaliknya setiap nilai facts harus muncul
// di kalimatnya. Tanggal diterima apa adanya karena itu memang teks hasil ukur.
function assertNumbersAreMeasured(item, label) {
  const texts = item.facts.map(render);
  const withoutDates = item.body.replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  const tokens = withoutDates.match(/\d[\d.,]*/g) || [];
  for (const token of tokens) {
    const clean = token.replace(/[.,]$/, '');
    assert.ok(
      texts.some(text => text === clean || text.startsWith(clean) || clean.startsWith(text)),
      `${label}: angka "${clean}" ada di kalimat tapi bukan hasil ukur (${JSON.stringify(texts)})`,
    );
  }
  for (const entry of item.facts) {
    const text = render(entry);
    assert.ok(item.body.includes(text) || item.title.includes(text), `${label}: facts.${entry.key} (${text}) tidak tertulis di kalimatnya`);
  }
}

describe('lapisan sinyal', () => {
  test('temuan utama adalah label terbesar, dengan angka yang bisa dihitung ulang', () => {
    const model = modelOf({ labels: [labelOf('iklan', { reviewCount: 300, share: 0.3, phraseCount: 5 }), labelOf('lag', { reviewCount: 120, share: 0.12 })] });
    const signals = deriveSignals(model);
    assert.equal(signals.version, SIGNAL_VERSION);
    assert.equal(signals.status, 'ready');
    const theme = signals.items.find(item => item.kind === 'theme');
    assert.equal(theme.subject, 'iklan', 'headline = label terbesar korpus');
    assert.equal(theme.facts.find(entry => entry.key === 'reviews').value, 300);
    assert.equal(theme.facts.find(entry => entry.key === 'pool').value, 1000);
    assert.ok(theme.body.includes('300 of 1,000 one-two star reviews (30.0%)'), theme.body);
    assert.ok(theme.body.includes('5 phrases'), 'jumlah frasa anggota ikut disebut');
  });

  test('arah hanya ditulis kalau porsi dua paruh berbeda nyata', () => {
    const rising = deriveSignals(modelOf({
      labels: [labelOf('iklan', { reviewCount: 450, share: 0.45, early: 50, late: 400, momentum: 8 })],
    }));
    assert.equal(rising.items.filter(item => item.kind === 'rise').length, 1);
    const fall = deriveSignals(modelOf({
      labels: [labelOf('iklan', { reviewCount: 450, share: 0.45, early: 400, late: 50, momentum: 0.12 })],
    }));
    assert.equal(fall.items.filter(item => item.kind === 'fall').length, 1);

    const flat = deriveSignals(modelOf({
      labels: [labelOf('iklan', { reviewCount: 510, share: 0.51, early: 250, late: 260, momentum: 1.04 })],
    }));
    assert.equal(flat.items.filter(item => item.kind === 'rise' || item.kind === 'fall').length, 0, 'selisih 10 ulasan dari 500 bukan sinyal');

    const blind = deriveSignals(modelOf({
      trend: null,
      labels: [labelOf('iklan', { reviewCount: 450, share: 0.45 })],
    }));
    assert.equal(blind.items.some(item => item.kind === 'rise' || item.kind === 'fall'), false, 'tanpa tanggal, arah tidak dikarang');
  });

  test('konsentrasi kanal diuji terhadap kanal lainnya, bukan terhadap nol', () => {
    const concentrated = deriveSignals(modelOf({
      labels: [labelOf('iklan', {
        reviewCount: 300,
        share: 0.3,
        channels: [{ id: 'play', count: 280, pool: 500 }, { id: 'reddit', count: 20, pool: 500 }],
      })],
    }));
    const channels = concentrated.items.filter(item => item.kind === 'channel');
    assert.equal(channels.length, 1, 'kanal yang porsinya lebih rendah bukan konsentrasi');
    assert.ok(channels[0].title.includes('Google Play'), channels[0].title);
    assert.equal(channels[0].facts.find(entry => entry.key === 'inside').value, 0.56);
    assert.equal(channels[0].facts.find(entry => entry.key === 'outside').value, 0.04);

    const even = deriveSignals(modelOf({
      labels: [labelOf('iklan', {
        reviewCount: 200,
        share: 0.2,
        channels: [{ id: 'play', count: 100, pool: 500 }, { id: 'reddit', count: 100, pool: 500 }],
      })],
    }));
    assert.equal(even.items.some(item => item.kind === 'channel'), false, 'porsi yang sama di dua kanal bukan temuan');
  });

  test('pembacaan tandingan hanya muncul kalau uji gagal membedakan keluhan dan pujian', () => {
    const alsoPraise = deriveSignals(modelOf({
      labels: [labelOf('iklan', { reviewCount: 300, share: 0.3, praiseCount: 240, praiseShare: 0.3 })],
    }));
    const shared = alsoPraise.items.find(item => item.kind === 'shared');
    assert.ok(shared, 'kata yang laju kemunculannya sama di dua kelas adalah fitur yang disebut, bukan kerusakan');
    assert.equal(shared.facts.find(entry => entry.key === 'praise').value, 240);

    const complaintOnly = deriveSignals(modelOf({
      labels: [labelOf('iklan', { reviewCount: 300, share: 0.3, praiseCount: 10, praiseShare: 0.0125 })],
    }));
    assert.equal(complaintOnly.items.some(item => item.kind === 'shared'), false, 'frasa yang jelas hanya hidup di keluhan tidak diberi pembacaan tandingan');
  });

  test('kenapa tabel tidak penuh juga dilaporkan, bukan disembunyikan', () => {
    const trimmed = deriveSignals(modelOf({
      label: { trimmedLabels: 4, rejectedMerges: 187, links: 256, merges: 24, clusters: 16, phrases: 40 },
      labels: [labelOf('iklan', { reviewCount: 300, share: 0.3 }), labelOf('lag', { reviewCount: 120, share: 0.12 })],
    }));
    const kinds = trimmed.items.filter(item => item.kind === 'structure').map(item => item.id);
    assert.ok(kinds.includes('structure:trimmed'), kinds.join(', '));
    assert.ok(kinds.includes('structure:chain'), kinds.join(', '));
    assert.ok(trimmed.items.find(item => item.id === 'structure:chain').body.includes('187 were refused'));
    assert.ok(trimmed.items.find(item => item.id === 'structure:spread').body.includes('does not add up to the pool'));

    const unlinked = deriveSignals(modelOf({
      label: { links: 0, merges: 0, rejectedMerges: 0, clusters: 40, reportedLabels: 12 },
      labels: Array.from({ length: 3 }, (_, index) => labelOf(`frasa ${index}`, { phraseCount: 1, reviewCount: 50 - index, share: 0.05 })),
    }));
    assert.ok(unlinked.items.some(item => item.id === 'structure:no-linkage'), 'gerombol yang tidak bisa disatukan harus disebut, bukan didiamkan');
  });

  test('batasan klaim ikut menjadi sinyal', () => {
    const signals = deriveSignals(modelOf({ labels: [labelOf('iklan', { reviewCount: 300, share: 0.3 })] }));
    const silent = signals.items.find(item => item.id === 'coverage:silent');
    assert.equal(silent.facts.find(entry => entry.key === 'silent').value, 300, '1.000 keluhan dikurangi 700 yang berfrasa');
    assert.ok(silent.body.includes('never inflated to the labelled subset'));
    const unclassified = signals.items.find(item => item.id === 'coverage:unclassified');
    assert.ok(unclassified.body.includes('NSS and every sentiment figure are computed on the remaining 1,900'));

    const complete = deriveSignals(modelOf({
      pain: { matchedReviews: 1000 },
      coverage: { unclassified: 0 },
      labels: [labelOf('iklan', { reviewCount: 300, share: 0.3 })],
    }));
    assert.equal(complete.items.some(item => item.kind === 'coverage'), false, 'tidak ada batas klaim kalau tidak ada yang tertinggal');
  });

  test('setiap angka kalimat sinyal adalah hasil ukur, dan setiap hasil ukur tertulis', () => {
    const model = modelOf({
      labels: [
        labelOf('iklan', { reviewCount: 450, share: 0.45, phraseCount: 35, early: 50, late: 400, momentum: 8, praiseCount: 120, praiseShare: 0.15, channels: [{ id: 'play', count: 400, pool: 500 }, { id: 'reddit', count: 50, pool: 500 }] }),
        labelOf('lag', { reviewCount: 120, share: 0.12, early: 110, late: 10, momentum: 0.09, praiseCount: 20, praiseShare: 0.025, channels: [{ id: 'play', count: 40, pool: 500 }, { id: 'reddit', count: 80, pool: 500 }] }),
      ],
    });
    const signals = deriveSignals(model);
    assert.ok(signals.items.length >= 5, 'korpus lengkap harus menghasilkan banyak baris');
    for (const item of signals.items) {
      assertNumbersAreMeasured(item, item.id);
      for (const entry of item.facts) {
        assert.ok(Number.isFinite(entry.value) || typeof entry.value === 'string', `${item.id}: facts.${entry.key} bukan hasil ukur`);
        assert.ok(entry.label && entry.key, `${item.id}: setiap facts butuh kunci dan label`);
      }
    }
  });

  test('anggaran tampil dilaporkan lewat metrics, tidak memangkas diam-diam', () => {
    const model = modelOf({
      label: { trimmedLabels: 0, rejectedMerges: 0 },
      labels: [
        labelOf('iklan', { reviewCount: 300, share: 0.3, praiseCount: 240, praiseShare: 0.3, early: 10, late: 290, momentum: 29, channels: [{ id: 'play', count: 290, pool: 500 }] }),
        labelOf('lag', { reviewCount: 200, share: 0.2, praiseCount: 160, praiseShare: 0.2, early: 190, late: 10, momentum: 0.05, channels: [{ id: 'reddit', count: 190, pool: 500 }] }),
        labelOf('error', { reviewCount: 150, share: 0.15, praiseCount: 120, praiseShare: 0.15, early: 5, late: 145, momentum: 29, channels: [{ id: 'play', count: 145, pool: 500 }] }),
        labelOf('mahal', { reviewCount: 100, share: 0.1, praiseCount: 80, praiseShare: 0.1, early: 95, late: 5, momentum: 0.05, channels: [{ id: 'reddit', count: 95, pool: 500 }] }),
      ],
    });
    const signals = deriveSignals(model);
    assert.ok(signals.metrics.candidates > signals.metrics.reported, `${signals.metrics.candidates} kandidat harus lebih banyak dari ${signals.metrics.reported} yang tampil`);
    assert.equal(signals.items.length, signals.metrics.reported);
    assert.equal(signals.metrics.candidates, signals.metrics.reported + signals.metrics.trimmed);
    assert.ok(Object.values(signals.metrics.byKind).reduce((sum, value) => sum + value, 0) >= signals.items.length);
  });

  test('referensi sinyal menunjuk label dan kanal yang benar-benar ada', () => {
    const model = modelOf({
      labels: [labelOf('iklan', {
        reviewCount: 300,
        share: 0.3,
        early: 50,
        late: 250,
        momentum: 5,
        channels: [{ id: 'play', count: 290, pool: 500 }, { id: 'reddit', count: 10, pool: 500 }],
      })],
    });
    const knownLabels = new Set(model.painPoints.labels.map(label => label.id));
    const knownChannels = new Set(model.platforms.map(platform => platform.id));
    for (const item of deriveSignals(model).items) {
      if (['theme', 'rise', 'fall', 'channel', 'shared'].includes(item.kind)) {
        assert.ok(item.refs.length >= 1, `${item.id} adalah temuan tentang satu label, jadi harus menunjuk labelnya`);
      }
      if (item.id.startsWith('coverage')) assert.deepEqual(item.refs, [], `${item.id} tidak menunjuk label tertentu`);
      if (!item.refs.length) continue;
      assert.ok(knownLabels.has(item.refs[0]), `${item.id} menunjuk label yang tidak ada: ${item.refs[0]}`);
      for (const ref of item.refs.slice(1)) {
        if (item.kind === 'channel') assert.ok(knownChannels.has(ref), `${item.id} menunjuk kanal yang tidak ada: ${ref}`);
        else assert.ok(knownLabels.has(ref), `${item.id} menunjuk label yang tidak ada: ${ref}`);
      }
    }
  });

  test('korpus tanpa label tetap bisa menjelaskan dirinya sendiri', () => {
    const signals = deriveSignals(modelOf({ labels: [], pain: { matchedReviews: 0 }, label: { trimmedLabels: 0, rejectedMerges: 0, links: 0 } }));
    assert.equal(signals.status, 'insufficient');
    assert.equal(signals.basis.labels, 0);
    assert.deepEqual(signals.items.map(item => item.kind), ['coverage', 'coverage']);
    assert.ok(signals.items.every(item => item.title.length > 10));
  });

  test('sinyal selamat melewati JSON karena tidak memakai Map', () => {
    const model = modelOf({ labels: [labelOf('iklan', { reviewCount: 300, share: 0.3 })] });
    const restored = JSON.parse(JSON.stringify(deriveSignals(model)));
    assert.deepEqual(restored, deriveSignals(model));
  });

  test('sinyal end-to-end dari korpus nyata menyebut angka yang bisa dihitung ulang', () => {
    const reviews = [];
    let id = 0;
    // Dua keluhan yang selalu ditulis bersama (satu gerombol) dan satu keluhan yang berdiri
    // sendiri; porsi kanalnya sengaja berbeda supaya uji konsentrasi punya kasus nyata.
    const late = { play: 90, reddit: 10 };
    for (const [platform, times] of [['play', 40], ['reddit', 10]]) {
      for (let copy = 0; copy < times; copy += 1) {
        reviews.push({ id: `n${id}`, rating: 1, platform, date: '2026-01-05', text: 'jaring lemot gagal transfer terus' });
        id += 1;
      }
    }
    for (const [platform, times] of [['play', late.play], ['reddit', late.reddit]]) {
      for (let copy = 0; copy < times; copy += 1) {
        reviews.push({ id: `l${id}`, rating: 2, platform, date: '2026-03-10', text: 'jaring lemot gagal transfer terus' });
        id += 1;
      }
    }
    for (let copy = 0; copy < 60; copy += 1) {
      reviews.push({ id: `p${copy}`, rating: 5, platform: copy % 2 ? 'play' : 'reddit', date: '2026-02-01', text: 'mantap sekali transfer cepat aman nyaman' });
    }
    const { rows, model } = analyzeCorpus(reviews, { generatedAt: '2026-04-01T00:00:00.000Z', listing: '', entity: 'Uji Sinyal' });
    const pain = model.painPoints;
    assert.ok(pain.labels.length, 'korpusnya harus membentuk label');
    const head = pain.labels[0];
    const signals = model.signals;
    const theme = signals.items.find(item => item.kind === 'theme');
    assert.equal(theme.subject, head.name);

    // Hitung ulang dukungan label dari teks mentah: frasa anggotanya dicari satu per satu.
    const negative = rows.filter(row => row.rating <= 2);
    const memberTexts = new Set(head.phrases.map(entry => entry.text));
    const recomputed = negative.filter(row => head.phrases.some(entry => row.text.split(/\s+/).join(' ').includes(entry.text))).length;
    assert.equal(theme.facts.find(entry => entry.key === 'reviews').value, recomputed, 'jumlah ulasan sinyal harus sama dengan hitungan teks mentah');
    assert.equal(head.reviewCount, recomputed);
    assert.ok(recomputed > 0 && memberTexts.size >= 1);

    // Angka kanal pun diverifikasi dari baris aslinya.
    const onPlay = negative.filter(row => row.platform === 'play' && head.phrases.some(entry => row.text.includes(entry.text))).length;
    const channel = signals.items.find(item => item.kind === 'channel' && item.refs[0] === head.id);
    if (channel) assert.equal(channel.facts.find(entry => entry.key === 'channelReviews').value, onPlay, 'konsentrasi kanal harus cocok dengan teks mentah');
    const pool = negative.filter(row => row.platform === 'play').length;
    assert.equal(pain.labels[0].channels.find(entry => entry.id === 'play').pool, pool);
  });
});
