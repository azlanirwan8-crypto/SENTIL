// Mesin perbandingan lintas project. Sengaja berjalan di server dan hanya membaca ringkasan
// yang sudah tersimpan (summary + model), bukan mengirim puluhan ribu ulasan per project ke
// peramban: lima project dengan 30.000 ulasan masing-masing adalah 150.000 baris, dan itu
// tidak akan pernah muat dalam satu permintaan.
//
// Tidak ada baseline yang ditulis tangan. Acuan setiap baris metrik adalah median lintas
// project yang sedang dibandingkan, jadi angkanya berubah mengikuti isi matriks. Arah "mana
// yang lebih baik" adalah sifat semantik dari metriknya (NSS tinggi itu baik, pangsa 1★
// rendah itu baik), bukan ambang.
export const COMPARE_VERSION = 'compare-matrix-v1';

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

const medianOf = values => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
};

const sum = values => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

const share = (value, total) => (Number.isFinite(value) && total ? value / total : null);

const dayNumber = date => Date.parse(`${date}T00:00:00Z`);

// Rentang waktu dihitung dari data project itu sendiri, bukan dari jendela tetap "30 hari".
function velocityOf(daily) {
  const rows = (Array.isArray(daily) ? daily : []).filter(entry => typeof entry?.date === 'string' && Number.isFinite(entry.total));
  if (!rows.length) return { perDay: null, momentum: null, peak: null, spanDays: null, observed: 0 };
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = dayNumber(ordered[0].date);
  const last = dayNumber(ordered[ordered.length - 1].date);
  const spanDays = Math.max(1, Math.round((last - first) / 86400000) + 1);
  const total = sum(ordered.map(entry => entry.total));
  const midpoint = first + (last - first) / 2;
  const early = ordered.filter(entry => dayNumber(entry.date) <= midpoint);
  const late = ordered.filter(entry => dayNumber(entry.date) > midpoint);
  const peak = ordered.reduce((best, entry) => (entry.total > (best?.total ?? -1) ? entry : best), null);
  // Momentum = paruh kedua terhadap paruh pertama dari rentang yang teramati. Titik belahnya
  // adalah tengah rentang itu sendiri, jadi tidak ada jendela harian yang harus dipilih.
  const earlyPerDay = early.length ? sum(early.map(entry => entry.total)) / early.length : 0;
  const latePerDay = late.length ? sum(late.map(entry => entry.total)) / late.length : 0;
  return {
    perDay: round(total / spanDays, 3),
    momentum: earlyPerDay > 0 ? round(latePerDay / earlyPerDay, 3) : null,
    peak: peak ? { date: peak.date, total: peak.total } : null,
    spanDays,
    observed: total,
  };
}

function storeRatingOf(channels) {
  const list = Array.isArray(channels) ? channels : [];
  for (const channel of list) {
    const app = channel?.app;
    if (!app) continue;
    const histogram = Array.isArray(app.ratingHistogram) && app.ratingHistogram.length === 5 ? app.ratingHistogram : null;
    if (!histogram) continue;
    const total = sum(histogram);
    if (!total) continue;
    // Histogram toko disimpan dengan indeks 0 = bintang 5 (sama seperti kolektor membacanya).
    const weighted = histogram.reduce((acc, value, index) => acc + value * (5 - index), 0);
    return {
      channel: channel.id,
      average: round(weighted / total, 3),
      total,
      oneStarShare: round(histogram[4] / total, 6),
      reported: Number.isInteger(app.ratingCount) ? app.ratingCount : null,
    };
  }
  return null;
}

function metricsOf(workspace, dataset) {
  const model = dataset?.model || {};
  const summary = dataset?.summary || model.summary || {};
  const coverage = model.coverage || {};
  const labels = model.labels || {};
  const analyzed = Number.isFinite(summary.analyzed) ? summary.analyzed : (labels.positive || 0) + (labels.negative || 0) + (labels.neutral || 0);
  const breakdown = Array.isArray(coverage.ratingBreakdown) && coverage.ratingBreakdown.length === 5 ? coverage.ratingBreakdown : null;
  const rated = breakdown ? sum(breakdown) : (Number.isInteger(summary.rated) ? summary.rated : null);
  const store = storeRatingOf(dataset?.channels);
  const volume = Number.isFinite(summary.reviews) ? summary.reviews : (Array.isArray(dataset?.reviews) ? dataset.reviews.length : null);

  return {
    volume,
    withText: Number.isFinite(summary.withText) ? summary.withText : (coverage.withText ?? null),
    analyzed,
    analyzedShare: share(analyzed, volume),
    unclassified: Number.isFinite(summary.unclassified) ? summary.unclassified : (coverage.unclassified ?? null),
    nss: Number.isFinite(summary.nss) ? summary.nss : (Number.isFinite(model.nss) ? model.nss : null),
    positiveShare: share(labels.positive, analyzed),
    neutralShare: share(labels.neutral, analyzed),
    negativeShare: share(labels.negative, analyzed),
    ingestedAverage: Number.isFinite(summary.avgRating) ? summary.avgRating : null,
    // Dua populasi berbeda dan tidak boleh digabung: 1★ dari ulasan yang TERBACA, dan 1★ dari
    // histogram TOKO yang melaporkan seluruh penilaian aplikasi.
    oneStarIngested: breakdown ? round(breakdown[0] / (rated || 1), 6) : null,
    oneStarCount: breakdown ? breakdown[0] : null,
    oneStarStore: store ? store.oneStarShare : null,
    storeRating: store ? store.average : null,
    storeRatingTotal: store ? store.total : null,
    velocity: velocityOf(model.daily),
    store,
    painPoints: Array.isArray(model.painPoints?.items) ? model.painPoints.items : [],
    topics: Array.isArray(model.topics) ? model.topics : [],
    engine: dataset?.engine?.version || model.version || null,
    painVersion: model.painPoints?.version || null,
    fetchedAt: dataset?.fetchedAt || null,
  };
}

