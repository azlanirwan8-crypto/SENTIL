// Lapisan ketiga: gerombol frasa menjadi label, lalu diberi nama dari istilah korpus sendiri.
// Tidak ada satu pun nama yang ditulis tangan dan tidak ada model bahasa yang memilihkan nama:
// nama label adalah kata yang benar-benar ditulis reviewers di ulasan 1-2★, dan dua frasa
// digabung hanya kalau jumlah ulasan yang memuat keduanya lebih besar daripada yang bisa
// dijelaskan oleh kebetulan.
//
// Empat aturan yang membuat tabel label tidak bisa mengarang dan tetap terbaca seperti laporan
// analis profesional:
//   1. dukungan sebuah label dihitung dari union ulasan, bukan dari jumlah frasa anggotanya —
//      satu ulasan yang menyebut tiga keluhan tetap satu ulasan, bukan tiga temuan;
//   2. ikatan antar frasa diuji dengan konvensi kemaknaan yang sudah dipakai lapisan frasa dan
//      topik di proyek ini: proporsi satu sampel, smoothing Jeffreys α=0,5, z>1 dua arah;
//   3. nama label adalah kata jangkar yang dijagokan lebih dari satu anggota gerombol — istilah
//      paling membedakan di dalam tiap frasa, yang sudah dihitung lapisan frasa dari statistik
//      korpus — jadi headline-nya pendek seperti laporan analis, sementara kalimat asli
//      reviewers tetap utuh sebagai bukti di bawahnya;
//   4. arah label dihitung dari rentang tanggal yang benar-benar terbaca (paruh kedua terhadap
//      paruh pertama), konvensi yang sama dengan momentum di matriks perbandingan.
// Tidak ada ambang yang dipilih tangan. Satu-satunya angka tetap adalah "lebih dari satu
// ulasan", yang merupakan definisi bukti — sama seperti "dua kata" adalah definisi frasa.
const rate = value => (Number.isFinite(value) ? Number(value.toFixed(4)) : null);
const DAY_MS = 86_400_000;

// Bukti minimal bahwa dua frasa benar-benar muncul bersama: satu ulasan yang memuat keduanya
// masih bisa kebetulan kosakata orang itu sendiri, jadi diperlukan lebih dari satu ulasan.
const MIN_SHARED_REVIEWS = 2;
// Anggaran tampilan, sama seperti lapisan frasa: gerombol yang tidak ditampilkan tetap
// dilaporkan lewat metrics, tidak hilang diam-diam.
const MAX_LABELS = 12;

const RULES = {
  link: 'dua frasa digabung hanya kalau ulasan yang memuat keduanya lebih banyak daripada yang bisa dijelaskan kebetulan',
  support: 'dukungan label = union ulasan berbeda, bukan penjumlahan frasa anggotanya',
  naming: 'nama = kata jangkar yang dijagokan lebih dari satu anggota gerombol; kalau tidak ada, frasa terberat dipakai apa adanya',
  trend: 'arah = paruh kedua terhadap paruh pertama dari rentang tanggal yang teramati',
  sharedReviews: MIN_SHARED_REVIEWS,
  maxLabels: MAX_LABELS,
};

// z untuk "co dari dfA ulasan memuat juga frasa B", dengan latar bebas dfB/N.
function associationZ(co, dfA, dfB, total) {
  if (!(dfA > 0) || !(total > 0)) return 0;
  const baseline = (dfB + 0.5) / (total + 1);
  const se = Math.sqrt(baseline * (1 - baseline) / (dfA + 1));
  if (!(se > 0)) return 0;
  return (co / dfA - baseline) / se;
}

function invert(hits) {
  const byReview = new Map();
  for (const [text, indexes] of hits) {
    for (const index of indexes) {
      const list = byReview.get(index);
      if (list) list.push(text);
      else byReview.set(index, [text]);
    }
  }
  return byReview;
}

function unionAll(sets) {
  const out = new Set();
  for (const set of sets) for (const value of set) out.add(value);
  return out;
}

