// Sumber publik Google Play lewat google-play-scraper. Tidak ada API key, token,
// atau login: yang dibaca hanya halaman toko dan daftar ulasan publik.
import gplay from 'google-play-scraper';

const PAGE_SIZE = 150;
const MAX_PAGES = 400;
const DEFAULT_REQUEST_MS = 12000;

export const playStoreUrl = appId => `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
export const playReviewPools = [
  { lang: 'id', country: 'id', label: 'Indonesian pool' },
  { lang: 'en', country: 'us', label: 'English pool' },
];

const requestOptions = ms => ({ timeout: { request: Math.max(1000, ms) }, retry: 0 });

const httpStatusOf = cause => {
  const status = cause?.response?.statusCode ?? cause?.status ?? cause?.statusCode;
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
};

const retryAfterOf = cause => {
  const header = cause?.response?.headers?.['retry-after'] ?? cause?.retryAfter;
  const seconds = Number(String(header ?? '').trim());
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 900 ? seconds * 1000 : null;
};

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
  if (term.length < 2) throw new Error('the app name needs at least two characters');
  const results = await gplay.search({
    term,
    lang: 'id',
    country: 'id',
    num: 24,
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

// Teks daftar aplikasi dipakai mesin korpus sebagai kosakata topik. Isinya murni kata yang
// ditulis penerbit di halaman tokonya sendiri, jadi panjangnya dibatasi agar dataset tetap
// ringan dan sumbernya tetap bisa ditelusuri kembali.
function listingText(app) {
  const parts = [app?.title, app?.summary, app?.description, app?.genre, app?.recentChanges]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.replace(/<[^>]*>/g, ' '));
  const joined = parts.join('\n');
  return joined ? joined.slice(0, 12000) : null;
}

async function fetchDetails(appId, candidate, deadline) {
  try {
    const app = await gplay.app({
      appId,
      lang: 'id',
      country: 'id',
      requestOptions: requestOptions(Math.min(15000, deadline - Date.now())),
    });    const rawHistogram = app?.histogram && typeof app.histogram === 'object' ? app.histogram : null;
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
        listing: listingText(app),
      },
    };
  } catch (cause) {
    return {
      error: `store details could not be read (${cause?.message || 'invalid response'})`,
      errorStatus: httpStatusOf(cause),
      errorRetryAfterMs: retryAfterOf(cause),
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
        listing: null,
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
  let skipped = 0;
  let complete = false;
  let error = null;
  let errorStatus = null;
  let errorRetryAfterMs = null;
  while (Date.now() < deadline) {
    if (pages >= MAX_PAGES) { error = `${pool.label}: safety page cap reached`; break; }
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
      errorStatus = httpStatusOf(cause);
      errorRetryAfterMs = retryAfterOf(cause);
      error = `${pool.label}: ${cause?.message || 'the page fetch did not complete'}${errorStatus ? ` (HTTP ${errorStatus})` : ''}`;
      break;
    }
    pages += 1;
    const data = Array.isArray(page?.data) ? page.data : [];
    rows += data.length;
    for (const raw of data) {
      const review = normalizePlayReview(raw, appId);
      if (!review) { skipped += 1; continue; }
      if (seenIds.has(review.id)) { duplicates += 1; continue; }
      seenIds.add(review.id);
      reviews.push(review);
      added += 1;
    }
    token = typeof page?.nextPaginationToken === 'string' ? page.nextPaginationToken : null;
    if (!token) { complete = true; break; }
    if (seenTokens.has(token)) { error = `${pool.label}: next page token repeated`; break; }
    seenTokens.add(token);
  }
  if (!error && !complete) error = `${pool.label}: fetch timeout reached`;
  return { ...pool, reviews, pages, rows, added, duplicates, skipped, complete, error, errorStatus, errorRetryAfterMs };
}

export async function fetchGooglePlayReviews(appId, candidate = {}, { budgetMs = 30000 } = {}) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(String(appId))) throw new Error('the Google Play package ID is not valid');
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const [detailsResult, ...poolResults] = await Promise.allSettled([
    fetchDetails(String(appId), candidate, deadline),
    ...playReviewPools.map(pool => fetchPool(String(appId), pool, deadline)),
  ]);
  const details = detailsResult.status === 'fulfilled'
    ? detailsResult.value
    : { error: `store details could not be read (${detailsResult.reason?.message || 'unknown error'})`, errorStatus: httpStatusOf(detailsResult.reason), errorRetryAfterMs: retryAfterOf(detailsResult.reason), app: { title: candidate?.title ?? null, developer: candidate?.developer ?? null, url: playStoreUrl(String(appId)), score: null, ratingCount: null, reviewCountReported: null, installs: null, ratingHistogram: null, ratingHistogramTotal: null, listing: null } };
  const pools = poolResults.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : {
      ...playReviewPools[index],
      reviews: [], pages: 0, rows: 0, added: 0, duplicates: 0, skipped: 0, complete: false,
      error: `${playReviewPools[index].label}: ${result.reason?.message || 'fetch did not complete'}`,
      errorStatus: httpStatusOf(result.reason),
      errorRetryAfterMs: retryAfterOf(result.reason),
    });
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
  const skipped = pools.reduce((sum, pool) => sum + pool.skipped, 0);
  const complete = pools.every(pool => pool.complete) && !issues.length && skipped === 0;
  const status = reviews.length === 0 && issues.length ? 'error' : reviews.length === 0 ? 'empty' : complete ? 'success' : 'partial';
  const histogramNote = details.app.ratingHistogram
    ? `Store histogram: ${details.app.ratingHistogram.map((value, index) => `${5 - index}★=${value}`).join(', ')} (${details.app.ratingHistogramTotal} ratings in total).`
    : 'The store star histogram was not read on this check.';
  const poolNote = pools.map(pool => `${pool.label} ${pool.rows} rows / ${pool.added} unique IDs`).join(', ');
  const droppedNote = skipped ? `${skipped} rows were dropped because they carried no review ID, so coverage is smaller` : '';
  return {
    id: 'play',
    status,
    reviews,
    fetched: reviews.length,
    appId: String(appId),
    app: details.app,
    coverage: {
      pools: pools.map(({ lang, country, label, pages, rows, added, duplicates: poolDuplicates, skipped: poolSkipped, complete: poolComplete, error, errorStatus }) => ({ lang, country, label, pages, rows, added, duplicates: poolDuplicates, skipped: poolSkipped, complete: poolComplete, error, httpStatus: errorStatus ?? null })),
      pages: pools.reduce((sum, pool) => sum + pool.pages, 0),
      rows: pools.reduce((sum, pool) => sum + pool.rows, 0),
      duplicates: duplicates + pools.reduce((sum, pool) => sum + pool.duplicates, 0),
      skipped,
      reportedReviewCount: details.app.reviewCountReported,
      reportedRatingCount: details.app.ratingCount,
      sampleLimit: null,
    },
    limits: {
      issues: [
        ...pools.filter(pool => pool.error).map(pool => ({
          source: pool.label,
          text: pool.error,
          httpStatus: pool.errorStatus ?? null,
          retryAfterMs: pool.errorRetryAfterMs ?? null,
        })),
        ...(details.error ? [{ source: 'store details', text: details.error, httpStatus: details.errorStatus ?? null, retryAfterMs: details.errorRetryAfterMs ?? null }] : []),
        ...(skipped ? [{ source: 'parser', text: `data structure: ${skipped} rows without a review ID were dropped`, httpStatus: null, retryAfterMs: null }] : []),
      ],
      paths: pools.map(pool => ({ label: pool.label, pages: pool.pages, rows: pool.rows, added: pool.added, skipped: pool.skipped, complete: pool.complete, error: pool.error || null })),
    },
    budgetMs,
    elapsedMs: Date.now() - startedAt,
    message: status === 'error'
      ? `Google Play could not be read: ${issues.join('; ')}. This is a source failure, not proof that no review exists.`
      : reviews.length === 0
        ? `Google Play responded, but no public written review came back for this package. That is not proof the app has no reviews. ${(issues.length || skipped) ? `Note: ${[...issues, droppedNote].filter(Boolean).join('; ')}.` : ''}`
        : `${reviews.length} unique review IDs were read from Google Play (${poolNote}; ${duplicates} duplicates skipped). ${complete ? 'Pagination of both pools finished.' : `Result not complete: ${[...issues, droppedNote].filter(Boolean).join('; ')}.`} ${histogramNote} Google Play reports ${details.app.reviewCountReported ?? 'N/A'} written reviews and ${details.app.ratingCount ?? 'N/A'} ratings; those figures are shown as published and are never forced to match what was read. Developer replies are not read.`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
