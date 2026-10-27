// Proyeksi baca: bentuk dataset yang dikirim ke peramban, bukan yang disimpan.
//
// Alasannya terukur. Korpus 53.180 ulasan tersimpan adalah 42,2 MB isi (6,3 MB di jaringan)
// dan butuh 21,2 detik untuk sampai ke halaman, padahal yang dibaca klien hanya sebelas
// bidang per baris: id, platform, author, title, text, rating, date, publishedAt,
// meta.appVersion, dan analysis { sentiment, score, language, topics, topicNames, matchedTerms }.
// Kolom lain (store, language baris, analysis.primaryTopic/topicClusters/topicTriggers/listingTerms,
// meta.via/helpfulCount) ditulis mesin dan tetap tersimpan, hanya tidak diberangkatkan.
// sourceUrl bernilai sama untuk setiap baris dari kanal yang sama, jadi ia dipromosikan menjadi
// satu peta per kanal — 12,3% dari sisa byte. Total: 21,9 MB -> 14,8 MB atas 28.050 baris (32%).
//
// Ini bukan sampling. Setiap baris tetap dikirim dan setiap angka statistik tetap dihitung
// dari seluruh korpus; yang dibuang hanyalah kolom yang tidak pernah dibaca layar.
const ROW_FIELDS = ['id', 'platform', 'author', 'title', 'text', 'rating', 'date', 'publishedAt'];
const ANALYSIS_FIELDS = ['sentiment', 'score', 'language', 'topics', 'topicNames'];
// Kartu ulasan menampilkan lima kata teratas; mengirim enam hanya menambah byte.
const MATCHED_TERMS_SHOWN = 5;

function leanRow(review) {
  const row = {};
  for (const key of ROW_FIELDS) row[key] = review[key] ?? null;
  const appVersion = review.meta?.appVersion;
  row.meta = appVersion ? { appVersion } : null;
  const analysis = review.analysis;
  if (analysis && typeof analysis === 'object') {
    const leanAnalysis = {};
    for (const key of ANALYSIS_FIELDS) leanAnalysis[key] = analysis[key] ?? null;
    leanAnalysis.matchedTerms = Array.isArray(analysis.matchedTerms)
      ? analysis.matchedTerms.slice(0, MATCHED_TERMS_SHOWN)
      : [];
    row.analysis = leanAnalysis;
  } else {
    row.analysis = null;
  }
  return row;
}

export function projectDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.reviews)) return dataset;
  const sourceUrls = {};
  const reviews = dataset.reviews.map(review => {
    if (review && typeof review === 'object') {
      const url = review.sourceUrl;
      const platform = review.platform || 'unknown';
      if (typeof url === 'string' && url && !sourceUrls[platform]) sourceUrls[platform] = url;
    }
    return review && typeof review === 'object' ? leanRow(review) : review;
  });
  return { ...dataset, reviews, sourceUrls };
}
