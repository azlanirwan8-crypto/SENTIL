// Lapisan keempat: sinyal. Isinya BUKAN kalimat yang ditulis manusia dan BUKAN keluaran model
// bahasa — setiap baris adalah fakta terukur yang dipilih mesin karena angkanya memenuhi uji
// kemaknaan yang sama dengan lapisan frasa dan topik (log-odds terhadap simpangan baku estimasi
// sendiri). Tidak ada angka di teks sinyal yang dirangkai ulang: setiap angka yang muncul di
// `body` ada di `facts` dan dibaca langsung dari label, kanal, atau cakupan hasil ukur korpus.
//
// Urutannya ditiru dari cara analis laporan menulis: temuan terbesar lebih dulu, lalu arah
// waktu, lalu konsentrasi kanal, lalu pembacaan tandingan, lalu batas atas klaim. Di dalam
// tiap kelompok, yang lolos uji paling kuat berbicara lebih dulu.
import { isSignal } from './corpus-params.mjs';
import { PLATFORM_LABELS } from './channels.mjs';

export const SIGNAL_VERSION = 'signal-v1';

// Anggaran tampilan, sama seperti lapisan frasa dan label: kandidat yang tidak ditampilkan
// tetap dihitung dan dilaporkan lewat `metrics`, tidak hilang diam-diam.
const MAX_SIGNALS = 8;

const numberFormat = new Intl.NumberFormat('en-GB');
const count = value => (Number.isFinite(value) ? numberFormat.format(value) : 'N/A');
const percent = share => (Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : 'N/A');
const ratio = value => (Number.isFinite(value) ? `${value.toFixed(2)}` : 'N/A');
const channelName = id => PLATFORM_LABELS[id] || String(id || 'unknown');

const RULES = {
  emission: 'sinyal ditulis hanya kalau selisih dua proporsi lebih besar daripada simpangan baku estimasinya sendiri — konvensi yang sama dengan lapisan frasa dan topik',
  numbers: 'setiap angka pada kalimat sinyal dibaca langsung dari label, kanal, atau cakupan yang dihitung korpus; tidak ada angka yang dikira-kira atau ditulis ulang',
  ranking: 'di dalam setiap kelompok sinyal yang paling kuat ujiannya lebih dulu; kelompok disusun mengikuti urutan laporan analis: temuan, arah, konsentrasi, pembacaan tandingan, batas klaim',
  silence: 'kenapa sebuah tabel kosong juga laporan: korpus yang frasanya tidak bisa digabung atau yang banyak tidak terklasifikasi punya sinyalnya sendiri',
  maxSignals: MAX_SIGNALS,
};

// Dua proporsi dibandingkan dengan konvensi mesin. `z` hanya dipakai untuk mengurutkan, tidak
// pernah untuk memutuskan — keputusan tetap `significant` dari isSignal().
function test(inside, insidePool, outside, outsidePool) {
  if (!(insidePool > 0) || !(outsidePool > 0)) return null;
  const result = isSignal(inside, outside, insidePool, outsidePool);
  if (!(result.error > 0)) return null;
  return { ...result, z: Math.abs(result.estimate) / result.error };
}

const fact = (key, label, value, unit) => ({ key, label, value, unit });

