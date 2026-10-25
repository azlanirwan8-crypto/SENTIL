// Mesin sentimen korpus tanpa kamus. Semua bobot kata dipelajari dari ulasan yang
// ditarik: kata yang lebih sering muncul pada rating 4-5 mendapat bobot positif, kata yang
// lebih sering muncul pada rating 1-2 mendapat bobot negatif. Rating hanya sinyal lemah;
// skor yang dihasilkan bukan probabilitas dan tidak diklaim sebagai akurasi luar sampel.
export const ENGINE_VERSION = 'corpus-rating-v1';
export const STOPWORD_FRACTION = 0.02;
const MIN_TOKEN_LENGTH = 3;
const MAX_CLUSTER_TERMS = 36;
const MAX_CLUSTERS = 12;

const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ');
}

export function normalizeToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Karakter yang diulang tiga kali atau lebih direduksi: "ngelaggggg" -> "ngelag",
    // "mantaaap" -> "mantap". Dua huruf yang sama tetap dipertahankan.
    .replace(/(.)\1{2,}/gu, '$1')
    // Kata yang terduplikasi utuh juga direduksi tanpa memerlukan kamus.
    .replace(/^(.{2,12})\1+$/u, '$1')
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(value) {
  const tokens = normalizeText(value).match(wordPattern) || [];
  return tokens
    .map(normalizeToken)
    .filter(token => token.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(token));
}

const median = values => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
};

const quantile = (values, fraction) => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  return list[Math.min(list.length - 1, Math.max(0, Math.floor((list.length - 1) * fraction)))];
};

function rankAuc(highScores, lowScores) {
  if (!highScores.length || !lowScores.length) return null;
  const rows = [
    ...lowScores.map(score => ({ score, positive: 0 })),
    ...highScores.map(score => ({ score, positive: 1 })),
  ].sort((a, b) => a.score - b.score);
  let rank = 0;
  let highRankSum = 0;
  for (let index = 0; index < rows.length;) {
    let end = index + 1;
    while (end < rows.length && rows[end].score === rows[index].score) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      rank += 1;
      if (rows[cursor].positive) highRankSum += averageRank;
    }
    index = end;
  }
  const high = highScores.length;
  const low = lowScores.length;
  return (highRankSum - (high * (high + 1)) / 2) / (high * low);
}

const reviewDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = value.slice(0, 10);
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
};

function dateOf(review) {
  return reviewDate(review.date) || reviewDate(review.publishedAt);
}

function buildStopwords(documents) {
  const frequency = new Map();
  for (const document of documents) {
    for (const token of document.tokens) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const vocabulary = frequency.size;
  const removeCount = Math.floor(vocabulary * STOPWORD_FRACTION);
  const ordered = [...frequency]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, removeCount)
    .map(([term, count]) => ({ term, count }));
  // Kata paling sering biasanya kata struktur, tetapi tidak selalu: pada korpus keluhan,
  // "tidak" dan "lama" justru bisa menjadi sinyal paling kuat. Kandidat 2% tetap dihitung
  // dari frekuensi; kandidat yang terbukti sangat berbeda antar kelas rating dipertahankan
  // sebagai fitur. Keputusan ini juga dipelajari dari korpus, bukan dari kamus.
  const low = documents.filter(document => document.rating != null && document.rating <= 2);
  const high = documents.filter(document => document.rating != null && document.rating >= 4);
  const dfLow = new Map(), dfHigh = new Map();
  for (const document of low) for (const term of new Set(document.tokens)) dfLow.set(term, (dfLow.get(term) || 0) + 1);
  for (const document of high) for (const term of new Set(document.tokens)) dfHigh.set(term, (dfHigh.get(term) || 0) + 1);
  const protectedTerms = [];
  const stopwords = new Set();
  for (const entry of ordered) {
    const inLow = dfLow.get(entry.term) || 0;
    const inHigh = dfHigh.get(entry.term) || 0;
    const signal = low.length && high.length
      ? Math.abs(Math.log(((inHigh + 0.5) / (high.length + 1)) / ((inLow + 0.5) / (low.length + 1))))
      : 0;
    if (entry.count >= 3 && signal >= 1.2) {
      protectedTerms.push({ ...entry, lowReviews: inLow, highReviews: inHigh, signal: Number(signal.toFixed(4)) });
      continue;
    }
    stopwords.add(entry.term);
  }
  return {
    frequency,
    vocabulary,
    candidates: ordered,
    stopwords,
    removed: ordered.filter(entry => stopwords.has(entry.term)),
    protected: protectedTerms,
  };
}

