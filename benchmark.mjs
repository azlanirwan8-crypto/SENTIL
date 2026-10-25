// Perbandingan antar aplikasi yang dianalisis di ruang kerja ini, beserta jejak cara mesin
// membaca teks pada project aktif. Semua angka diturunkan dari baris yang benar-benar tersimpan;
// tidak ada aplikasi pembanding, kutipan, atau nilai contoh yang ditambahkan di sini.
import { summary, aspectStats, nssBand, nssMinSample, complaintGroups, classifierVersion, abstainThreshold, engineFacts } from './model.js';

const classifiedSentiments = new Set(['positive', 'negative', 'neutral']);
const gateName = status => status === 'relevant' ? 'Relevan' : status === 'uncertain' ? 'Perlu tinjauan konteks' : status === 'excluded' ? 'Di luar penilaian pelanggan' : 'Tanpa penyaringan';
const engineName = engine => engine === 'domain' ? 'Aturan domain' : engine === 'lexicon' ? 'Leksikon berbobot' : engine === 'neutral' ? 'Pola netral' : engine === 'relevance-gate' ? 'Penyaring relevansi' : engine === 'abstain' ? 'Abstain' : 'Tidak tercatat';
const relevanceOf = row => row.relevance?.status || 'relevant';

function tally(rows, pick) {
  const counts = new Map();
  for (const row of rows) {
    for (const key of [].concat(pick(row) || [])) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id)));
}

// Satu baris ringkas per project. NSS tetap memakai penyebut yang sama dengan dasbor:
// hanya teks yang benar-benar berlabel sentimen, bukan seluruh baris.
export function projectBenchmark(project, rows, activeId = null) {
  const list = Array.isArray(rows) ? rows : [];
  const s = summary(list);
  const negative = list.filter(row => row.sentiment === 'negative');
  const gate = { relevant: 0, uncertain: 0, excluded: 0 };
  for (const row of list) gate[relevanceOf(row)] = (gate[relevanceOf(row)] || 0) + 1;
  const topTopic = complaintGroups
    .map(group => ({ id: group.id, name: group.name, count: negative.filter(row => (row.complaintTags || row.tags || []).includes(group.id)).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] || null;
  const topAspect = aspectStats(list, 'negative').find(entry => entry.negative > 0) || null;
  return {
    id: project.id,
    name: project.name,
    entity: project.entity || project.name,
    stores: project.stores || 'identitas toko belum lengkap',
    active: project.id === activeId,
    lastPulledAt: project.lastPulledAt || null,
    total: s.total,
    classified: s.classified,
    unclassified: s.unclassified,
    positive: s.positive,
    negative: s.negative,
    neutral: s.neutral,
    positivePct: s.positivePct,
    negativePct: s.negativePct,
    neutralPct: s.neutralPct,
    nss: s.nss,
    band: nssBand(s.nss, s.classified)?.label || null,
    representative: s.classified >= nssMinSample,
    gate,
    abstainPct: s.total ? (s.unclassified / s.total) * 100 : null,
    topAspect: topAspect ? { id: topAspect.id, name: topAspect.name, negative: topAspect.negative } : null,
    topTopic: topTopic?.count ? topTopic : null,
  };
}

// "Otak analisis": komposisi mesin, gerbang relevansi, sebaran keyakinan aturan, aspek yang
// benar-benar dikenali, istilah bukti, dan beberapa tebakan terkuat. Contoh teks diambil utuh
// dari baris aktif, bukan dikarang, agar alasan mesin dapat diperiksa berdampingan dengan teks.
export function analysisBrain(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const s = summary(list);
  const classified = list.filter(row => classifiedSentiments.has(row.sentiment));
  const engines = tally(list, row => row.engine || 'Tidak tercatat').map(entry => ({
    id: entry.id, name: engineName(entry.id), total: entry.total,
    pct: list.length ? (entry.total / list.length) * 100 : null,
  }));
  const gate = tally(list, row => relevanceOf(row)).map(entry => ({
    id: entry.id, name: gateName(entry.id), total: entry.total,
    pct: list.length ? (entry.total / list.length) * 100 : null,
  }));
  const reasons = tally(
    list.filter(row => ['uncertain', 'excluded'].includes(relevanceOf(row))),
    row => row.relevance?.reason || 'Alasan tidak dicatat',
  ).slice(0, 4);
  const confidence = { high: 0, medium: 0, low: 0, unstated: 0 };
  for (const row of classified) {
    if (!Number.isFinite(row.confidence)) confidence.unstated += 1;
    else if (row.confidence >= 0.85) confidence.high += 1;
    else if (row.confidence >= 0.7) confidence.medium += 1;
    else confidence.low += 1;
  }
  const positiveEvidence = tally(
    list.filter(row => !row.relevance || row.relevance.status === 'relevant'),
    row => (Array.isArray(row.evidence?.positive) ? row.evidence.positive : []).map(term => String(term)),
  ).slice(0, 6);
  const negativeEvidence = tally(
    list.filter(row => !row.relevance || row.relevance.status === 'relevant'),
    row => (Array.isArray(row.evidence?.negative) ? row.evidence.negative : []).map(term => String(term)),
  ).slice(0, 6);
  const aspects = aspectStats(list, 'all')
    .filter(entry => entry.total > 0)
    .map(entry => ({ id: entry.id, name: entry.name, total: entry.total, positive: entry.positive, negative: entry.negative, neutral: entry.neutral, unclassified: entry.unclassified }));
  const eligible = list.filter(row => classifiedSentiments.has(row.sentiment) && relevanceOf(row) === 'relevant');
  const strongest = (sentiment, count) => eligible
    .filter(row => row.sentiment === sentiment)
    .sort((a, b) => Math.abs(Number(b.score) || 0) - Math.abs(Number(a.score) || 0))
    .slice(0, count);
  const samples = [...strongest('negative', 2), ...strongest('positive', 2)].map(row => ({
    platform: row.platform, id: row.id, author: row.author || 'N/A', date: row.date || null,
    text: row.text, sentiment: row.sentiment, engine: row.engine,
    engineName: engineName(row.engine), score: row.score, confidence: row.confidence,
    tags: Array.isArray(row.tags) ? row.tags : [], rationale: row.rationale || '',
  }));
  return {
    total: s.total, classified: s.classified, unclassified: s.unclassified,
    engines, gate, reasons, confidence, aspects,
    evidence: { positive: positiveEvidence, negative: negativeEvidence },
    samples,
    facts: {
      version: classifierVersion,
      abstainThreshold,
      ...engineFacts,
    },
  };
}

export function benchmarkOverview(projects, datasets, activeId = '') {
  const rowsFor = id => Array.isArray(datasets?.[id]?.reviews) ? datasets[id].reviews : [];
  const list = projects.map(project => projectBenchmark(project, rowsFor(project.id), activeId));
  return {
    activeProject: activeId || null,
    projects: list,
    withData: list.filter(project => project.total > 0).length,
    totalTexts: list.reduce((sum, project) => sum + project.total, 0),
    brain: activeId ? analysisBrain(rowsFor(activeId)) : null,
  };
}