// Satu baris metrik = satu perbandingan lintas kolom. `reference` adalah median nilai yang
// ada, jadi delta tidak pernah dibandingkan terhadap angka tetap yang seseorang pilih.
function metricRow(key, label, unit, direction, projects, accessor, formatter) {
  const values = projects.map(project => ({ id: project.id, value: accessor(project.metrics) }));
  const numbers = values.map(entry => entry.value).filter(Number.isFinite);
  if (!numbers.length) {
    return { key, label, unit, direction, reference: null, spread: null, values: values.map(entry => ({ ...entry, delta: null, rank: null })) };
  }
  const reference = medianOf(numbers);
  const max = Math.max(...numbers);
  const min = Math.min(...numbers);
  const ranked = [...numbers].sort((a, b) => (direction === 'down' ? a - b : b - a));
  return {
    key,
    label,
    unit,
    direction,
    formatter: formatter || null,
    reference: round(reference, 6),
    best: round(max, 6),
    worst: round(min, 6),
    spread: round(max - min, 6),
    values: values.map(entry => ({
      ...entry,
      delta: Number.isFinite(entry.value) ? round(entry.value - reference, 6) : null,
      rank: Number.isFinite(entry.value) ? ranked.indexOf(entry.value) + 1 : null,
    })),
  };
}

const percent = value => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—');
const plain = value => (Number.isFinite(value) ? String(value) : '—');

// Baris heatmap: gabungan frasa yang dilaporkan mesin korpus tiap project. Sebuah frasa tidak
// perlu muncul di semua kolom untuk ditampilkan — sel yang kosong dilaporkan sebagai null,
// bukan nol, supaya "tidak terdeteksi" tidak menyamar jadi "nol keluhan".
// `cells` sengaja objek biasa, bukan Map: hasil ini dikirim lewat JSON, dan Map terserialisasi
// menjadi {} sehingga pembaca di peramban kehilangan seluruh isinya.
function painPointMatrix(projects) {
  const byPhrase = new Map();
  for (const project of projects) {
    for (const item of project.metrics.painPoints) {
      if (!byPhrase.has(item.text)) byPhrase.set(item.text, { text: item.text, size: item.size, anchor: item.anchor, cells: {} });
      const row = byPhrase.get(item.text);
      const existing = row.cells[project.id];
      if (!existing || item.share > existing.share) row.cells[project.id] = { share: item.share, count: item.dfNegative, severity: item.severity };
    }
  }
  const rows = [...byPhrase.values()].map(row => {
    const cells = Object.values(row.cells);
    const shares = cells.map(cell => cell.share).filter(Number.isFinite);
    return {
      text: row.text,
      size: row.size,
      anchor: row.anchor,
      projectCount: cells.length,
      maxShare: shares.length ? Math.max(...shares) : null,
      medianShare: medianOf(shares),
      cells: row.cells,
    };
  }).sort((a, b) => b.projectCount - a.projectCount || (b.maxShare ?? 0) - (a.maxShare ?? 0) || a.text.localeCompare(b.text));
  return rows;
}

// Kesimpulan disusun dari selisih relatif antar kolom, diurutkan dari yang paling lebar, dan
// hanya menyebut angka yang benar-benar ada. Tidak ada kalimat yang dirangkai dari asumsi.
function insightsOf(projects, rows) {
  const comparable = rows.filter(row => row.direction !== 'neutral' && row.spread != null && row.values.some(entry => Number.isFinite(entry.value)));
  const scored = comparable.map(row => {
    const values = row.values.map(entry => entry.value).filter(Number.isFinite);
    const best = row.direction === 'down' ? Math.min(...values) : Math.max(...values);
    const worst = row.direction === 'down' ? Math.max(...values) : Math.min(...values);
    const winner = row.values.find(entry => entry.value === best);
    const loser = row.values.find(entry => entry.value === worst);
    const scale = Math.abs(medianOf(values) ?? 0) || Math.abs(best) || 1;
    return {
      key: row.key,
      label: row.label,
      relativeGap: Math.abs(best - worst) / scale,
      winnerId: winner?.id || null,
      loserId: loser?.id || null,
      best: round(best, 4),
      worst: round(worst, 4),
      absolute: round(Math.abs(best - worst), 4),
    };
  }).filter(entry => entry.winnerId && entry.loserId && entry.winnerId !== entry.loserId && entry.absolute > 0)
    .sort((a, b) => b.relativeGap - a.relativeGap || a.key.localeCompare(b.key));
  return scored;
}

