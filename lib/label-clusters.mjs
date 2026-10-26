// Lapisan ketiga: gerombol frasa menjadi label. Nama label tidak pernah ditulis tangan dan
// tidak pernah dipilihkan model bahasa — label adalah frasa yang benar-benar tertulis di
// ulasan, dan dua frasa digabung hanya kalau jumlah ulasan yang memuat keduanya lebih besar
// daripada yang bisa dijelaskan oleh kebetulan.
//
// Dua aturan yang membuat tabel label tidak bisa mengarang:
//   1. dukungan sebuah label dihitung dari union ulasan, bukan dari jumlah frasa anggotanya —
//      satu ulasan yang menyebut tiga keluhan tetap satu ulasan, bukan tiga temuan;
//   2. ikatan antar frasa diuji dengan konvensi kemaknaan yang sudah dipakai lapisan frasa dan
//      topik di proyek ini: proporsi satu sampel, smoothing Jeffreys α=0,5, z>1. Tidak ada
//      ambang baru yang dipilih tangan.
const rate = value => (Number.isFinite(value) ? Number(value.toFixed(4)) : null);

// Bukti minimal bahwa dua frasa benar-benar muncul bersama: satu ulasan yang memuat keduanya
// masih bisa kebetulan kosakata, jadi diperlukan dua ulasan berbeda sebelum ikatan diuji.
const MIN_SHARED_REVIEWS = 2;
// Anggaran tampilan, sama seperti lapisan frasa: gerombol yang tidak ditampilkan tetap
// dilaporkan lewat metrics, tidak hilang diam-diam.
const MAX_LABELS = 12;

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

export function clusterPainPhrases({
  items = [],
  negativeHits = new Map(),
  positiveHits = new Map(),
  negativeCount = 0,
  positiveCount = 0,
  maxLabels = MAX_LABELS,
} = {}) {
  const phrases = items.filter(item => negativeHits.has(item.text));
  const empty = {
    version: 'pain-label-v1',
    parameters: {
      sharedReviews: MIN_SHARED_REVIEWS,
      significance: 'z>1 dua arah, uji proporsi satu sampel, smoothing Jeffreys 0,5, latar bebas dfB/N',
      maxLabels,
    },
    labels: [],
    metrics: {
      phrases: phrases.length,
      links: 0,
      clusters: 0,
      reportedLabels: 0,
      trimmedLabels: 0,
      singletons: phrases.length,
    },
  };
  // Satu frasa tetap layak jadi label (gerombol beranggota satu); yang tidak bisa diproses
  // hanyalah korpus tanpa frasa atau tanpa ulasan 1-2★.
  if (!phrases.length || !(negativeCount > 0)) return empty;

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

  const labels = [...buckets.entries()].map(([root, members]) => {
    const ordered = [...members].sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.text.localeCompare(b.text));
    const head = ordered[0];
    const reviews = unionAll(ordered.map(item => negativeHits.get(item.text)));
    const praise = positiveCount > 0 ? unionAll(ordered.map(item => positiveHits.get(item.text) || new Set())) : null;
    return {
      id: root,
      label: head.text,
      reviewCount: reviews.size,
      share: rate(reviews.size / negativeCount),
      praiseCount: praise ? praise.size : null,
      praiseShare: praise ? rate(praise.size / positiveCount) : null,
      severity: rate(Math.max(...ordered.map(item => item.severity || 0))),
      weight: rate(Math.max(...ordered.map(item => item.weight || 0))),
      phraseCount: ordered.length,
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
  }).sort((a, b) => b.reviewCount - a.reviewCount || (b.weight || 0) - (a.weight || 0) || a.label.localeCompare(b.label));

  const reported = labels.slice(0, maxLabels);
  return {
    version: 'pain-label-v1',
    parameters: empty.parameters,
    labels: reported,
    metrics: {
      phrases: phrases.length,
      links,
      clusters: labels.length,
      reportedLabels: reported.length,
      trimmedLabels: Math.max(0, labels.length - reported.length),
      singletons: labels.filter(label => label.phraseCount === 1).length,
    },
  };
}
