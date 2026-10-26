// Lapisan ketiga: gerombol frasa menjadi label, lalu diberi nama dari istilah korpus sendiri.
// Tidak ada satu pun nama di modul ini yang ditulis tangan, dan tidak ada model bahasa yang
// ikut memilihnya: nama label adalah kata yang benar-benar ditulis reviewers di ulasan 1-2★,
// dan dua frasa digabung hanya kalau jumlah ulasan yang memuat keduanya lebih besar daripada
// yang bisa dijelaskan oleh kebetulan. Satu-satunya tempat di aplikasi ini yang boleh berisi
// kata yang tidak ditulis siapa pun adalah kolom kategori hasil lapisan `label-naming-v1`
// (lib/label-naming.mjs) — lapisan itu menempel setelah modul ini selesai dan tidak pernah
// mengubah satu angka pun di sini.
//
// Empat aturan yang membuat tabel label tidak bisa mengarang dan tetap terbaca seperti laporan
// analis profesional:
//   1. dukungan sebuah label dihitung dari union ulasan, bukan dari jumlah frasa anggotanya —
//      satu ulasan yang menyebut tiga keluhan tetap satu ulasan, bukan tiga temuan;
//   2. ikatan antar frasa diuji dengan konvensi kemaknaan yang sudah dipakai lapisan frasa dan
//      topik di proyek ini: proporsi satu sampel, smoothing Jeffreys α=0,5, z>1 dua arah;
//   3. nama label adalah kata jangkar yang dijagokan lebih dari satu anggota gerombol — istilah
//      paling membedakan di dalam tiap frasa, yang sudah dihitung lapisan frasa dari statistik
//      korpus — dan kalau gerombol ini punya beberapa calon, yang dipilih adalah calon yang
//      paling sedikit dipakai gerombol lain, jadi judulnya membedakan tema yang satu dari tema
//      yang lain dan bukan sekadar kata yang padat di keluhan. Headline-nya pendek seperti
//      laporan analis, sementara kalimat asli reviewers tetap utuh sebagai bukti di bawahnya;
//   4. arah label dihitung dari rentang tanggal yang benar-benar terbaca (paruh kedua terhadap
//      paruh pertama), dengan pembagi HARI KALENDER tiap paruh. Matriks perbandingan memakai
//      pembagi hari yang berisi ulasan, jadi angka momentum kedua tempat ini tidak bisa
//      diperlakukan sebagai satu besaran yang sama.
// Tidak ada ambang yang dipilih tangan. Satu-satunya angka tetap adalah "lebih dari satu
// ulasan", yang merupakan definisi bukti — sama seperti "dua kata" adalah definisi frasa.
//
// Lapisan kategori (pain-label-v5): setiap gerombol diuji terhadap kosakata HALAMAN TOKO —
// kata yang ditulis penerbit sendiri, bukan yang dikarang mesin. Sebuah istilah toko menjadi
// kategori sebuah gerombol hanya kalau ia muncul di ulasan gerombol itu lebih padat daripada
// di keluhan lain, diuji dengan konvensi kemaknaan yang sama seperti lapisan frasa (log-odds
// terhadap simpangan bakunya sendiri, α Jeffreys 0,5). Yang dihasilkan modul ini hanya istilah
// toko atau kosong; nama kategori dari model bahasa ditambahkan lapisan `label-naming-v1` di
// luar modul ini, dan UI menandai sumber setiap nama kategori.
import { isSignal } from './corpus-params.mjs';

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
  closure: 'sebuah gabungan diterima hanya kalau SETIAP frasa di kedua kubu punya ikatan yang lolos uji (complete-linkage), jadi gerombol tidak menyatu karena rantai',
  support: 'dukungan label = union ulasan berbeda, bukan penjumlahan frasa anggotanya',
  naming: 'nama = kata jangkar yang dijagokan lebih dari satu anggota gerombol dan paling membedakan gerombol ini dari gerombol lain; kalau tidak ada, frasa terberat dipakai apa adanya',
  category: 'kategori = istilah halaman toko yang lebih padat di ulasan gerombol ini daripada di keluhan lain, diuji dengan konvensi kemaknaan yang sama; tanpa istilah yang lolos, kategorinya kosong',
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
// rentang itu sendiri, jadi tidak ada jendela harian yang harus dipilih. Dipakai juga oleh
// mesin korpus untuk menghitung pool keluhan di masing-masing paruh, supaya uji kemaknaan arah
// dan angka "per hari" memakai dasar yang sama.
export function observedRange(days) {
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
// frasa, yang sudah dihitung lapisan frasa dari statistik korpus. Yang boleh jadi NAMA adalah
// istilah yang membedakan gerombol ini dari gerombol lain di korpus yang sama: kata seperti
// "tidak" memang padat di keluhan, tapi ia dijagokan oleh banyak gerombol sekaligus, jadi ia
// bukan judul yang baik. Urutan keputusannya: berapa anggota menjagokan istilah itu, lalu
// berapa gerombol lain yang juga menjagokannya (makin sedikit makin identifying), lalu total
// bobotnya, lalu dukungan ulasannya, lalu alfabet.
function dominantTerm(members, spreadOf) {
  const tally = new Map();
  for (const item of members) {
    if (!item.anchor) continue;
    const entry = tally.get(item.anchor) || { term: item.anchor, members: 0, weightSum: 0, dfNegative: 0 };
    entry.members += 1;
    entry.weightSum += Math.abs(item.weight || 0);
    entry.dfNegative += item.dfNegative || 0;
    tally.set(item.anchor, entry);
  }
  const better = (entry, best) => {
    if (!best) return true;
    if (entry.members !== best.members) return entry.members > best.members;
    const spread = spreadOf(entry.term);
    const bestSpread = spreadOf(best.term);
    if (spread !== bestSpread) return spread < bestSpread;
    if (entry.weightSum !== best.weightSum) return entry.weightSum > best.weightSum;
    if (entry.dfNegative !== best.dfNegative) return entry.dfNegative > best.dfNegative;
    return entry.term < best.term;
  };
  let best = null;
  for (const entry of tally.values()) if (better(entry, best)) best = entry;
  // Satu kata hanya boleh dijadikan nama kalau lebih dari satu anggota menjagokannya; tanpa
  // itu, tidak ada dasar untuk memendekkan kalimat reviewers menjadi satu istilah.
  return best && best.members > 1 ? best.term : null;
}

// Rincian kanal sebuah label: berapa ulasan label itu datang dari kanal tersebut dibandingkan
// berapa banyak keluhan kanal itu di seluruh korpus. Dua angka ini dibutuhkan lapisan sinyal
// untuk menguji "keluhan ini menumpuk di kanal X" — tanpa pembandingnya, hitungan kanal hanya
// jadi deskripsi. Kanal tanpa ulasan label ini tidak dikirim, jadi tidak ada nol yang ditafsir
// sebagai temuan.
function channelBreakdown(reviews, channelOf, channelPools) {
  const tally = new Map();
  for (const index of reviews) {
    const id = channelOf.get(index);
    if (!id) continue;
    tally.set(id, (tally.get(id) || 0) + 1);
  }
  return [...tally]
    .map(([id, count]) => ({ id, count, pool: channelPools.get(id) ?? null }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

// Kategori gerombol dipilih dari kosakata halaman toko. Untuk setiap istilah toko yang muncul
// di ulasan gerombol ini, diuji apakah porsinya di dalam gerombol bisa dibedakan dari porsinya
// di keluhan lain (log-odds dua proporsi terhadap simpangan bakunya sendiri, konvensi yang sama
// dengan lapisan frasa). Yang menang adalah istilah dengan z terbesar — bukan yang paling sering
// muncul secara mentah, karena istilah populer muncul di mana-mana dan tidak membedakan apa pun.
// Gerombol yang sama dengan seluruh pool tidak bisa dibandingkan dengan siapa pun: kategorinya
// kosong, bukan dipaksakan.
function categoryOf(reviews, topicsOf, topicPools, topicNames, negativeCount) {
  if (!topicsOf.size || !(negativeCount > 0)) return null;
  let inside = null;
  for (const index of reviews) {
    const tokens = topicsOf.get(index);
    if (!tokens) continue;
    if (!inside) inside = new Map();
    for (const token of new Set(tokens)) inside.set(token, (inside.get(token) || 0) + 1);
  }
  if (!inside) return null;
  const clusterSize = reviews.size;
  const outsidePool = negativeCount - clusterSize;
  if (!(outsidePool > 0)) return null;
  let best = null;
  for (const [id, count] of inside) {
    // Gerbangnya bukan angka baru: sama dengan definisi bukti di modul ini, "lebih dari satu
    // ulasan". Satu ulasan yang kebetulan memuat istilah toko belum menyebut tema.
    if (count < MIN_SHARED_REVIEWS) continue;
    const pool = topicPools.get(id) || 0;
    const outside = pool - count;
    if (!(outside >= 0)) continue;
    const signal = isSignal(count, outside, clusterSize, outsidePool);
    if (!signal.significant || !(signal.estimate > 0)) continue;
    const z = signal.estimate / signal.error;
    const candidate = { id, name: topicNames.get(id) || id, inside: count, pool, share: rate(count / pool), z: Number(z.toFixed(2)) };
    if (!best || candidate.z > best.z || (candidate.z === best.z && candidate.inside > best.inside) || (candidate.z === best.z && candidate.inside === best.inside && candidate.id < best.id)) best = candidate;
  }
  return best;
}

export function clusterPainPhrases({
  items = [],
  negativeHits = new Map(),
  positiveHits = new Map(),
  negativeCount = 0,
  positiveCount = 0,
  days = new Map(),
  negativeIndexes = [],
  channelOf = new Map(),
  topicsOf = new Map(),
  topicNames = new Map(),
  maxLabels = MAX_LABELS,
} = {}) {
  const phrases = items.filter(item => negativeHits.has(item.text));
  const empty = {
    version: 'pain-label-v5',
    rules: RULES,
    labels: [],
    metrics: {
      phrases: phrases.length,
      links: 0,
      merges: 0,
      rejectedMerges: 0,
      clusters: 0,
      reportedLabels: 0,
      trimmedLabels: 0,
      singletons: phrases.length,
      namedFromTerm: 0,
      categorized: 0,
      trend: null,
    },
  };
  // Satu frasa tetap layak jadi label (gerombol beranggota satu); yang tidak bisa diproses
  // hanyalah korpus tanpa frasa atau tanpa ulasan 1-2★.
  if (!phrases.length || !(negativeCount > 0)) return empty;

  const range = observedRange(days);
  // Pembelah waktu untuk pool keluhan memakai titik tengah yang sama dengan arah setiap label,
  // jadi uji kemaknaan "naik/turun" dan angka per-hari tidak pernah memakai dua dasar berbeda.
  const halves = { early: 0, late: 0, undated: 0 };
  const channelPools = new Map();
  const topicPools = new Map();
  for (const index of negativeIndexes) {
    const id = channelOf.get(index);
    if (id) channelPools.set(id, (channelPools.get(id) || 0) + 1);
    for (const token of new Set(topicsOf.get(index) || [])) {
      topicPools.set(token, (topicPools.get(token) || 0) + 1);
    }
    if (!range) continue;
    const day = days.get(index);
    if (typeof day !== 'string' || !day) { halves.undated += 1; continue; }
    if (Date.parse(`${day}T00:00:00Z`) <= range.midpoint) halves.early += 1;
    else halves.late += 1;
  }
  const dfOf = new Map(phrases.map(item => [item.text, item.dfNegative]));

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

  const pairs = [];
  for (const [key, co] of pairCo) {
    if (co < MIN_SHARED_REVIEWS) continue;
    const [left, right] = key.split('|');
    const dfLeft = dfOf.get(left) || 0;
    const dfRight = dfOf.get(right) || 0;
    // Diuji dua arah: "melihat A membuat B lebih mungkin" DAN sebaliknya.
    const z = Math.min(associationZ(co, dfLeft, dfRight, negativeCount), associationZ(co, dfRight, dfLeft, negativeCount));
    if (!(z > 1)) continue;
    pairs.push({ left, right, co, z, key });
  }
  // Penggabungan berurutan dari ikatan TERKUAT, dan sebuah gabungan hanya diterima kalau
  // COMPLETE-linkage terpenuhi: setiap frasa di kubu kiri harus punya ikatan yang lolos uji
  // dengan SETIAP frasa di kubu kanan. Aturan inilah yang membuat gerombol tidak bisa menyatu
  // karena rantai. Terukur: pada penarikan 41.047 ulasan Shopee, penyatuan berantai (union-find
  // biasa) melahap seluruh 40 frasa menjadi SATU label; dengan complete-linkage pasangan yang
  // hanya terhubung lewat tetangga perantara ditolak dan dilaporkan lewat `rejectedMerges`.
  pairs.sort((a, b) => b.z - a.z || a.key.localeCompare(b.key));
  const linkOf = new Map(pairs.map(pair => [pair.key, true]));
  const linked = (a, b) => linkOf.has(a < b ? `${a}|${b}` : `${b}|${a}`);

  const itemOf = new Map(phrases.map(item => [item.text, item]));
  const groups = phrases.map(item => [item.text]);
  const owner = new Map(groups.map((group, position) => [group[0], position]));
  let merges = 0;
  let rejectedMerges = 0;
  for (const pair of pairs) {
    const leftOwner = owner.get(pair.left);
    const rightOwner = owner.get(pair.right);
    if (leftOwner === rightOwner) continue;
    const leftGroup = groups[leftOwner];
    const rightGroup = groups[rightOwner];
    if (!leftGroup.length || !rightGroup.length) continue;
    // Penolakan diperiksa lebih dulu untuk ikatan terlemah: kalau masih ada kandidat lain yang
    // bisa menggabungkan dua kubu ini, biarkan yang lebih kuat yang mencoba.
    let complete = true;
    for (const a of leftGroup) {
      for (const b of rightGroup) {
        if (!linked(a, b)) { complete = false; break; }
      }
      if (!complete) break;
    }
    if (!complete) { rejectedMerges += 1; continue; }
    for (const text of rightGroup) {
      leftGroup.push(text);
      owner.set(text, leftOwner);
    }
    rightGroup.length = 0;
    merges += 1;
  }

  const buckets = groups
    .filter(group => group.length)
    .map(group => group.map(text => itemOf.get(text)));

  // Sebaran istilah antar gerombol: istilah yang dijagokan banyak gerombol sekaligus tidak
  // membedakan apa pun, jadi ia kalah dari istilah yang hanya hidup di gerombol ini.
  const claims = new Map();
  for (const members of buckets) {
    for (const term of new Set(members.map(item => item.anchor).filter(Boolean))) {
      claims.set(term, (claims.get(term) || 0) + 1);
    }
  }
  const spreadOf = term => claims.get(term) || 1;

  const built = buckets.map(members => {
    const ordered = [...members].sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.text.localeCompare(b.text));
    const head = ordered[0];
    const root = ordered[0].text;
    const reviews = unionAll(ordered.map(item => negativeHits.get(item.text)));
    const praise = positiveCount > 0 ? unionAll(ordered.map(item => positiveHits.get(item.text) || new Set())) : null;
    const term = dominantTerm(ordered, spreadOf);
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
      category: categoryOf(reviews, topicsOf, topicPools, topicNames, negativeCount),
      channels: channelBreakdown(reviews, channelOf, channelPools),
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
    version: 'pain-label-v5',
    rules: RULES,
    labels: reported,
    metrics: {
      phrases: phrases.length,
      // `links` = pasangan frasa yang bukti ko-occurrence-nya lolos uji; `merges` = gabungan
      // yang benar-benar diterima karena seluruh silangannya lolos; `rejectedMerges` = pasangan
      // lolos yang ditolak karena dua kubu belum terhubung sepenuhnya (rantai).
      links: pairs.length,
      merges,
      rejectedMerges,
      clusters: built.length,
      reportedLabels: reported.length,
      trimmedLabels: Math.max(0, built.length - reported.length),
      singletons: built.filter(label => label.phraseCount === 1).length,
      namedFromTerm: built.filter(label => label.nameSource === 'term').length,
      categorized: built.filter(label => label.category).length,
      trend: range
        ? {
          firstDay: range.firstDay,
          lastDay: range.lastDay,
          datedReviews: range.dated,
          earlyNegative: halves.early,
          lateNegative: halves.late,
          undatedNegative: halves.undated,
        }
        : null,
    },
  };
}
