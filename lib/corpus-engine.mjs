// Mesin sentimen korpus tanpa kamus. Semua bobot kata dipelajari dari ulasan yang
// ditarik: kata yang lebih sering muncul pada rating 4-5 mendapat bobot positif, kata yang
// lebih sering muncul pada rating 1-2 mendapat bobot negatif. Rating hanya sinyal lemah;
// skor yang dihasilkan bukan probabilitas dan tidak diklaim sebagai akurasi luar sampel.
import { derivePainPoints } from './pain-points.mjs';
import { deriveSignals } from './insights.mjs';
import { describe as describeParams, isSignal, logOdds, winsorLimit } from './corpus-params.mjs';

export const ENGINE_VERSION = 'corpus-rating-v2';
// Lantai statistik, bukan keputusan analisis: token lebih pendek ini tidak bisa dimaknai dan
// pengecilan dukungan memakai konvensi yang dilaporkan lewat model.parameters.
const MIN_TOKEN_LENGTH = 3;
const SHRINKAGE = 2;
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
  const low = documents.filter(document => document.rating != null && document.rating <= 2);
  const high = documents.filter(document => document.rating != null && document.rating >= 4);
  const dfLow = new Map(), dfHigh = new Map();
  for (const document of low) for (const term of new Set(document.tokens)) dfLow.set(term, (dfLow.get(term) || 0) + 1);
  for (const document of high) for (const term of new Set(document.tokens)) dfHigh.set(term, (dfHigh.get(term) || 0) + 1);
  // Tidak ada fraksi frekuensi yang dipilih tangan dan tidak ada daftar kata. Sebuah istilah
  // dianggap beban kosakata hanya kalau bobotnya TIDAK bisa dibedakan dari nol pada korpus
  // ini: |log-odds| tidak melampaui simpangan bakunya sendiri. Uji yang sama menahan `tidak`
  // (z tinggi karena keluhan panjang) dan membuang `bantuan` (z rendah), tanpa angka ambang.
  const stopwords = new Set();
  const informative = new Set();
  for (const term of frequency.keys()) {
    const signal = isSignal(dfLow.get(term) || 0, dfHigh.get(term) || 0, low.length, high.length);
    if (signal.significant) informative.add(term);
    else stopwords.add(term);
  }
  const ordered = [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const removed = ordered.filter(([term]) => stopwords.has(term)).map(([term, count]) => ({ term, count }));
  return {
    frequency,
    vocabulary,
    informative,
    candidates: ordered.slice(0, 50).map(([term, count]) => ({ term, count })),
    stopwords,
    removed,
    protected: [],
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
  const weights = new Map();
  const raw = [];
  for (const [term, support] of dfAll) {
    const inLow = dfLow.get(term) || 0;
    const inHigh = dfHigh.get(term) || 0;
    if (!inLow && !inHigh) continue;
    // Penghalusan Jeffreys (0,5) lebih adil pada kelas yang tidak seimbang daripada +1:
    // kata yang hanya muncul di rating tinggi tidak otomatis menjadi negatif hanya karena
    // kelas rating tinggi memiliki lebih banyak dokumen.
    // Konvensi tanda mesin ini: positif = condong pujian. Karena logOdds() modul parameter
    // dihitung arah A terhadap B, kelas tinggi sengaja diletakkan sebagai A.
    const estimate = logOdds(inHigh, inLow, high.length, low.length);
    // Kata dengan dukungan tipis dikecilkan menuju nol agar satu ulasan kebetulan tidak
    // menjadi bukti sentimen yang ekstrem. Ini pengecilan statistik, bukan kamus.
    raw.push({ term, support, inLow, inHigh, shrunk: estimate * (support / (support + SHRINKAGE)) });
  }
  // Batas cekaman diambil dari sebaran bobot korpus itu sendiri, bukan dari angka ±4 tetap.
  const limit = winsorLimit(raw.map(entry => entry.shrunk));
  const entries = [];
  for (const item of raw) {
    const weight = Math.max(-limit, Math.min(limit, item.shrunk));
    if (Math.abs(weight) < 0.001) continue;
    weights.set(item.term, weight);
    entries.push({ term: item.term, weight, lowReviews: item.inLow, highReviews: item.inHigh, support: item.support });
  }
  return { weights, entries, low, high, mid, dfLow, dfHigh, weightLimit: limit };
}

function scoreTerms(uniqueTerms, weights) {
  const matched = uniqueTerms
    .map(term => ({ term, weight: weights.get(term) }))
    .filter(entry => Number.isFinite(entry.weight));
  if (!matched.length) return { score: null, matched };
  const score = matched.reduce((sum, entry) => sum + entry.weight, 0) / Math.sqrt(matched.length);
  return { score, matched };
}

// Topik keluhan diambil dari istilah yang dipakai toko saat menawarkan aplikasinya sendiri,
// lalu diukur pada ulasan. Sebuah istilah dianggap topik kalau memenuhi aturan bentuk yang
// seluruhnya dihitung dari teks sumber — tanpa daftar kata buatan:
//   1. istilah itu ada di teks daftar aplikasi (judul, ringkasan, deskripsi, kategori, rilis);
//   2. penulisannya seperti nama (huruf besar di tengah kalimat atau akronim kapital) ATAU
//      panjangnya enam huruf atau lebih — kata tugas Indonesia hampir selalu pendek;
//   3. istilah itu bukan bagian nama proyek itu sendiri ("merchant", "bca"), karena nama
//      produk menandai entitas, bukan fitur yang dikeluhkan; juga bukan bentuk berjulukan
//      ("...nya", "...pun", "...kah") yang hanya mengikat kata lain;
//   4. istilah itu muncul di setidaknya satu persen ulasan 1-2 bintang;
//   5. kalau penulisannya bukan seperti nama, pemakaiannya harus lebih sering di keluhan
//      daripada di pujian, supaya kata yang netral terhadap rating tidak menyamar jadi topik.
// Satu ulasan bisa menyebut beberapa fitur, jadi angkanya beririsan dan tiap topik melaporkan
// hitungannya sendiri.
// Batas lapisan topik TIDAK diturunkan dari kemaknaan statistik. Sudah diuji pada korpus
// nyata (32.610 ulasan Livin' by Mandiri) dan hasilnya lebih buruk, bukan lebih baik: ulasan
// 1-2 bintang rata-rata 11,1 token sedangkan 4-5 bintang 7,0, sehingga kata bantu membawa
// sinyal kelas yang nyata secara statistik. Kontrol strata panjang sudah dipasang dan tetap
// tidak memisahkan `dan`/`ini`/`yang` dari `blokir`/`sepihak`. Aturan bentuk di bawah ini
// proxy struktural yang jujur, bukan klaim "dipelajari dari korpus".
const MAX_TOPICS = 12;
const TOPIC_MIN_LOW_REVIEWS = 3;
const TOPIC_MIN_LOW_FRACTION = 0.01;
const TOPIC_CONTENT_LENGTH = 6;
const cliticPattern = /(?:nya|pun|kah)$/;
const wordPattern2 = /\p{L}[\p{L}'’-]+/gu;

function listingVocabulary(listing) {
  const text = String(listing || '');
  if (!text.trim()) return { terms: new Map(), names: new Set(), forms: new Map() };
  const forms = new Map();
  const terms = new Map();
  for (const word of text.match(wordPattern2) || []) {
    const token = normalizeToken(word);
    if (token.length < 3) continue;
    terms.set(token, (terms.get(token) || 0) + 1);
    if (!forms.has(token)) forms.set(token, new Map());
    const variants = forms.get(token);
    variants.set(word, (variants.get(word) || 0) + 1);
  }
  const names = new Set();
  for (const word of (text.match(/(?<=[^\n.!?;:]\s)[A-Z][\p{L}'’-]{1,24}/gu) || [])) {
    const token = normalizeToken(word);
    if (token.length >= 3) names.add(token);
  }
  for (const word of (text.replace(/&[a-z]+;/gi, ' ').match(/\b\p{Lu}{2,7}\b/gu) || [])) {
    const token = normalizeToken(word);
    if (token.length >= 2) names.add(token);
  }
  return { terms, names, forms };
}

function displayForm(forms, token, fallback) {
  const variants = forms.get(token);
  if (!variants || !variants.size) return fallback;
  return [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function deriveTopics(listing, entity, documents) {
  const { terms: listingCount, names, forms } = listingVocabulary(listing);
  if (!listingCount.size) return { topics: [], rowTopics: new Map(), allRowTerms: new Map(), termNames: new Map(), listingTerms: 0, lowPool: 0 };
  const identity = new Set(tokenize(String(entity || '')));
  const position = new Map();
  const vocabulary = [];
  for (const token of listingCount.keys()) {
    if (identity.has(token) || cliticPattern.test(token)) continue;
    const nameLike = names.has(token);
    if (!nameLike && token.length < TOPIC_CONTENT_LENGTH) continue;
    position.set(token, vocabulary.length);
    vocabulary.push(token);
  }
  if (!vocabulary.length) return { topics: [], rowTopics: new Map(), allRowTerms: new Map(), termNames: new Map(), listingTerms: listingCount.size, lowPool: 0 };

  const counts = vocabulary.map(() => ({ low: 0, mid: 0, high: 0, unrated: 0 }));
  let lowPool = 0;
  const seenByRow = [];
  for (const document of documents) {
    if (!document.tokens.length) continue;
    const seen = new Set();
    for (const token of document.tokens) {
      const slot = position.get(token);
      if (slot !== undefined) seen.add(slot);
    }
    const bucket = document.rating == null ? 'unrated' : document.rating <= 2 ? 'low' : document.rating === 3 ? 'mid' : 'high';
    for (const slot of seen) counts[slot][bucket] += 1;
    if (document.rating != null && document.rating <= 2) lowPool += 1;
    seenByRow.push({ index: document.index, slots: [...seen] });
  }

  const floor = Math.max(TOPIC_MIN_LOW_REVIEWS, Math.round(lowPool * TOPIC_MIN_LOW_FRACTION));
  const highPool = documents.length - lowPool;
  const topics = vocabulary
    .map((token, slot) => {
      const entry = counts[slot];
      const rated = entry.low + entry.mid + entry.high;
      const nameLike = names.has(token);
      const lowRate = lowPool ? entry.low / lowPool : 0;
      const highRate = highPool ? entry.high / highPool : 0;
      return {
        id: token,
        name: displayForm(forms, token, token),
        low: entry.low,
        mid: entry.mid,
        high: entry.high,
        unrated: entry.unrated,
        total: entry.low + entry.mid + entry.high + entry.unrated,
        listingMentions: listingCount.get(token) || 0,
        nameLike,
        share: lowPool ? Number(((entry.low / lowPool) * 100).toFixed(4)) : null,
        complaintRate: rated ? Number(((entry.low / rated) * 100).toFixed(4)) : null,
        eligible: entry.low >= floor && (nameLike || lowRate >= highRate),
      };
    })
    .filter(topic => topic.eligible)
    .map(({ eligible, ...topic }) => topic)
    .sort((a, b) => b.low - a.low || a.id.localeCompare(b.id))
    .slice(0, MAX_TOPICS);

  const kept = new Set(topics.map(topic => topic.id));
  const rowTopics = new Map();
  // Versi tanpa saring kelayakan: SEMUA istilah halaman toko yang muncul di sebuah ulasan.
  // Lapisan label memakainya untuk menguji "istilah toko ini lebih padat di gerombol keluhan
  // ini daripada di keluhan lain" — gerbang statistiknya uji kemaknaan itu sendiri, bukan
  // daftar topik yang sudah dipangkas untuk panel.
  const allRowTerms = new Map();
  const termNames = new Map(vocabulary.map(token => [token, displayForm(forms, token, token)]));
  for (const row of seenByRow) {
    const all = row.slots.map(slot => vocabulary[slot]);
    if (all.length) allRowTerms.set(row.index, all);
    const list = all.filter(token => kept.has(token));
    if (list.length) rowTopics.set(row.index, list);
  }
  return { topics, rowTopics, allRowTerms, termNames, listingTerms: listingCount.size, lowPool };
}

export function analyzeCorpus(reviews, { generatedAt = new Date().toISOString(), listing = '', entity = '' } = {}) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const documents = rows.map((review, index) => {
    const tokens = tokenize(review.text);
    return { index, review, tokens, rating: Number.isInteger(review.rating) ? review.rating : null, unique: [] };
  });
  const withText = documents.filter(document => document.tokens.length > 0);
  const stopwordData = buildStopwords(withText);
  // PENTING: daftar "beban kosakata" TIDAK memangkas fitur skoring. Bobot yang tidak bisa
  // dibedakan dari nol sudah otomatis menambah hampir nol, jadi memangkasnya hanya membuat
  // korpus kecil kehilangan seluruh bukti dan berhenti mengklasifikasi sama sekali. Daftar
  // ini tetap dipakai sebagai batas ujung frasa di lapisan pain-point.
  for (const document of documents) {
    document.unique = [...new Set(document.tokens)];
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
  // Pita netralnya adalah jarak tipikal ulasan 3 bintang ke titik batas. Kalau korpus tidak
  // punya ulasan 3 bintang, tidak ada pita netral yang bisa diklaim — bukan angka cadangan.
  const fromMid = midScores.length ? median(midScores.map(score => Math.abs(score - threshold))) : null;
  const margin = available ? (fromMid ?? 0) : 0;

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0, unclassified: 0 };
  // Topik dihitung lebih dulu supaya namanya bisa ditempel ke setiap baris; tanpa itu daftar
  // ulasan tidak bisa disaring per fitur seperti pada laporan insiden.
  const topicData = deriveTopics(listing, entity, documents);
  // Frasa masalah memakai daftar stop kata yang sudah dipelajari di atas, jadi batas
  // "kata struktur" tetap satu sumber keputusan untuk seluruh mesin.
  const pain = derivePainPoints(documents, stopwordData.stopwords, {
    listingTerms: topicData.allRowTerms,
    listingNames: topicData.termNames,
  });
  const platformMap = new Map();
  const dailyMap = new Map();
  let undated = 0;
  let topicRows = 0;
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
    const topics = topicData.rowTopics.get(document.index) || [];
    if (topics.length) topicRows += 1;
    return {
      ...review,
      analysis: {
        sentiment,
        score: result.score == null ? null : Number(result.score.toFixed(4)),
        matchedTerms,
        topics,
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
      // Rincian per bintang dari ulasan yang benar-benar terbaca (indeks 0 = 1★). Dibutuhkan
      // matriks perbandingan lintas project; histogram toko dilaporkan terpisah, tidak digabung.
      ratingBreakdown: [1, 2, 3, 4, 5].map(star => rows.filter(review => review.rating === star).length),
      topicReviews: topicRows,
      undated,
    },
    labels: sentimentCounts,
    nss: nss == null ? null : Number(nss.toFixed(4)),
    metrics: {
      vocabulary: stopwordData.vocabulary,
      informativeTerms: stopwordData.informative.size,
      nonInformativeTerms: stopwordData.stopwords.size,
      stopwordsRemoved: stopwordData.removed.length,
      learnedTerms: learned.weights.size,
      topicListingTerms: topicData.listingTerms,
      topicCount: topicData.topics.length,
      learnedTermsSupport2: learned.entries.filter(entry => entry.support >= 2).length,
      smoothing: 'jeffreys-0.5',
      supportShrinkage: SHRINKAGE,
      weightLimit: Number.isFinite(learned.weightLimit) ? Number(learned.weightLimit.toFixed(4)) : null,
      lowMedian: lowMedian == null ? null : Number(lowMedian.toFixed(4)),
      highMedian: highMedian == null ? null : Number(highMedian.toFixed(4)),
      threshold: available ? Number(threshold.toFixed(4)) : null,
      neutralMargin: available ? Number(margin.toFixed(4)) : null,
      separation: separation == null ? null : Number(separation.toFixed(4)),
      inSampleAuc: available ? rankAuc(highScores, lowScores) : null,
    },
    // Setiap angka yang menggerakkan keputusan analisis, plus asal-usulnya, supaya pembaca
    // bisa memisahkan mana yang diukur dari korpus dan mana yang konvensi statistik.
    parameters: {
      ...describeParams(),
      shrinkage: SHRINKAGE,
      weightLimit: Number.isFinite(learned.weightLimit) ? Number(learned.weightLimit.toFixed(4)) : null,
      phraseTokens: pain.parameters?.phraseTokens || null,
      severityLimit: pain.parameters?.severityLimit ?? null,
      topicKeep: topicData.topics.length,
    },
    terms: {
      positive: positiveTerms,
      negative: negativeTerms,
      stopwords: stopwordData.removed.slice(0, 20),
      protectedStopwords: [],
    },
    topics: topicData.topics,
    topicSource: topicData.topics.length ? 'store-listing' : null,
    painPoints: pain,
    // Sinyal ditulis terakhir karena lapisan ini membaca angka yang sudah jadi: label, rincian
    // kanal tiap label, dan cakupan klasifikasi. Tidak ada satu pun kalimatnya yang ditulis
    // tangan — tiap baris adalah hasil ukur yang lolos uji kemaknaan.
    signals: null,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    platforms: [...platformMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  model.signals = deriveSignals(model);
  return { rows: enriched, model };
}
