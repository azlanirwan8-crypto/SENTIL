// Sumber publik Google Play lewat google-play-scraper. Tidak ada API key, token,
// atau login: yang dibaca hanya halaman toko dan daftar ulasan publik.
import gplay from 'google-play-scraper';

const PAGE_SIZE = 150;
const MAX_PAGES = 400;
const DEFAULT_REQUEST_MS = 12000;

export const playStoreUrl = appId => `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
export const playReviewPools = [
  { lang: 'id', country: 'id', label: 'kumpulan bahasa Indonesia' },
  { lang: 'en', country: 'us', label: 'kumpulan bahasa Inggris' },
];

const requestOptions = ms => ({ timeout: { request: Math.max(1000, ms) }, retry: 0 });

function cleanDate(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return { date: null, publishedAt: null };
  return { date: value.slice(0, 10), publishedAt: value };
}

function normalizePlayReview(raw, appId) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const rating = Number.isInteger(raw.score) && raw.score >= 1 && raw.score <= 5 ? raw.score : null;
  return {
    id: raw.id,
    platform: 'play',
    store: 'Google Play',
    author: typeof raw.userName === 'string' && raw.userName.trim() ? raw.userName : 'N/A',
    title: typeof raw.title === 'string' ? raw.title : null,
    text: typeof raw.text === 'string' ? raw.text : '',
    rating,
    ...cleanDate(raw.date),
    sourceUrl: playStoreUrl(appId),
    language: null,
    meta: {
      via: 'google-play',
      ...(typeof raw.version === 'string' && raw.version ? { appVersion: raw.version } : {}),
      ...(Number.isInteger(raw.thumbsUp) ? { helpfulCount: raw.thumbsUp } : {}),
    },
  };
}

export async function discoverGooglePlay(entity, { timeoutMs = DEFAULT_REQUEST_MS } = {}) {
  const term = String(entity || '').trim();
  if (term.length < 2) throw new Error('nama aplikasi minimal dua karakter');
  const results = await gplay.search({
    term,
    lang: 'id',
    country: 'id',
    num: 8,
    requestOptions: requestOptions(timeoutMs),
  });
  const seen = new Set();
  return (Array.isArray(results) ? results : [])
    .filter(app => app && typeof app.appId === 'string' && !seen.has(app.appId) && seen.add(app.appId))
    .map(app => ({
      store: 'Google Play',
      appId: app.appId,
      title: typeof app.title === 'string' ? app.title : 'N/A',
      developer: typeof app.developer === 'string' && app.developer ? app.developer : 'N/A',
      score: Number.isFinite(Number(app.score)) ? Number(app.score) : null,
      ratings: null,
      url: playStoreUrl(app.appId),
    }));
}

async function fetchDetails(appId, candidate, deadline) {
  try {
    const app = await gplay.app({
      appId,
      lang: 'id',
      country: 'id',
      requestOptions: requestOptions(Math.min(15000, deadline - Date.now())),
    });
    const rawHistogram = app?.histogram && typeof app.histogram === 'object' ? app.histogram : null;
    const histogram = rawHistogram && [1, 2, 3, 4, 5].every(star => Number.isInteger(rawHistogram[star]) && rawHistogram[star] >= 0)
      ? [5, 4, 3, 2, 1].map(star => rawHistogram[star])
      : null;
    return {
      error: null,
      app: {
        title: typeof app?.title === 'string' ? app.title : candidate?.title ?? null,
        developer: typeof app?.developer === 'string' ? app.developer : candidate?.developer ?? null,
        url: playStoreUrl(appId),
        score: Number.isFinite(Number(app?.score)) ? Number(app.score) : (Number.isFinite(candidate?.score) ? candidate.score : null),
        ratingCount: Number.isInteger(app?.ratings) ? app.ratings : null,
        reviewCountReported: Number.isInteger(app?.reviews) ? app.reviews : null,
        installs: typeof app?.installs === 'string' ? app.installs : null,
        ratingHistogram: histogram,
        ratingHistogramTotal: histogram ? histogram.reduce((sum, value) => sum + value, 0) : null,
      },
    };
  } catch (cause) {
    return {
      error: `detail toko tidak terbaca (${cause.message})`,
      app: {
        title: candidate?.title ?? null,
        developer: candidate?.developer ?? null,
        url: playStoreUrl(appId),
        score: Number.isFinite(candidate?.score) ? candidate.score : null,
        ratingCount: null,
        reviewCountReported: null,
        installs: null,
        ratingHistogram: null,
        ratingHistogramTotal: null,
      },
    };
  }
}

async function fetchPool(appId, pool, deadline) {
  const reviews = [];
  const seenIds = new Set();
  const seenTokens = new Set();
  let token = null;
  let pages = 0;
  let rows = 0;
  let added = 0;
  let duplicates = 0;
  let complete = false;
  let error = null;
  while (Date.now() < deadline) {
    if (pages >= MAX_PAGES) { error = 'batas halaman keamanan tercapai'; break; }
    let page;
    try {
      page = await gplay.reviews({
        appId,
        sort: gplay.sort.NEWEST,
        lang: pool.lang,
        country: pool.country,
        num: PAGE_SIZE,
        paginate: true,
        nextPaginationToken: token,
        requestOptions: requestOptions(Math.min(12000, deadline - Date.now())),
      });
    } catch (cause) {
      error = `${pool.label}: ${cause.message}`;
      break;
    }
    pages += 1;
    const data = Array.isArray(page?.data) ? page.data : [];
    rows += data.length;
    for (const raw of data) {
      const review = normalizePlayReview(raw, appId);
      if (!review) continue;
      if (seenIds.has(review.id)) { duplicates += 1; continue; }
      seenIds.add(review.id);
      reviews.push(review);
      added += 1;
    }
    token = typeof page?.nextPaginationToken === 'string' ? page.nextPaginationToken : null;
    if (!token) { complete = true; break; }
    if (seenTokens.has(token)) { error = `${pool.label}: token halaman berikutnya berulang`; break; }
    seenTokens.add(token);
  }
  if (!error && !complete) error = `${pool.label}: batas waktu pengambilan tercapai`;
  return { ...pool, reviews, pages, rows, added, duplicates, complete, error };
}

export async function fetchGooglePlayReviews(appId, candidate = {}, { budgetMs = 30000 } = {}) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(String(appId))) throw new Error('ID paket Google Play tidak valid');
  const deadline = Date.now() + budgetMs;
  const [detailsResult, ...poolResults] = await Promise.allSettled([
    fetchDetails(String(appId), candidate, deadline),
    ...playReviewPools.map(pool => fetchPool(String(appId), pool, deadline)),
  ]);
  const details = detailsResult.status === 'fulfilled'
    ? detailsResult.value
    : { error: `detail toko tidak terbaca (${detailsResult.reason?.message || 'kesalahan tidak diketahui'})`, app: { title: candidate?.title ?? null, developer: candidate?.developer ?? null, url: playStoreUrl(String(appId)), score: null, ratingCount: null, reviewCountReported: null, installs: null, ratingHistogram: null, ratingHistogramTotal: null } };
  const pools = poolResults.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { ...playReviewPools[index], reviews: [], pages: 0, rows: 0, added: 0, duplicates: 0, complete: false, error: result.reason?.message || 'pengambilan gagal' });
  const merged = new Map();
  let duplicates = 0;
  for (const pool of pools) {
    for (const review of pool.reviews) {
      if (merged.has(review.id)) { duplicates += 1; continue; }
      merged.set(review.id, review);
    }
  }
  const reviews = [...merged.values()].sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    return right - left || a.id.localeCompare(b.id);
  });
  const issues = [...pools.filter(pool => pool.error).map(pool => pool.error), details.error].filter(Boolean);
  const complete = pools.every(pool => pool.complete) && !issues.length;
  const status = reviews.length === 0 && issues.length ? 'error' : reviews.length === 0 ? 'empty' : complete ? 'success' : 'partial';
  const histogramNote = details.app.ratingHistogram
    ? `Histogram toko: ${details.app.ratingHistogram.map((value, index) => `${5 - index}★=${value}`).join(', ')} (total ${details.app.ratingHistogramTotal} penilaian).`
    : 'Histogram bintang toko tidak terbaca pada pemeriksaan ini.';
  const poolNote = pools.map(pool => `${pool.label} ${pool.rows} baris / ${pool.added} ID unik`).join(', ');
  return {
    id: 'play',
    status,
    reviews,
    fetched: reviews.length,
    appId: String(appId),
    app: details.app,
    coverage: {
      pools: pools.map(({ lang, country, label, pages, rows, added, duplicates: poolDuplicates, complete: poolComplete, error }) => ({ lang, country, label, pages, rows, added, duplicates: poolDuplicates, complete: poolComplete, error })),
      pages: pools.reduce((sum, pool) => sum + pool.pages, 0),
      rows: pools.reduce((sum, pool) => sum + pool.rows, 0),
      duplicates: duplicates + pools.reduce((sum, pool) => sum + pool.duplicates, 0),
      reportedReviewCount: details.app.reviewCountReported,
      reportedRatingCount: details.app.ratingCount,
      sampleLimit: null,
    },
    message: status === 'error'
      ? `Google Play tidak dapat dibaca: ${issues.join('; ')}. Ini kegagalan sumber, bukan berarti tidak ada ulasan.`
      : reviews.length === 0
        ? `Google Play terhubung, tetapi tidak ada ulasan tertulis publik yang dikembalikan untuk paket ini. Ini bukan berarti aplikasi tidak memiliki ulasan. ${issues.length ? `Catatan: ${issues.join('; ')}.` : ''}`
        : `${reviews.length} ID ulasan unik dibaca dari Google Play (${poolNote}; ${duplicates} duplikat dilewati). ${complete ? 'Paginasi kedua kumpulan selesai.' : `Hasil belum lengkap: ${issues.join('; ')}.`} ${histogramNote} Google Play menyebut ${details.app.reviewCountReported ?? 'N/A'} ulasan tertulis dan ${details.app.ratingCount ?? 'N/A'} penilaian; angka tersebut ditampilkan apa adanya dan tidak dipaksa sama dengan jumlah yang terbaca. Balasan pengembang tidak dibaca.`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