// Kelompok temuan: label terbesar korpus. Ini headline, jadi selalu ditulis lebih dulu.
// Kalimatnya ditulis dalam dua bahasa sejak lahir (`title`/`titleId`, `body`/`bodyId`): teks
// sinyal adalah data yang dihitung mesin, dan mesin yang sama bisa menuliskannya dalam
// bahasa mana pun tanpa menyentuh angkanya — angka yang sama dirakit dari `facts` yang sama.
function themeSignal(model, label) {
  const pool = model.painPoints?.pools?.negative ?? 0;
  return {
    id: `theme:${label.id}`,
    kind: 'theme',
    subject: label.name,
    title: `Largest complaint theme: “${label.name}”`,
    titleId: `Tema keluhan terbesar: “${label.name}”`,
    body: `${count(label.reviewCount)} of ${count(pool)} one-two star reviews (${percent(label.share)}) carry this wording — ${label.phraseCount} phrase${label.phraseCount === 1 ? '' : 's'} evidenced in reviewer text and counted once per reviewer rather than once per phrase.`,
    bodyId: `${count(label.reviewCount)} dari ${count(pool)} ulasan bintang satu-dua memakai kata ini (${percent(label.share)}) — ${label.phraseCount} frasa${label.phraseCount === 1 ? '' : 's'} yang terbukti dari tulisan reviewer dan dihitung satu kali per reviewer, bukan satu kali per frasa.`,
    facts: [
      fact('reviews', 'reviews', label.reviewCount, 'count'),
      fact('pool', '1-2 star pool', pool, 'count'),
      fact('share', 'share', label.share, 'percent'),
      fact('phrases', 'phrases', label.phraseCount, 'count'),
    ],
    refs: [label.id],
    strength: label.share ?? 0,
  };
}

// Kelompok arah: membandingkan porsi keluhan paruh kedua terhadap paruh pertama, atas pool
// keluhan tiap paruh yang dihitung korpus — jadi "naik" selalu berarti lebih padat, bukan
// lebih banyak ulasan.
function trendSignal(label, range) {
  if (!range?.firstDay || !(range.earlyNegative > 0) || !(range.lateNegative > 0)) return null;
  if (!(label.early > 0) || !(label.late > 0)) return null;
  const result = test(label.late, range.lateNegative, label.early, range.earlyNegative);
  if (!result?.significant) return null;
  const rising = result.estimate > 0;
  const firstHalf = `${count(label.early)} of ${count(range.earlyNegative)}`;
  const secondHalf = `${count(label.late)} of ${count(range.lateNegative)}`;
  const firstHalfId = `${count(label.early)} dari ${count(range.earlyNegative)}`;
  const secondHalfId = `${count(label.late)} dari ${count(range.lateNegative)}`;
  return {
    id: `trend:${label.id}`,
    kind: rising ? 'rise' : 'fall',
    subject: label.name,
    title: `Complaint rate ${rising ? 'rising' : 'easing'}: “${label.name}”`,
    titleId: `Laju keluhan ${rising ? 'naik' : 'mereda'}: “${label.name}”`,
    body: `${range.firstDay} to the midpoint records ${firstHalf} reviews; the midpoint to ${range.lastDay} records ${secondHalf}. The daily rate over the second half is ${ratio(label.momentum)}× the first half — a difference too large to be chance.`,
    bodyId: `${range.firstDay} sampai titik tengah mencatat ${firstHalfId} ulasan; titik tengah sampai ${range.lastDay} mencatat ${secondHalfId} ulasan. Laju harian di paruh kedua ${ratio(label.momentum)}× paruh pertama — selisih yang terlalu besar untuk disebut kebetulan.`,
    facts: [
      fact('rate', 'per-day ratio', label.momentum, 'ratio'),
      fact('early', 'first half', label.early, 'count'),
      fact('late', 'second half', label.late, 'count'),
      fact('earlyPool', 'first-half complaints', range.earlyNegative, 'count'),
      fact('latePool', 'second-half complaints', range.lateNegative, 'count'),
      fact('firstDay', 'from', range.firstDay, 'text'),
      fact('lastDay', 'to', range.lastDay, 'text'),
    ],
    refs: [label.id],
    strength: result.z,
    z: Number(result.z.toFixed(2)),
  };
}