function learnWeights(documents) {
  const low = documents.filter(document => document.rating != null && document.rating <= 2);
  const high = documents.filter(document => document.rating != null && document.rating >= 4);
  const mid = documents.filter(document => document.rating === 3);
  const dfLow = new Map(), dfHigh = new Map(), dfAll = new Map();
  for (const document of low) for (const term of document.unique) dfLow.set(term, (dfLow.get(term) || 0) + 1);
  for (const document of high) for (const term of document.unique) dfHigh.set(term, (dfHigh.get(term) || 0) + 1);
  for (const document of documents) for (const term of document.unique) dfAll.set(term, (dfAll.get(term) || 0) + 1);
  const minSupport = 1;
  const weights = new Map();
  const entries = [];
  for (const [term, support] of dfAll) {
    if (support < minSupport) continue;
    const inLow = dfLow.get(term) || 0;
    const inHigh = dfHigh.get(term) || 0;
    if (!inLow && !inHigh) continue;
    // Penghalusan Jeffreys (0,5) lebih adil pada kelas yang tidak seimbang daripada +1:
    // kata yang hanya muncul di rating tinggi tidak otomatis menjadi negatif hanya karena
    // kelas rating tinggi memiliki lebih banyak dokumen.
    const pLow = (inLow + 0.5) / (low.length + 1);
    const pHigh = (inHigh + 0.5) / (high.length + 1);
    const raw = Math.log(pHigh / pLow);
    // Kata dengan dukungan tipis dikecilkan menuju nol agar satu ulasan kebetulan tidak
    // menjadi bukti sentimen yang ekstrem. Ini pengecilan statistik, bukan kamus.
    const confidence = support / (support + 2);
    const weight = Math.max(-4, Math.min(4, raw * confidence));
    if (Math.abs(weight) < 0.001) continue;
    weights.set(term, weight);
    entries.push({ term, weight, lowReviews: inLow, highReviews: inHigh, support });
  }
  return { weights, entries, low, high, mid, dfLow, dfHigh };
}

function scoreTerms(uniqueTerms, weights) {
  const matched = uniqueTerms
    .map(term => ({ term, weight: weights.get(term) }))
    .filter(entry => Number.isFinite(entry.weight));
  if (!matched.length) return { score: null, matched };
  const score = matched.reduce((sum, entry) => sum + entry.weight, 0) / Math.sqrt(matched.length);
  return { score, matched };
}