// Rentang waktu diambil dari tanggal yang benar-benar terbaca; titik belahnya adalah tengah
// rentang itu sendiri, jadi tidak ada jendela harian yang harus dipilih.
function rangeOf(days) {
  let first = null;
  let last = null;
  let dated = 0;
  for (const day of days.values()) {
    if (typeof day !== 'string' || !day) continue;
    dated += 1;
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;
  }
  if (!first) return null;
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || lastMs < firstMs) return null;
  const midpoint = firstMs + (lastMs - firstMs) / 2;
  return {
    firstDay: first,
    lastDay: last,
    dated,
    midpoint,
    earlyDays: Math.max(1, Math.round((midpoint - firstMs) / DAY_MS) + 1),
    lateDays: Math.max(1, Math.round((lastMs - midpoint) / DAY_MS)),
  };
}

function trendOf(reviews, days, range) {
  if (!range) return { early: null, late: null, undated: null, momentum: null };
  let early = 0;
  let late = 0;
  let undated = 0;
  for (const index of reviews) {
    const day = days.get(index);
    if (typeof day !== 'string' || !day) { undated += 1; continue; }
    if (Date.parse(`${day}T00:00:00Z`) <= range.midpoint) early += 1;
    else late += 1;
  }
  const earlyPerDay = early / range.earlyDays;
  const latePerDay = late / range.lateDays;
  return {
    early,
    late,
    undated,
    momentum: earlyPerDay > 0 ? rate(latePerDay / earlyPerDay) : null,
  };
}

// Nama diambil dari kata jangkar anggota gerombol — istilah paling membedakan di dalam tiap
// frasa, yang sudah dihitung lapisan frasa dari statistik korpus. Urutan keputusannya: berapa
// anggota menjagokan istilah itu, lalu total bobotnya, lalu dukungan ulasannya, lalu alfabet.
function dominantTerm(members) {
  const tally = new Map();
  for (const item of members) {
    if (!item.anchor) continue;
    const entry = tally.get(item.anchor) || { term: item.anchor, members: 0, weightSum: 0, dfNegative: 0 };
    entry.members += 1;
    entry.weightSum += Math.abs(item.weight || 0);
    entry.dfNegative += item.dfNegative || 0;
    tally.set(item.anchor, entry);
  }
  let best = null;
  for (const entry of tally.values()) {
    if (!best
      || entry.members > best.members
      || (entry.members === best.members && entry.weightSum > best.weightSum)
      || (entry.members === best.members && entry.weightSum === best.weightSum && entry.dfNegative > best.dfNegative)
      || (entry.members === best.members
        && entry.weightSum === best.weightSum
        && entry.dfNegative === best.dfNegative
        && entry.term < best.term)) {
      best = entry;
    }
  }
  // Satu kata hanya boleh dijadikan nama kalau lebih dari satu anggota menjagokannya; tanpa
  // itu, tidak ada dasar untuk memendekkan kalimat reviewers menjadi satu istilah.
  return best && best.members > 1 ? best.term : null;
}