// Kelompok konsentrasi: porsi label ini di kanal tersebut dibandingkan porsinya di kanal lain.
// Arahnya diminta positif — "keluhan ini menumpuk di kanal X" — karena arah sebaliknya sudah
// dijawab oleh sinyal kanal lain di daftar yang sama.
function channelSignals(model, label) {
  const pool = model.painPoints?.pools?.negative ?? 0;
  const rows = Array.isArray(label.channels) ? label.channels : [];
  const out = [];
  for (const channel of rows) {
    if (!(channel.count > 0) || !(channel.pool > 0)) continue;
    const outside = label.reviewCount - channel.count;
    const outsidePool = pool - channel.pool;
    const result = test(channel.count, channel.pool, outside, outsidePool);
    if (!result?.significant || result.estimate <= 0) continue;
    const name = channelName(channel.id);
    const insideRate = channel.count / channel.pool;
    const outsideRate = outside / outsidePool;
    out.push({
      id: `channel:${label.id}:${channel.id}`,
      kind: 'channel',
      subject: `${label.name} · ${name}`,
      title: `Channel concentration: “${label.name}” on ${name}`,
      titleId: `Konsentrasi kanal: “${label.name}” di ${name}`,
      body: `${count(channel.count)} of the ${count(label.reviewCount)} reviews carrying this wording came from ${name}: ${percent(insideRate)} of that channel’s ${count(channel.pool)} complaints against ${percent(outsideRate)} in all other channels — too far apart to be chance.`,
      bodyId: `${count(channel.count)} dari ${count(label.reviewCount)} ulasan yang memakai kata ini datang dari ${name}: ${percent(insideRate)} dari ${count(channel.pool)} keluhan kanal itu melawan ${percent(outsideRate)} di seluruh kanal lain — selisih yang terlalu besar untuk disebut kebetulan.`,
      facts: [
        fact('channelReviews', 'on this channel', channel.count, 'count'),
        fact('channelPool', 'channel complaints', channel.pool, 'count'),
        fact('labelReviews', 'label reviews', label.reviewCount, 'count'),
        fact('inside', 'rate on channel', insideRate, 'percent'),
        fact('outside', 'rate elsewhere', outsideRate, 'percent'),
      ],
      refs: [label.id, channel.id],
      strength: result.z,
      z: Number(result.z.toFixed(2)),
    });
  }
  return out.sort((a, b) => b.strength - a.strength);
}

// Pembacaan tandingan: frasa yang muncul di keluhan DAN pujian dengan laju yang tidak bisa
// dibedakan adalah kata yang dipakai orang untuk menyebut fiturnya, bukan bukti bahwa fitur itu
// rusak. Sinyal ini hanya boleh muncul kalau uji dua proporsi memang gagal membedakan.
function sharedSignal(model, label) {
  const pools = model.painPoints?.pools || {};
  if (!(label.praiseCount > 0) || !(pools.positive > 0)) return null;
  const result = test(label.praiseCount, pools.positive, label.reviewCount, pools.negative);
  if (result?.significant) return null;
  return {
    id: `shared:${label.id}`,
    kind: 'shared',
    subject: label.name,
    title: `Wording shared with satisfied reviews: “${label.name}”`,
    titleId: `Kata yang sama dipakai ulasan puas: “${label.name}”`,
    body: `${count(label.praiseCount)} of ${count(pools.positive)} four-five star reviews use the same wording (${percent(label.praiseShare)}), against ${count(label.reviewCount)} of ${count(pools.negative)} one-two star reviews (${percent(label.share)}). The two rates are too close to tell apart here, so this wording names the feature — it is not proof that the feature failed.`,
    bodyId: `${count(label.praiseCount)} dari ${count(pools.positive)} ulasan bintang empat-lima memakai kata yang sama (${percent(label.praiseShare)}), melawan ${count(label.reviewCount)} dari ${count(pools.negative)} ulasan bintang satu-dua (${percent(label.share)}). Dua laju ini terlalu dekat untuk dibedakan di sini, jadi kata ini menyebut fiturnya — bukan bukti bahwa fitur itu gagal.`,
    facts: [
      fact('praise', 'in praise', label.praiseCount, 'count'),
      fact('praiseShare', 'praise rate', label.praiseShare, 'percent'),
      fact('complaintShare', 'complaint rate', label.share, 'percent'),
    ],
    refs: [label.id],
    strength: Math.min(label.praiseShare ?? 0, label.share ?? 0),
  };
}

