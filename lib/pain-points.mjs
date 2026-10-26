// Lapisan kedua mesin korpus: frasa masalah, bukan kata tunggal. Sebuah frasa dianggap
// keluhan hanya kalau keberadaannya jauh lebih sering pada ulasan 1-2 bintang daripada pada
// ulasan 4-5 bintang, dan "jauh" itu diukur dari simpangan baku estimasinya sendiri.
//
// Tidak ada daftar frasa, tidak ada kategori prasetel, tidak ada kunci eksternal, dan — sejak
// versi ini — tidak ada ambang yang dipilih tangan. Panjang frasa, batas cekaman, dan jumlah
// keluaran semuanya dihitung dari korpus yang sedang dibuka.
//
// Aturan fidelitas yang dijaga modul ini:
//   1. setiap frasa keluaran adalah urutan token yang benar-benar bersebelahan di ulasan nyata;
//   2. seluruh baris diproses, tanpa sampel dan tanpa pemotongan panjang ulasan;
//   3. kandidat yang dibuang dihitung dan dilaporkan dengan alasannya, tidak dibuang diam-diam.
import { describe as describeParams, isSignal, logOdds, winsorLimit } from './corpus-params.mjs';

export const PAIN_VERSION = 'pain-phrase-v2';

// Pilihan struktural, bukan ambang analisis: 2 = definisi "frasa", 4 = batas praktis urutan
// kata yang masih merupakan satu ungkapan yang orang tulis, bukan potongan acak.
const MIN_PHRASE_TOKENS = 2;
const MAX_PHRASE_TOKENS = 4;
// Anggaran tampilan, bukan keputusan analisis: semua frasa yang lolos uji kemaknaan tetap
// dihitung dan dilaporkan lewat `metrics`, hanya daftarnya yang dipangkas supaya muat di
// satu panel dan satu berkas JSON.
const MAX_GROUPS = 10;
const MAX_ITEMS = 40;
const SEPARATOR = '␟';

const rate = value => (Number.isFinite(value) ? Number(value.toFixed(4)) : null);

const emptyOf = pools => ({
  version: PAIN_VERSION,
  status: 'insufficient',
  source: 'negative-cluster',
  pools,
  parameters: null,
  anchors: [],
  items: [],
  metrics: {
    candidatePhrases: 0,
    keptPhrases: 0,
    reportedPhrases: 0,
    matchedReviews: 0,
    groups: 0,
    reportedGroups: 0,
    droppedNotDistinct: 0,
    droppedWrongDirection: 0,
    droppedCovered: 0,
    droppedGroups: 0,
    trimmedItems: 0,
  },
});

function containsSequence(haystack, needle) {
  outer: for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function documentFrequencies(documents, stopwords, maxOrder) {
  const unigrams = new Map();
  const phrases = new Map();
  for (const document of documents) {
    const tokens = document.tokens;
    const seenPhrases = new Set();
    for (let start = 0; start < tokens.length; start += 1) {
      if (stopwords.has(tokens[start])) continue;
      for (let size = MIN_PHRASE_TOKENS; size <= maxOrder; size += 1) {
        const end = start + size;
        // Urutan token tidak selalu sepanjang yang dibutuhkan; berhenti, jangan memaksa.
        if (end > tokens.length) break;
        // Ujung frasa harus kata berisi makna, supaya "dari aplikasi" tidak menyamar
        // menjadi frasa berbeda dari "aplikasi".
        if (stopwords.has(tokens[end - 1])) continue;
        const key = tokens.slice(start, end).join(SEPARATOR);
        if (seenPhrases.has(key)) continue;
        seenPhrases.add(key);
        const current = phrases.get(key);
        if (current) current.count += 1;
        else phrases.set(key, { size, count: 1 });
      }
    }
    // Document frequency, bukan frekuensi token: satu ulasan yang mengulang kata yang sama
    // empat puluh kali tetap satu bukti.
    const seenUnigrams = new Set();
    for (const token of tokens) if (!stopwords.has(token)) seenUnigrams.add(token);
    for (const token of seenUnigrams) unigrams.set(token, (unigrams.get(token) || 0) + 1);
  }

  // Rekat bertambah per ordo: seberapa mungkin token terakhir muncul kalau prefiksnya sudah
  // muncul, rata-rata dan ditimbang kemunculannya. Naik terus berarti menambah panjang masih
  // bermakna; berhenti berarti ordo berikutnya hanya menghasilkan potongan yang kebetulan
  // bersebelahan.
  const ipmiWeight = new Map();
  const ipmiTotal = new Map();
  for (const [key, entry] of phrases) {
    const tokens = key.split(SEPARATOR);
    const prefixKey = tokens.slice(0, -1).join(SEPARATOR);
    const prefixCount = tokens.length > 2
      ? phrases.get(prefixKey)?.count
      : unigrams.get(tokens[0]);
    if (!prefixCount) continue;
    const conditional = Math.log2(entry.count / prefixCount);
    ipmiTotal.set(entry.size, (ipmiTotal.get(entry.size) || 0) + conditional * entry.count);
    ipmiWeight.set(entry.size, (ipmiWeight.get(entry.size) || 0) + entry.count);
  }
  const meanIncrementalByOrder = new Map();
  for (const [size, total] of ipmiTotal) meanIncrementalByOrder.set(size, total / ipmiWeight.get(size));

  return { unigrams, phrases, meanIncrementalByOrder };
}

function pickAnchor(tokens, stopwords, stats) {
  let anchor = null;
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    const entry = stats.get(token);
    if (!entry) continue;
    if (!anchor
      || entry.lift > anchor.lift
      || (entry.lift === anchor.lift && entry.dfNegative > anchor.dfNegative)
      || (entry.lift === anchor.lift && entry.dfNegative === anchor.dfNegative && token < anchor.term)) {
      anchor = { term: token, lift: entry.lift, dfNegative: entry.dfNegative };
    }
  }
  return anchor ? anchor.term : tokens.find(token => !stopwords.has(token)) || null;
}