function clusterPainPoints(lowDocuments, stopwords, weights) {
  const reviewsWithText = lowDocuments.filter(document => document.unique.length);
  if (!reviewsWithText.length) return { clusters: [], terms: [] };
  const df = new Map();
  for (const document of reviewsWithText) {
    for (const term of document.unique) df.set(term, (df.get(term) || 0) + 1);
  }
  const minSupport = reviewsWithText.length >= 12 ? 2 : 1;
  const negative = [...df]
    .filter(([term, support]) => !stopwords.has(term) && support >= minSupport && (weights.get(term) ?? 0) < -0.1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CLUSTER_TERMS)
    .map(([term]) => term);
  // Bila korpus sangat kecil sehingga belum ada kata berlabel negatif yang cukup,
  // istilah paling sering pada ulasan 1-2 bintang tetap ditampilkan apa adanya.
  const terms = negative.length >= 3
    ? negative
    : [...df]
      .filter(([term, support]) => !stopwords.has(term) && support >= Math.max(1, minSupport))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_CLUSTER_TERMS)
      .map(([term]) => term);
  if (!terms.length) return { clusters: [], terms: [] };
  const reviewSets = new Map(terms.map(term => [term, new Set(reviewsWithText
    .map((document, index) => (document.unique.includes(term) ? index : -1))
    .filter(index => index >= 0))]));
  const minShared = reviewsWithText.length >= 12 ? 2 : 1;
  const similarities = [];
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const a = reviewSets.get(terms[i]);
      const b = reviewSets.get(terms[j]);
      let shared = 0;
      for (const value of a) if (b.has(value)) shared += 1;
      if (shared >= minShared) similarities.push(shared / (a.size + b.size - shared));
    }
  }
  // Ambang dari sebaran korpus sendiri; klaster dibentuk bintang di sekitar istilah
  // paling sering (satu hop), bukan rantai transitif yang bisa menelan seluruh korpus.
  const threshold = Math.min(0.6, Math.max(0.3, quantile(similarities, 0.35) ?? 0.33));
  const ordered = [...terms].sort((a, b) => (df.get(b) || 0) - (df.get(a) || 0) || a.localeCompare(b));
  const assigned = new Set();
  const groups = [];
  for (const anchor of ordered) {
    if (assigned.has(anchor)) continue;
    const group = [anchor];
    assigned.add(anchor);
    for (const other of ordered) {
      if (assigned.has(other)) continue;
      const a = reviewSets.get(anchor);
      const b = reviewSets.get(other);
      let shared = 0;
      for (const value of a) if (b.has(value)) shared += 1;
      if (shared < minShared) continue;
      const similarity = shared / (a.size + b.size - shared);
      if (similarity >= threshold) {
        group.push(other);
        assigned.add(other);
      }
    }
    const documentIndexes = new Set();
    for (const term of group) for (const index of reviewSets.get(term)) documentIndexes.add(index);
    const orderedTerms = [...group].sort((a, b) => (df.get(b) || 0) - (df.get(a) || 0) || a.localeCompare(b));
    groups.push({
      id: orderedTerms[0],
      name: orderedTerms.slice(0, 2).join(' · '),
      terms: orderedTerms,
      count: documentIndexes.size,
      share: reviewsWithText.length ? (documentIndexes.size / reviewsWithText.length) * 100 : null,
      frequency: orderedTerms.reduce((sum, term) => sum + (df.get(term) || 0), 0),
      threshold: Number(threshold.toFixed(4)),
    });
  }
  groups.sort((a, b) => b.count - a.count || b.terms.length - a.terms.length || a.name.localeCompare(b.name));
  return { clusters: groups.slice(0, MAX_CLUSTERS), terms: terms.map(term => ({ term, reviews: df.get(term) })) };
}