// Kenapa tabelnya kosong, atau kenapa hanya sebagian yang tampil — ditulis sebagai sinyal,
// bukan dibiarkan hilang, supaya tidak ada klaim yang lebih besar dari buktinya.
function structureSignals(model, metrics, labels) {
  const out = [];
  const pool = model.painPoints?.pools?.negative ?? 0;
  if (labels.length && !(metrics.links > 0)) {
    out.push({
      id: 'structure:no-linkage',
      kind: 'structure',
      subject: 'label layer',
      title: 'Complaint phrases show no co-occurrence beyond chance',
      titleId: 'Frasa keluhan tidak menunjukkan kemunculan bersama di atas kebetulan',
      body: `${count(metrics.phrases)} phrases cleared the test that separates repeated wording from chance. No two of them show up in the same reviews more often than luck explains — ${count(metrics.links ?? 0)} links survived. So each of the ${count(metrics.clusters ?? 0)} labels is one phrase standing alone, and none were merged to tidy the table.`,
      bodyId: `${count(metrics.phrases)} frasa lolos uji yang memisahkan kata berulang dari kebetulan. Tidak ada dua frasa yang muncul di ulasan yang sama lebih sering daripada yang bisa dijelaskan kebetulan — ${count(metrics.links ?? 0)} ikatan bertahan. Jadi tiap label dari ${count(metrics.clusters ?? 0)} adalah satu frasa yang berdiri sendiri, dan tidak ada yang digabung untuk merapikan tabel.`,
      facts: [
        fact('phrases', 'phrases', metrics.phrases, 'count'),
        fact('links', 'links', metrics.links ?? 0, 'count'),
        fact('clusters', 'clusters', metrics.clusters ?? 0, 'count'),
      ],
      refs: [],
      strength: 0,
    });
  }
  if ((metrics.trimmedLabels ?? 0) > 0) {
    out.push({
      id: 'structure:trimmed',
      kind: 'structure',
      subject: 'display budget',
      title: `${count(metrics.trimmedLabels)} clusters fall outside the display budget`,
      titleId: `${count(metrics.trimmedLabels)} klaster berada di luar anggaran tampil`,
      body: `${count(metrics.clusters)} clusters were formed and ${count(metrics.reportedLabels)} are reported; the ${count(metrics.trimmedLabels)} omitted here remain counted in every total. Their wording carries weaker review support, it is not absent.`,
      bodyId: `${count(metrics.clusters)} klaster terbentuk dan ${count(metrics.reportedLabels)} dilaporkan; ${count(metrics.trimmedLabels)} yang tidak tampil di sini tetap dihitung di setiap total. Kata mereka lebih lemah dukungannya, bukan tidak ada.`,
      facts: [
        fact('clusters', 'clusters', metrics.clusters, 'count'),
        fact('reported', 'reported', metrics.reportedLabels, 'count'),
        fact('trimmed', 'trimmed', metrics.trimmedLabels, 'count'),
      ],
      refs: [],
      strength: 0,
    });
  }
  if ((metrics.rejectedMerges ?? 0) > 0) {
    out.push({
      id: 'structure:chain',
      kind: 'structure',
      subject: 'closure rule',
      title: `${count(metrics.rejectedMerges)} merges were refused for missing evidence`,
      titleId: `${count(metrics.rejectedMerges)} penggabungan ditolak karena buktinya tidak lengkap`,
      body: `Of ${count(metrics.links)} links that cleared that test, ${count(metrics.merges)} joined two groups and ${count(metrics.rejectedMerges)} were refused: not every phrase on one side appeared with every phrase on the other. The ${count(metrics.clusters)} themes shown here, built from ${count(metrics.phrases)} phrases, are the groups that proved themselves end to end.`,
      bodyId: `Dari ${count(metrics.links)} ikatan yang lolos uji itu, ${count(metrics.merges)} menyatukan dua kelompok dan ${count(metrics.rejectedMerges)} ditolak: tidak setiap frasa di satu sisi muncul bersama setiap frasa di sisi lain. ${count(metrics.clusters)} tema yang tampil di sini, dibangun dari ${count(metrics.phrases)} frasa, adalah kelompok yang membuktikan dirinya dari ujung ke ujung.`,
      facts: [
        fact('links', 'links', metrics.links, 'count'),
        fact('merges', 'merged', metrics.merges, 'count'),
        fact('rejected', 'rejected', metrics.rejectedMerges, 'count'),
        fact('phrases', 'phrases', metrics.phrases, 'count'),
        fact('clusters', 'clusters', metrics.clusters, 'count'),
      ],
      refs: [],
      strength: 0,
    });
  }
  if (labels.length && pool > 0) {
    const head = labels[0];
    const second = labels[1] || null;
    out.push({
      id: 'structure:spread',
      kind: 'structure',
      subject: 'complaint spread',
      title: `Largest theme carries ${percent(head.share)} of complaint volume`,
      titleId: `Tema terbesar membawa ${percent(head.share)} volume keluhan`,
      body: `“${head.name}” reaches ${count(head.reviewCount)} distinct reviewers${second ? `, “${second.name}” reaches ${count(second.reviewCount)}` : ''}. A reviewer is counted once per label, so two labels can both include the same person — this column deliberately does not add up to the pool.`,
      bodyId: `“${head.name}” menjangkau ${count(head.reviewCount)} reviewer berbeda${second ? `, “${second.name}” menjangkau ${count(second.reviewCount)}` : ''}. Satu reviewer dihitung satu kali per label, jadi dua label bisa memuat orang yang sama — kolom ini sengaja tidak menjumlah menjadi pool.`,
      facts: [
        fact('head', 'largest label', head.reviewCount, 'count'),
        fact('headShare', 'its share', head.share, 'percent'),
        ...(second ? [fact('second', 'second label', second.reviewCount, 'count')] : []),
      ],
      refs: labels.map(label => label.id),
      strength: head.reviewCount / pool,
    });
  }
  return out;
}