export function derivePainPoints(documents, stopwords = new Set()) {
  const rows = Array.isArray(documents) ? documents : [];
  const pool = rows.filter(document => Array.isArray(document?.tokens) && document.tokens.length > 0);
  const negative = pool.filter(document => Number.isInteger(document.rating) && document.rating <= 2);
  const positive = pool.filter(document => Number.isInteger(document.rating) && document.rating >= 4);
  const pools = {
    reviews: rows.length,
    withText: pool.length,
    negative: negative.length,
    positive: positive.length,
    neutral: pool.filter(document => document.rating === 3).length,
    unrated: pool.filter(document => document.rating == null).length,
  };
  if (!negative.length || !positive.length) return emptyOf(pools);

  const negativeStats = documentFrequencies(negative, stopwords, MAX_PHRASE_TOKENS);
  const positiveStats = documentFrequencies(positive, stopwords, MAX_PHRASE_TOKENS);

  const unigramStats = new Map();
  for (const [term, dfNegative] of negativeStats.unigrams) {
    const dfPositive = positiveStats.unigrams.get(term) || 0;
    unigramStats.set(term, {
      term,
      dfNegative,
      dfPositive,
      lift: logOdds(dfNegative, dfPositive, negative.length, positive.length),
    });
  }

  const candidates = [];
  let droppedNotDistinct = 0;
  let droppedWrongDirection = 0;
  for (const [key, entry] of negativeStats.phrases) {
    const dfPositive = positiveStats.phrases.get(key)?.count || 0;
    const signal = isSignal(entry.count, dfPositive, negative.length, positive.length);
    if (!signal.significant) {
      // Bukan "terlalu jarang menurut angka tetap": bukti frasa ini tidak bisa dibedakan
      // dari nol pada korpus ini, karena simpangan baku estimasinya sendiri lebih besar.
      droppedNotDistinct += 1;
      continue;
    }
    if (signal.estimate <= 0) {
      // Makna tapi arahnya salah: lebih padat di pujian daripada di keluhan.
      droppedWrongDirection += 1;
      continue;
    }
    const tokens = key.split(SEPARATOR);
    candidates.push({
      key,
      tokens,
      text: tokens.join(' '),
      size: tokens.length,
      dfNegative: entry.count,
      dfPositive,
      share: entry.count / negative.length,
      praiseShare: dfPositive / positive.length,
      lift: signal.estimate,
      weight: 0,
      severity: 0,
      anchor: pickAnchor(tokens, stopwords, unigramStats),
    });
  }

  // Batas cekaman dari kuantil empirik bobot korpus ini, bukan dari angka ±4 tetap.
  const limit = winsorLimit(candidates.map(candidate => candidate.lift));
  for (const candidate of candidates) {
    candidate.severity = Math.min(limit, candidate.lift);
    candidate.weight = candidate.severity * Math.sqrt(candidate.dfNegative);
  }

  // Bobot lebih dulu; pada bobot yang setara frasa panjang dipertahankan lebih awal supaya
  // potongan pendeknya bisa diakui sebagai varian, bukan sebagai keluhan baru.
  candidates.sort((a, b) => b.weight - a.weight || b.size - a.size || b.dfNegative - a.dfNegative || a.text.localeCompare(b.text));

  const items = [];
  // Indeks frasa yang sudah diambil: document frequency → urutan bersebelahan yang lebih
  // pendek di dalamnya. Syarat "ter.cover" menuntut df persis sama DAN frasa yang lebih
  // panjang memuat frasa ini sebagai urutan yang benar-benar bersebelahan, jadi satu lookup
  // menjawabnya. Memindai seluruh frasa yang sudah diambil terbukti kuadratik: pada korpus
  // nyata 8.000 ulasan langkah ini sendiri memakan 90 detik dari 91 detik total.
  const keptByDf = new Map();
  let droppedCovered = 0;
  for (const candidate of candidates) {
    // Varian, bukan ambang: kalau sebuah frasa pendek tidak pernah muncul tanpa frasa panjang
    // yang sudah diambil (document frequency-nya persis sama), ia tidak membawa informasi baru.
    const covered = keptByDf.get(candidate.dfNegative)?.get(candidate.key);
    if (covered) {
      candidate.coveredBy = covered.text;
      droppedCovered += 1;
      continue;
    }
    items.push(candidate);
    let bucket = keptByDf.get(candidate.dfNegative);
    if (!bucket) {
      bucket = new Map();
      keptByDf.set(candidate.dfNegative, bucket);
    }
    for (let size = candidate.size - 1; size >= MIN_PHRASE_TOKENS; size -= 1) {
      for (let start = 0; start + size <= candidate.tokens.length; start += 1) {
        const slice = candidate.tokens.slice(start, start + size).join(SEPARATOR);
        if (!bucket.has(slice)) bucket.set(slice, candidate);
      }
    }
  }

  const groups = new Map();
  for (const item of items) {
    if (!item.anchor) continue;
    const stat = unigramStats.get(item.anchor);
    if (!groups.has(item.anchor)) {
      groups.set(item.anchor, {
        term: item.anchor,
        name: item.anchor,
        dfNegative: stat?.dfNegative ?? null,
        dfPositive: stat?.dfPositive ?? null,
        share: stat ? stat.dfNegative / negative.length : null,
        praiseShare: stat ? stat.dfPositive / positive.length : null,
        severity: stat ? Math.min(limit, Math.max(0, stat.lift)) : null,
        weight: stat ? Math.min(limit, Math.max(0, stat.lift)) * Math.sqrt(stat.dfNegative) : 0,
        phrases: [],
      });
    }
    groups.get(item.anchor).phrases.push(item);
  }

  const rankedGroups = [...groups.values()].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.term.localeCompare(b.term));
  // Pemangkasan di sini murni anggaran tampilan. Semua frasa yang lolos uji kemaknaan sudah
  // dihitung di atas dan jumlahnya dilaporkan lewat metrics, jadi tidak ada temuan yang
  // hilang diam-diam saat daftarnya dipotong.
  const anchors = rankedGroups.slice(0, MAX_GROUPS);
  const keptGroups = new Set(anchors.map(anchor => anchor.term));
  const groupedItems = items.filter(item => keptGroups.has(item.anchor));
  const keptItems = groupedItems.slice(0, MAX_ITEMS);
  const droppedGroups = Math.max(0, rankedGroups.length - anchors.length);
  const trimmedItems = Math.max(0, groupedItems.length - keptItems.length);

  const matched = new Set();
  for (const item of keptItems) {
    for (const document of negative) if (containsSequence(document.tokens, item.tokens)) matched.add(document.index);
  }

  if (!keptItems.length) {
    const base = emptyOf(pools);
    return {
      ...base,
      metrics: {
        ...base.metrics,
        candidatePhrases: negativeStats.phrases.size,
        droppedNotDistinct,
        droppedWrongDirection,
      },
    };
  }

  return {
    version: PAIN_VERSION,
    status: 'ready',
    source: 'negative-cluster',
    pools,
    parameters: {
      ...describeParams(),
      phraseTokens: [MIN_PHRASE_TOKENS, MAX_PHRASE_TOKENS],
      meanIncrementalByOrder: Object.fromEntries([...negativeStats.meanIncrementalByOrder].map(([size, value]) => [size, rate(value)])),
      severityLimit: Number.isFinite(limit) ? rate(limit) : null,
      significance: 'z>1 terhadap simpangan baku estimasi',
    },
    anchors: anchors.map(anchor => ({
      term: anchor.term,
      name: anchor.name,
      dfNegative: anchor.dfNegative,
      dfPositive: anchor.dfPositive,
      share: rate(anchor.share),
      praiseShare: rate(anchor.praiseShare),
      severity: rate(anchor.severity),
      weight: rate(anchor.weight),
      phraseCount: keptItems.filter(item => item.anchor === anchor.term).length,
    })),
    items: keptItems.map(item => ({
      id: item.text,
      text: item.text,
      tokens: item.tokens,
      size: item.size,
      anchor: item.anchor,
      dfNegative: item.dfNegative,
      dfPositive: item.dfPositive,
      share: rate(item.share),
      praiseShare: rate(item.praiseShare),
      severity: rate(item.severity),
      weight: rate(item.weight),
    })),
    metrics: {
      candidatePhrases: negativeStats.phrases.size,
      keptPhrases: items.length,
      reportedPhrases: keptItems.length,
      matchedReviews: matched.size,
      groups: groups.size,
      reportedGroups: anchors.length,
      droppedNotDistinct,
      droppedWrongDirection,
      droppedCovered,
      droppedGroups,
      trimmedItems,
    },
  };
}