export function analyzeCorpus(reviews, { generatedAt = new Date().toISOString() } = {}) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const documents = rows.map((review, index) => {
    const tokens = tokenize(review.text);
    return { index, review, tokens, rating: Number.isInteger(review.rating) ? review.rating : null, unique: [] };
  });
  const withText = documents.filter(document => document.tokens.length > 0);
  const stopwordData = buildStopwords(withText);
  for (const document of documents) {
    document.unique = [...new Set(document.tokens.filter(token => !stopwordData.stopwords.has(token)))];
  }
  const learned = learnWeights(documents.filter(document => document.unique.length));
  const low = learned.low, high = learned.high, mid = learned.mid;
  const lowScores = [], highScores = [], midScores = [];
  for (const document of low) { const result = scoreTerms(document.unique, learned.weights); if (result.score != null) lowScores.push(result.score); }
  for (const document of high) { const result = scoreTerms(document.unique, learned.weights); if (result.score != null) highScores.push(result.score); }
  for (const document of mid) { const result = scoreTerms(document.unique, learned.weights); if (result.score != null) midScores.push(result.score); }
  const lowMedian = median(lowScores);
  const highMedian = median(highScores);
  const available = low.length > 0 && high.length > 0 && learned.weights.size > 0
    && lowScores.length > 0 && highScores.length > 0;
  const separation = available ? highMedian - lowMedian : null;
  const threshold = available ? (lowMedian + highMedian) / 2 : 0;
  const gap = separation == null ? 1 : Math.abs(separation);
  const fromMid = midScores.length >= 3 ? median(midScores.map(score => Math.abs(score - threshold))) : null;
  const margin = available ? Math.min(gap * 0.4, Math.max(gap * 0.05, fromMid ?? gap * 0.1)) : 0;

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0, unclassified: 0 };
  const platformMap = new Map();
  const dailyMap = new Map();
  let undated = 0;
  const enriched = documents.map(document => {
    const { review } = document;
    const result = available ? scoreTerms(document.unique, learned.weights) : { score: null, matched: [] };
    let sentiment = 'unclassified';
    if (result.score != null) {
      if (result.score > threshold + margin) sentiment = 'positive';
      else if (result.score < threshold - margin) sentiment = 'negative';
      else sentiment = 'neutral';
    }
    sentimentCounts[sentiment] += 1;
    const platform = String(review.platform || 'unknown');
    if (!platformMap.has(platform)) platformMap.set(platform, { id: platform, total: 0, positive: 0, negative: 0, neutral: 0, unclassified: 0 });
    const platformRow = platformMap.get(platform);
    platformRow.total += 1;
    platformRow[sentiment] += 1;
    const day = dateOf(review);
    if (day) {
      if (!dailyMap.has(day)) dailyMap.set(day, { date: day, total: 0, positive: 0, negative: 0, neutral: 0, unclassified: 0 });
      const dailyRow = dailyMap.get(day);
      dailyRow.total += 1;
      dailyRow[sentiment] += 1;
    } else undated += 1;
    const matchedTerms = [...result.matched]
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.term.localeCompare(b.term))
      .slice(0, 6)
      .map(entry => ({ term: entry.term, weight: entry.weight }));
    return {
      ...review,
      analysis: {
        sentiment,
        score: result.score == null ? null : Number(result.score.toFixed(4)),
        matchedTerms,
      },
    };
  });
  const analyzed = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
  const nss = analyzed ? ((sentimentCounts.positive - sentimentCounts.negative) / analyzed) * 100 : null;
  const termEntries = learned.entries.filter(entry => entry.term && !stopwordData.stopwords.has(entry.term));
  const positiveTerms = termEntries.filter(entry => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.support - a.support || a.term.localeCompare(b.term))
    .slice(0, 12);
  const negativeTerms = termEntries.filter(entry => entry.weight < 0)
    .sort((a, b) => a.weight - b.weight || b.support - a.support || a.term.localeCompare(b.term))
    .slice(0, 12);
  const pain = clusterPainPoints(documents.filter(document => document.rating != null && document.rating <= 2), stopwordData.stopwords, learned.weights);
  const model = {
    version: ENGINE_VERSION,
    generatedAt,
    status: available ? 'ready' : 'insufficient',
    coverage: {
      reviews: rows.length,
      withText: withText.length,
      withoutText: rows.length - withText.length,
      analyzed,
      unclassified: rows.length - analyzed,
      lowRatings: low.length,
      highRatings: high.length,
      midRatings: mid.length,
      ratedReviews: rows.filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5).length,
      undated,
    },
    labels: sentimentCounts,
    nss: nss == null ? null : Number(nss.toFixed(4)),
    metrics: {
      stopwordFraction: STOPWORD_FRACTION,
      vocabulary: stopwordData.vocabulary,
      stopwordCandidates: stopwordData.candidates.length,
      stopwordsRemoved: stopwordData.removed.length,
      protectedSignalTerms: stopwordData.protected.length,
      learnedTerms: learned.weights.size,
      learnedTermsSupport2: learned.entries.filter(entry => entry.support >= 2).length,
      minSupport: 1,
      smoothing: 'jeffreys-0.5',
      supportShrinkage: 2,
      lowMedian: lowMedian == null ? null : Number(lowMedian.toFixed(4)),
      highMedian: highMedian == null ? null : Number(highMedian.toFixed(4)),
      threshold: available ? Number(threshold.toFixed(4)) : null,
      neutralMargin: available ? Number(margin.toFixed(4)) : null,
      separation: separation == null ? null : Number(separation.toFixed(4)),
      inSampleAuc: available ? rankAuc(highScores, lowScores) : null,
    },
    terms: {
      positive: positiveTerms,
      negative: negativeTerms,
      stopwords: stopwordData.removed.slice(0, 20),
      protectedStopwords: stopwordData.protected,
    },
    clusters: pain.clusters,
    clusterTerms: pain.terms,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    platforms: [...platformMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return { rows: enriched, model };
}