function coverageSignals(model) {
  const coverage = model.coverage || {};
  const pain = model.painPoints || {};
  const out = [];
  if ((coverage.unclassified ?? 0) > 0 && coverage.reviews) {
    const share = coverage.unclassified / coverage.reviews;
    out.push({
      id: 'coverage:unclassified',
      kind: 'coverage',
      subject: 'classification',
      title: `${count(coverage.unclassified)} reviews remain unclassified`,
      titleId: `${count(coverage.unclassified)} ulasan tetap tidak terklasifikasi`,
      body: `No learned term carried them, so they are excluded from sentiment rather than forced into a class: ${percent(share)} of ${count(coverage.reviews)} read reviews. NSS and every sentiment figure are computed on the remaining ${count(coverage.analyzed)}.`,
      bodyId: `Tidak ada istilah terpelajari yang memuatnya, jadi mereka dikeluarkan dari sentimen alih-alih dipaksa masuk satu kelas: ${percent(share)} dari ${count(coverage.reviews)} ulasan terbaca. NSS dan seluruh angka sentimen dihitung atas ${count(coverage.analyzed)} sisanya.`,
      facts: [
        fact('unclassified', 'unclassified', coverage.unclassified, 'count'),
        fact('reviews', 'reviews', coverage.reviews, 'count'),
        fact('analyzed', 'classified', coverage.analyzed, 'count'),
      ],
      refs: [],
      strength: share,
    });
  }
  const silent = (pain.pools?.negative ?? 0) - (pain.metrics?.matchedReviews ?? 0);
  if (silent > 0) {
    out.push({
      id: 'coverage:silent',
      kind: 'coverage',
      subject: 'phrase coverage',
      title: `${count(silent)} complaints carry no proven phrase`,
      titleId: `${count(silent)} keluhan tidak punya frasa yang terbukti`,
      body: `${count(pain.metrics?.matchedReviews ?? 0)} of ${count(pain.pools.negative)} one-two star reviews carry at least one proven phrase. The rest still count in every rating figure but appear in no label, so label shares are measured against all complaints — never inflated to the labelled subset.`,
      bodyId: `${count(pain.metrics?.matchedReviews ?? 0)} dari ${count(pain.pools.negative)} ulasan bintang satu-dua memuat setidaknya satu frasa terbukti. Sisanya tetap dihitung di setiap angka rating tetapi tidak muncul di label mana pun, jadi porsi label diukur terhadap seluruh keluhan — tidak digelembungkan ke subset yang berlabel.`,
      facts: [
        fact('matched', 'worded complaints', pain.metrics?.matchedReviews ?? 0, 'count'),
        fact('silent', 'no wording', silent, 'count'),
        fact('negative', '1-2 star pool', pain.pools.negative, 'count'),
      ],
      refs: [],
      strength: silent / pain.pools.negative,
    });
  }
  return out;
}

