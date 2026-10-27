// Hitung ulang agregat dashboard dari baris yang tersaring. Yang dihitung di sini HANYA
// hitungan baris. Bobot, frasa keluhan, dan daftar topik tetap hasil analisis seluruh korpus
// — mesin tidak dijalankan ulang per filter — jadi setiap angka yang berubah di sini bisa
// ditelusuri ke baris yang sama yang dibaca menu Review.
const sentimentOf = review => review.analysis?.sentiment || 'unclassified';
const platformOf = review => review.platform || 'unknown';
const rated = review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5;
const dayOf = review => (typeof review.date === 'string' && review.date ? review.date
  : (typeof review.publishedAt === 'string' ? review.publishedAt.slice(0, 10) : null));
const topicIds = review => (Array.isArray(review.analysis?.topics) ? review.analysis.topics : []);

function matches(review, { platform, topic }) {
  if (platform !== 'all' && platformOf(review) !== platform) return false;
  if (topic !== 'all' && !topicIds(review).includes(topic)) return false;
  return true;
}

function emptyCounts() {
  return { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
}

function tally(rows) {
  const labels = emptyCounts();
  for (const review of rows) labels[sentimentOf(review)] += 1;
  const analyzed = labels.positive + labels.neutral + labels.negative;
  const withRating = rows.filter(rated);
  const average = withRating.length ? withRating.reduce((sum, review) => sum + review.rating, 0) / withRating.length : null;
  return {
    reviews: rows.length,
    analyzed,
    unclassified: labels.unclassified,
    rated: withRating.length,
    avgRating: average == null ? null : Number(average.toFixed(3)),
    nss: analyzed ? Number((((labels.positive - labels.negative) / analyzed) * 100).toFixed(4)) : null,
    ...labels,
  };
}

function dailyOf(rows) {
  const map = new Map();
  let undated = 0;
  for (const review of rows) {
    const date = dayOf(review);
    if (!date) { undated += 1; continue; }
    if (!map.has(date)) map.set(date, { date, ...emptyCounts(), total: 0 });
    const row = map.get(date);
    const sentiment = sentimentOf(review);
    row[sentiment] += 1;
    row.total += 1;
  }
  return { daily: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)), undated };
}

function platformsOf(rows) {
  const map = new Map();
  for (const review of rows) {
    const id = platformOf(review);
    if (!map.has(id)) map.set(id, { id, ...emptyCounts(), total: 0 });
    const row = map.get(id);
    row[sentimentOf(review)] += 1;
    row.total += 1;
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// Share masih terhadap pool 1-2★ dari baris yang sedang terlihat, sama seperti definisi mesin;
// `listingMentions` dan nama tidak berubah karena keduanya berasal dari teks daftar toko.
// Bedanya satu hal dan itu disengaja: mesin menghitung pool-nya dari ulasan yang punya token,
// dan token tidak bisa dihitung ulang di peramban, jadi pool di sini adalah ulasan 1-2★ yang
// teksnya tidak kosong. Selisihnya hanya ulasan berisi tanda baca belaka.
function topicsOf(rows, modelTopics) {
  if (!Array.isArray(modelTopics) || !modelTopics.length) return [];
  const hasText = review => typeof review.text === 'string' && review.text.trim().length > 0;
  const lowPool = rows.filter(review => hasText(review) && rated(review) && review.rating <= 2).length;
  const counts = new Map(modelTopics.map(topic => [topic.id, { low: 0, mid: 0, high: 0, unrated: 0 }]));
  for (const review of rows) {
    const bucket = !rated(review) ? 'unrated' : review.rating <= 2 ? 'low' : review.rating === 3 ? 'mid' : 'high';
    const seen = new Set(topicIds(review));
    for (const id of seen) {
      const entry = counts.get(id);
      if (entry) entry[bucket] += 1;
    }
  }
  return modelTopics.map(topic => {
    const entry = counts.get(topic.id) || { low: 0, mid: 0, high: 0, unrated: 0 };
    const ratedMentions = entry.low + entry.mid + entry.high;
    return {
      ...topic,
      ...entry,
      total: ratedMentions + entry.unrated,
      share: lowPool ? Number(((entry.low / lowPool) * 100).toFixed(4)) : null,
      complaintRate: ratedMentions ? Number(((entry.low / ratedMentions) * 100).toFixed(4)) : null,
    };
  }).sort((a, b) => b.low - a.low || String(a.id).localeCompare(String(b.id)));
}

export function scopeDataset(dataset, { platform = 'all', topic = 'all' } = {}) {
  const rows = Array.isArray(dataset?.reviews) ? dataset.reviews : [];
  const model = dataset?.model || {};
  const filtered = platform !== 'all' || topic !== 'all';
  const kept = rows.filter(review => matches(review, { platform, topic }));
  const { daily, undated } = dailyOf(kept);
  const summary = tally(kept);
  summary.undated = undated;
  // withText/withoutText adalah hasil tokenisasi mesin atas seluruh korpus. Meniru angka itu
  // dari teks mentah akan memberi angka yang tampak sama tapi tidak sama, jadi saat tersaring
  // keduanya sengaja ditiadakan, bukan diperkirakan.
  summary.withText = filtered ? null : (model.coverage?.withText ?? null);
  summary.withoutText = filtered ? null : (model.coverage?.withoutText ?? null);
  summary.channels = platformsOf(kept).map(channel => ({ id: channel.id, status: 'filtered', fetched: channel.total }));
  return {
    filtered,
    matched: kept.length,
    totalRows: rows.length,
    rows: kept,
    summary,
    model: {
      ...model,
      daily,
      platforms: platformsOf(kept),
      topics: topicsOf(kept, model.topics),
      labels: { positive: summary.positive, neutral: summary.neutral, negative: summary.negative, unclassified: summary.unclassified },
      nss: summary.nss,
    },
    options: {
      // Jumlah pada chip dihitung atas seluruh baris, bukan atas hasil filter lain: kontrol
      // tidak boleh hilang saat satu filter dipasang, dan angkanya tetap bisa dicocokkan
      // dengan bilangan "x of y reviews" di sebelahnya.
      platforms: tallyOptions(rows, platformOf),
      topics: topicOptions(rows, model.topics),
    },
  };
}

function tallyOptions(rows, keyOf) {
  const counts = new Map();
  for (const review of rows) {
    const key = keyOf(review);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function topicOptions(rows, modelTopics) {
  // Chip filter membawa objek topik, bukan salah satu namanya, supaya penyaji bisa memilih
  // sebutan sesuai bahasa aktif tanpa menyalin dua nama ke setiap pilihan.
  const byId = new Map((Array.isArray(modelTopics) ? modelTopics : []).map(topic => [topic.id, topic]));
  const counts = new Map();
  for (const review of rows) {
    for (const id of new Set(topicIds(review))) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, topic: byId.get(id) || { id, name: id }, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