const PRESENTATION_ROWS = 24;

export function buildComparison({ workspaces = [], datasets = {}, generatedAt = new Date().toISOString() } = {}) {
  const projects = workspaces.map(workspace => {
    const dataset = datasets[workspace.id] || null;
    return {
      id: workspace.id,
      label: workspace.label || workspace.entity || workspace.id,
      entity: workspace.entity || null,
      hasData: Boolean(dataset),
      fetchedAt: dataset?.fetchedAt || null,
      metrics: metricsOf(workspace, dataset),
    };
  });

  const rows = [
    metricRow('volume', 'Volume ingested', 'reviews', 'neutral', projects, m => m.volume, plain),
    metricRow('analyzed', 'Classified', 'reviews', 'neutral', projects, m => m.analyzed, plain),
    metricRow('analyzedShare', 'Coverage', 'ratio', 'up', projects, m => m.analyzedShare, percent),
    metricRow('velocity', 'Review velocity', 'reviews/day', 'neutral', projects, m => m.velocity.perDay, plain),
    metricRow('momentum', 'Momentum (2nd half ÷ 1st half)', 'ratio', 'neutral', projects, m => m.velocity.momentum, plain),
    metricRow('nss', 'Net Sentiment Score', 'index', 'up', projects, m => m.nss, plain),
    metricRow('positiveShare', 'Positive', 'ratio', 'up', projects, m => m.positiveShare, percent),
    metricRow('neutralShare', 'Neutral', 'ratio', 'neutral', projects, m => m.neutralShare, percent),
    metricRow('negativeShare', 'Negative', 'ratio', 'down', projects, m => m.negativeShare, percent),
    metricRow('ingestedAverage', 'Avg rating (read)', 'stars', 'up', projects, m => m.ingestedAverage, plain),
    metricRow('oneStarIngested', '1★ share (read)', 'ratio', 'down', projects, m => m.oneStarIngested, percent),
    metricRow('oneStarStore', '1★ share (store)', 'ratio', 'down', projects, m => m.oneStarStore, percent),
    metricRow('storeRating', 'Store rating', 'stars', 'up', projects, m => m.storeRating, plain),
    metricRow('unclassified', 'Unclassified', 'reviews', 'down', projects, m => m.unclassified, plain),
  ];

  const painRows = painPointMatrix(projects);
  const leaderboard = projects
    .filter(project => Number.isFinite(project.metrics.nss))
    .sort((a, b) => b.metrics.nss - a.metrics.nss)
    .map((project, index, list) => ({
      rank: index + 1,
      id: project.id,
      label: project.label,
      nss: project.metrics.nss,
      gapToLeader: index === 0 ? 0 : round(project.metrics.nss - list[0].metrics.nss, 4),
      negativeShare: project.metrics.negativeShare,
      volume: project.metrics.volume,
      velocity: project.metrics.velocity.perDay,
    }));

  const withData = projects.filter(project => project.hasData);
  const missing = projects.filter(project => !project.hasData).map(project => project.id);

  return {
    action: 'compare',
    ok: true,
    version: COMPARE_VERSION,
    generatedAt,
    reference: { kind: 'median-across-selected', projects: withData.length },
    projects: projects.map(project => ({
      id: project.id,
      label: project.label,
      entity: project.entity,
      hasData: project.hasData,
      fetchedAt: project.fetchedAt,
      engine: project.metrics.engine,
      painVersion: project.metrics.painVersion,
      observedSpanDays: project.metrics.velocity.spanDays,
      peakDay: project.metrics.velocity.peak,
      store: project.metrics.store ? { channel: project.metrics.store.channel, reported: project.metrics.store.reported, total: project.metrics.store.total } : null,
      metrics: project.metrics,
    })),
    rows,
    painPoints: painRows.slice(0, PRESENTATION_ROWS),
    painPointTotal: painRows.length,
    painPointTrimmed: Math.max(0, painRows.length - PRESENTATION_ROWS),
    leaderboard,
    insights: insightsOf(projects, rows).slice(0, PRESENTATION_ROWS),
    caveats: [
      'Review velocity and momentum are measured on reviews this app actually read, not on the store total. Store pagination returns newest-first pages, so older periods can be under-represented.',
      '1★ share (read) and 1★ share (store) are different populations and are never combined into one number.',
      'An empty heatmap cell means the corpus engine did not report that phrase for that project. It is not a zero.',
      missing.length ? `${missing.length} selected project(s) have no stored snapshot yet and are excluded from every median.` : null,
    ].filter(Boolean),
  };
}