const byStrength = (a, b) => (b.strength ?? 0) - (a.strength ?? 0) || String(a.id).localeCompare(String(b.id));

export function deriveSignals(model) {
  const pain = model?.painPoints;
  const metrics = pain?.labelMetrics || { phrases: 0, links: 0, clusters: 0, reportedLabels: 0, trimmedLabels: 0, singletons: 0, namedFromTerm: 0 };
  const labels = Array.isArray(pain?.labels) ? pain.labels : [];
  const range = metrics.trend || null;
  const basis = {
    reviews: model?.coverage?.reviews ?? null,
    labels: labels.length,
    negativePool: pain?.pools?.negative ?? null,
    positivePool: pain?.pools?.positive ?? null,
    trend: range ? { firstDay: range.firstDay, lastDay: range.lastDay, earlyNegative: range.earlyNegative ?? null, lateNegative: range.lateNegative ?? null } : null,
  };

  const themes = labels.length ? [themeSignal(model, labels[0])] : [];
  const movements = labels.map(label => trendSignal(label, range)).filter(Boolean).sort(byStrength);
  const concentrations = labels.slice(0, 4).flatMap(label => channelSignals(model, label)).sort(byStrength);
  const counters = labels.slice(0, 4).map(label => sharedSignal(model, label)).filter(Boolean).sort(byStrength);
  const structure = structureSignals(model, metrics, labels);
  const coverage = coverageSignals(model);

  // Satu sinyal naik-turun per arah: dua label yang bergerak ke arah sama diceritakan sekali
  // lewat yang lebih kuat, supaya daftar tidak berubah jadi pengulangan angka yang sama.
  const rising = movements.filter(item => item.kind === 'rise');
  const falling = movements.filter(item => item.kind === 'fall');
  const movementsShown = [rising[0], falling[0]].filter(Boolean);
  const concentrationsShown = concentrations.filter((item, index) => index < 2 && (!index || item.refs[0] !== concentrations[0].refs[0]));

  const items = [
    ...themes,
    ...movementsShown,
    ...concentrationsShown,
    ...counters,
    ...structure,
    ...coverage,
  ];

  return {
    version: SIGNAL_VERSION,
    // `insufficient` di sini berarti lapisan label tidak menghasilkan apa pun untuk dianalisis.
    // Catatan cakupan tetap ditulis supaya pembaca tahu kenapa panelnya tipis, bukan dibiarkan
    // kosong tanpa penjelasan.
    status: labels.length ? 'ready' : 'insufficient',
    rules: RULES,
    basis,
    metrics: {
      candidates: items.length,
      reported: Math.min(items.length, MAX_SIGNALS),
      trimmed: Math.max(0, items.length - MAX_SIGNALS),
      byKind: items.reduce((tally, item) => {
        tally[item.kind] = (tally[item.kind] || 0) + 1;
        return tally;
      }, {}),
    },
    items: items.slice(0, MAX_SIGNALS),
  };
}