export function clusterPainPhrases({
  items = [],
  negativeHits = new Map(),
  positiveHits = new Map(),
  negativeCount = 0,
  positiveCount = 0,
  days = new Map(),
  maxLabels = MAX_LABELS,
} = {}) {
  const phrases = items.filter(item => negativeHits.has(item.text));
  const empty = {
    version: 'pain-label-v2',
    rules: RULES,
    labels: [],
    metrics: {
      phrases: phrases.length,
      links: 0,
      clusters: 0,
      reportedLabels: 0,
      trimmedLabels: 0,
      singletons: phrases.length,
      namedFromTerm: 0,
      trend: null,
    },
  };
  // Satu frasa tetap layak jadi label (gerombol beranggota satu); yang tidak bisa diproses
  // hanyalah korpus tanpa frasa atau tanpa ulasan 1-2★.
  if (!phrases.length || !(negativeCount > 0)) return empty;

  const range = rangeOf(days);
  const dfOf = new Map(phrases.map(item => [item.text, item.dfNegative]));
  const parent = new Map(phrases.map(item => [item.text, item.text]));
  const rootOf = text => {
    let root = text;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = text;
    while (cursor !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  // Ko-occurrence dihitung dari daftar frasa per ulasan, jadi biayanya mengikuti jumlah frasa
  // yang benar-benar berbagi satu ulasan — bukan kuadratik terhadap pasangan frasa.
  const pairCo = new Map();
  for (const list of invert(negativeHits).values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort();
    for (let a = 0; a < sorted.length; a += 1) {
      for (let b = a + 1; b < sorted.length; b += 1) {
        const key = `${sorted[a]}|${sorted[b]}`;
        pairCo.set(key, (pairCo.get(key) || 0) + 1);
      }
    }
  }

  let links = 0;
  for (const [key, co] of pairCo) {
    if (co < MIN_SHARED_REVIEWS) continue;
    const [left, right] = key.split('|');
    const dfLeft = dfOf.get(left) || 0;
    const dfRight = dfOf.get(right) || 0;
    // Diuji dua arah: "melihat A membuat B lebih mungkin" DAN sebaliknya. Pada dua korpus nyata
    // (73 dan 33.600 ulasan) aturan dua-arah ini menghasilkan keluaran yang identik dengan
    // aturan satu-arah — setiap ikatan yang lolos memang lolos dari kedua sisi — jadi arah yang
    // lebih ketat dipakai tanpa kehilangan apa pun.
    const z = Math.min(associationZ(co, dfLeft, dfRight, negativeCount), associationZ(co, dfRight, dfLeft, negativeCount));
    if (!(z > 1)) continue;
    const rootLeft = rootOf(left);
    const rootRight = rootOf(right);
    if (rootLeft === rootRight) continue;
    parent.set(rootRight, rootLeft);
    links += 1;
  }

  const buckets = new Map();
  for (const item of phrases) {
    const root = rootOf(item.text);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(item);
  }

  const built = [...buckets.entries()].map(([root, members]) => {
    const ordered = [...members].sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.text.localeCompare(b.text));
    const head = ordered[0];
    const reviews = unionAll(ordered.map(item => negativeHits.get(item.text)));
    const praise = positiveCount > 0 ? unionAll(ordered.map(item => positiveHits.get(item.text) || new Set())) : null;
    const term = dominantTerm(ordered);
    return {
      id: root,
      // `name` adalah headline yang dipilih mesin dari istilah korpus; `evidence` selalu kalimat
      // asli, jadi pembaca bisa menelusuri nama itu ke teks yang sebenarnya.
      name: term || head.text,
      nameSource: term ? 'term' : 'phrase',
      evidence: head.text,
      reviewCount: reviews.size,
      share: rate(reviews.size / negativeCount),
      praiseCount: praise ? praise.size : null,
      praiseShare: praise ? rate(praise.size / positiveCount) : null,
      severity: rate(Math.max(...ordered.map(item => item.severity || 0))),
      weight: rate(Math.max(...ordered.map(item => item.weight || 0))),
      phraseCount: ordered.length,
      ...trendOf(reviews, days, range),
      // Seluruh anggota dikirim, bukan enam teratas: satu gerombol hanya berisi frasa yang sudah
      // dilaporkan di `items`, jadi batasnya mengikuti jumlah frasa dan pembaca bisa menjumlah
      // union-nya sendiri dari teks ulasan.
      phrases: ordered.map(item => ({
        text: item.text,
        dfNegative: item.dfNegative,
        dfPositive: item.dfPositive,
        severity: rate(item.severity),
      })),
    };
  }).sort((a, b) => b.reviewCount - a.reviewCount || (b.weight || 0) - (a.weight || 0) || a.name.localeCompare(b.name));

  // Satu istilah tidak boleh dipakai dua label: yang kalah turun kembali ke frasa lengkapnya,
  // yang tetap teks reviewers dan sudah pasti berbeda karena tiap frasa hanya punya satu rumah.
  const taken = new Set();
  for (const entry of built) {
    if (taken.has(entry.name)) {
      entry.name = entry.evidence;
      entry.nameSource = 'phrase';
    }
    taken.add(entry.name);
  }

  const reported = built.slice(0, maxLabels);
  return {
    version: 'pain-label-v2',
    rules: RULES,
    labels: reported,
    metrics: {
      phrases: phrases.length,
      links,
      clusters: built.length,
      reportedLabels: reported.length,
      trimmedLabels: Math.max(0, built.length - reported.length),
      singletons: built.filter(label => label.phraseCount === 1).length,
      namedFromTerm: built.filter(label => label.nameSource === 'term').length,
      trend: range ? { firstDay: range.firstDay, lastDay: range.lastDay, datedReviews: range.dated } : null,
    },
  };
}
