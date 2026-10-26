// Sumber publik App Store tanpa API key: iTunes Search untuk penemuan, halaman ulasan
// publik untuk ulasan, dan feed pelanggan RSS sebagai jalur silang.
const MAX_SHELF_PAGES = 30;
const MAX_FEED_PAGES = 10;

export const appStoreUrl = (appId, country = 'id') => `https://apps.apple.com/${country}/app/id${encodeURIComponent(appId)}?see-all=reviews&platform=iphone`;

const retryAfterMs = value => {
  const seconds = Number(String(value ?? '').trim());
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 900 ? seconds * 1000 : null;
};

const httpError = response => Object.assign(
  new Error(`source returned HTTP ${response.status}`),
  { httpStatus: response.status, retryAfterMs: retryAfterMs(response.headers?.get?.('retry-after')) },
);
const parseError = message => new Error(`parse_error: ${message}`);

async function fetchText(url, { fetchImpl = fetch, timeoutMs = 15000, accept = 'text/html,application/xhtml+xml' } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { accept, 'user-agent': 'Sentil/1.0 (+https://github.com/azlanirwan8-crypto/analisa; public review analysis)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`network_error: ${error.name === 'TimeoutError' || error.name === 'AbortError' ? 'the request timed out' : error.message}`);
  }
  if (!response.ok) throw httpError(response);
  return response.text();
}

async function fetchJson(url, options) {
  const text = await fetchText(url, { ...options, accept: 'application/json' });
  try { return JSON.parse(text); } catch { throw parseError('response is not JSON'); }
}

function cleanDate(value) {
  if (typeof value !== 'string') return { date: null, publishedAt: null };
  const publishedAt = Number.isNaN(Date.parse(value)) ? null : value;
  return { date: publishedAt ? publishedAt.slice(0, 10) : null, publishedAt };
}

const reviewUrl = (appId, country) => appStoreUrl(appId, country);

function normalizeAppleReview(raw, appId, country) {
  if (!raw || raw.id == null) return null;
  const text = typeof raw.text === 'string' ? raw.text : '';
  const rating = Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 5 ? raw.rating : null;
  return {
    id: `apple-${raw.id}`,
    platform: 'appstore',
    author: typeof raw.author === 'string' && raw.author.trim() ? raw.author : 'N/A',
    title: typeof raw.title === 'string' ? raw.title : null,
    text,
    rating,
    ...cleanDate(raw.date),
    sourceUrl: reviewUrl(appId, country),
    store: 'App Store',
    language: null,
    meta: { via: raw.via || 'app-store' },
  };
}

export async function discoverAppStore(entity, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const term = String(entity || '').trim();
  if (term.length < 2) throw new Error('the app name needs at least two characters');
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=id&entity=software&limit=25`;
  const payload = await fetchJson(url, { fetchImpl, timeoutMs });
  if (!Array.isArray(payload.results)) throw parseError('the App Store search result is not a list');
  return payload.results
    .filter(item => item && item.kind === 'software' && Number.isFinite(Number(item.trackId)))
    .map(item => ({
      appId: String(item.trackId),
      title: String(item.trackName || item.trackCensoredName || 'N/A'),
      developer: String(item.artistName || 'N/A'),
      icon: typeof item.artworkUrl100 === 'string' ? item.artworkUrl100 : null,
      score: Number.isFinite(Number(item.averageUserRating)) ? Number(item.averageUserRating) : null,
      ratings: Number.isFinite(Number(item.userRatingCount)) ? Number(item.userRatingCount) : null,
      url: typeof item.trackViewUrl === 'string' ? item.trackViewUrl : appStoreUrl(String(item.trackId)),
      store: 'App Store',
      storefront: 'id',
    }));
}

// Teks daftar aplikasi dari iTunes Search. Sama seperti kanal Play, isinya kata yang ditulis
// penerbit sendiri, jadi mesin korpus bisa menamai topik dengan fitur yang benar-benar ada.
export async function fetchItunesListing(appId, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!/^\d+$/.test(String(appId))) return null;
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(String(appId))}&country=id`;
  const payload = await fetchJson(url, { fetchImpl, timeoutMs });
  const item = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!item) return null;
  const parts = [
    item.trackName,
    typeof item.description === 'string' ? item.description : null,
    Array.isArray(item.genres) ? item.genres.join(' ') : null,
  ].filter(value => typeof value === 'string' && value.trim());
  const joined = parts.join('\n');
  return joined ? joined.slice(0, 12000) : null;
}

export function parseApplePage(html, appId) {  const scripts = [...String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const script = scripts.find(match => /\bid=["']serialized-server-data["']/i.test(match[1]));
  if (!script) throw parseError('App Store review data was not found');
  let root;
  try { root = JSON.parse(script[2]); } catch { throw parseError('App Store review data is not JSON'); }
  if (!Array.isArray(root.data)) throw parseError('App Store data structure changed');
  const candidates = root.data.filter(item => item?.intent?.id === appId && item?.data?.shelfMapping);
  const page = candidates.find(item => item.data.shelfMapping.allProductReviews)?.data || candidates[0]?.data;
  const shelf = page?.shelfMapping?.allProductReviews;
  const listing = page?.shelfMapping?.productRatings?.items?.[0];
  if (!Array.isArray(shelf?.items)) throw parseError('the App Store review section was not found');
  const reviews = [];
  let skipped = 0;
  for (const item of shelf.items) {
    try {
      const raw = item?.review;
      if (!raw || (raw.$kind != null && raw.$kind !== 'Review')) { skipped += 1; continue; }
      const normalized = normalizeAppleReview({
        id: raw.id,
        author: raw.reviewerName,
        title: raw.title,
        text: raw.contents ?? '',
        rating: Number.isInteger(raw.rating) ? raw.rating : null,
        date: raw.date,
        via: 'app-store-page',
      }, appId, 'id');
      if (normalized) reviews.push(normalized); else skipped += 1;
    } catch { skipped += 1; }
  }
  const rating = Number(listing?.ratingAverage);
  const ratingCount = Number(listing?.totalNumberOfRatings);
  const rawCounts = Array.isArray(listing?.ratingCounts) && listing.ratingCounts.length === 5 && listing.ratingCounts.every(value => Number.isInteger(value) && value >= 0)
    ? listing.ratingCounts
    : null;
  const histogramTotal = rawCounts ? rawCounts.reduce((sum, value) => sum + value, 0) : null;
  const histogram = rawCounts && histogramTotal === ratingCount ? rawCounts : null;
  return {
    reviews,
    skipped,
    title: typeof page?.title === 'string' ? page.title : null,
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
    ratingCount: Number.isInteger(ratingCount) && ratingCount >= 0 ? ratingCount : null,
    ratingHistogram: histogram,
    continuationUrl: typeof shelf.url === 'string' ? shelf.url : null,
  };
}

export function parseAppleRss(text, appId) {
  let feed;
  try { feed = JSON.parse(text).feed; } catch { throw parseError('the App Store review feed structure changed'); }
  if (!feed) throw parseError('the App Store review feed was not found');
  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const reviews = [];
  let skipped = 0;
  for (const entry of entries) {
    if (entry?.id?.label == null) { skipped += 1; continue; }
    try {
      const rating = Number(entry['im:rating']?.label);
      if (typeof entry.content?.label !== 'string') { skipped += 1; continue; }
      const normalized = normalizeAppleReview({
        id: String(entry.id.label),
        author: entry.author?.name?.label,
        title: entry.title?.label,
        text: entry.content.label,
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        date: entry.updated?.label,
        via: 'app-store-rss',
      }, appId, 'id');
      if (normalized) reviews.push(normalized); else skipped += 1;
    } catch { skipped += 1; }
  }
  return { reviews, skipped };
}

function nextApplePage(value, appId, current) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value, 'https://apps.apple.com'); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || !url.pathname.includes(`id${appId}`)) return null;
  return url.href === current ? null : url.href;
}

async function collectShelf(appId, { fetchImpl, deadline, pageLimit = MAX_SHELF_PAGES, since = null }) {
  const reviews = new Map();
  let url = appStoreUrl(appId);
  const sinceTime = since ? Date.parse(since) : null;
  const seen = new Set([url]);
  let pages = 0, skipped = 0, older = 0, watermark = false, title = null, rating = null, ratingCount = null, ratingHistogram = null, complete = false, error = null, errorStatus = null, errorRetryAfterMs = null;
  while (Date.now() < deadline) {
    if (pages >= pageLimit) { error = 'safety page cap reached'; break; }
    let parsed;
    try {
      parsed = parseApplePage(await fetchText(url, { fetchImpl, timeoutMs: Math.max(1000, Math.min(15000, deadline - Date.now())) }), appId);
    } catch (cause) {
      error = cause.message;
      errorStatus = cause.httpStatus ?? null;
      errorRetryAfterMs = cause.retryAfterMs ?? null;
      break;
    }
    pages += 1;
    skipped += parsed.skipped;
    if (parsed.title) title = parsed.title;
    if (parsed.rating != null) rating = parsed.rating;
    if (parsed.ratingCount != null) ratingCount = parsed.ratingCount;
    if (!ratingHistogram && parsed.ratingHistogram) ratingHistogram = parsed.ratingHistogram;
    let oldestOnPage = null;
    for (const review of parsed.reviews) {
      const time = review.publishedAt ? Date.parse(review.publishedAt) : null;
      if (Number.isFinite(time) && (!Number.isFinite(oldestOnPage) || time < oldestOnPage)) oldestOnPage = time;
      if (Number.isFinite(sinceTime) && Number.isFinite(time) && time <= sinceTime) { older += 1; continue; }
      reviews.set(review.id, review);
    }
    const next = nextApplePage(parsed.continuationUrl, appId, url);
    if (parsed.continuationUrl != null && !next) { error = 'next page link is not valid'; break; }
    if (!next) { complete = true; break; }
    if (Number.isFinite(sinceTime) && Number.isFinite(oldestOnPage) && oldestOnPage <= sinceTime) { complete = true; watermark = true; break; }
    if (seen.has(next)) { error = 'next page repeated'; break; }
    seen.add(next);
    url = next;
  }
  if (!error && !complete) error = 'fetch timeout reached';
  return { reviews: [...reviews.values()], pages, skipped, older, watermark, title, rating, ratingCount, ratingHistogram, complete, error, errorStatus, errorRetryAfterMs };
}

async function collectFeed(appId, { fetchImpl, deadline, pageLimit = MAX_FEED_PAGES, since = null }) {
  const reviews = new Map();
  const sinceTime = since ? Date.parse(since) : null;
  let pages = 0, skipped = 0, older = 0, watermark = false, complete = false, error = null, errorStatus = null, errorRetryAfterMs = null;
  for (let page = 1; page <= pageLimit && Date.now() < deadline; page += 1) {
    let parsed;
    try {
      const url = `https://itunes.apple.com/id/rss/customerreviews/page=${page}/id=${encodeURIComponent(appId)}/sortby=mostrecent/json`;
      parsed = parseAppleRss(await fetchText(url, { fetchImpl, timeoutMs: Math.max(1000, Math.min(12000, deadline - Date.now())), accept: 'application/json' }), appId);
    } catch (cause) {
      error = cause.message;
      errorStatus = cause.httpStatus ?? null;
      errorRetryAfterMs = cause.retryAfterMs ?? null;
      break;
    }
    skipped += parsed.skipped;
    pages = page;
    if (!parsed.reviews.length) { complete = true; break; }
    let oldestOnPage = null;
    for (const review of parsed.reviews) {
      const time = review.publishedAt ? Date.parse(review.publishedAt) : null;
      if (Number.isFinite(time) && (!Number.isFinite(oldestOnPage) || time < oldestOnPage)) oldestOnPage = time;
      if (Number.isFinite(sinceTime) && Number.isFinite(time) && time <= sinceTime) { older += 1; continue; }
      reviews.set(review.id, review);
    }
    if (Number.isFinite(sinceTime) && Number.isFinite(oldestOnPage) && oldestOnPage <= sinceTime) { complete = true; watermark = true; break; }
  }
  if (!error && !complete) error = 'the feed may not be exhausted within the page/time limit';
  return { reviews: [...reviews.values()], pages, skipped, older, watermark, complete, error, errorStatus, errorRetryAfterMs };
}

export async function fetchAppStoreReviews(appId, candidate = {}, { fetchImpl = fetch, budgetMs = 22000, since = null } = {}) {
  if (!/^\d+$/.test(String(appId))) throw new Error('the App Store ID is not valid');
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const watermark = since && Number.isFinite(Date.parse(since)) ? since : null;
  const [shelfResult, feedResult, listingResult] = await Promise.allSettled([
    collectShelf(String(appId), { fetchImpl, deadline, since: watermark }),
    collectFeed(String(appId), { fetchImpl, deadline, since: watermark }),
    fetchItunesListing(String(appId), { fetchImpl, timeoutMs: Math.min(8000, deadline - Date.now()) }),
  ]);
  const listing = listingResult.status === 'fulfilled' ? listingResult.value : null;
  const listingError = listingResult.status === 'fulfilled' ? null : (listingResult.reason?.message || 'the store listing text could not be read');
  const shelf = shelfResult.status === 'fulfilled'
    ? shelfResult.value
    : { reviews: [], pages: 0, skipped: 0, complete: false, error: shelfResult.reason?.message || 'the shelf page fetch did not complete', errorStatus: shelfResult.reason?.httpStatus ?? null, errorRetryAfterMs: shelfResult.reason?.retryAfterMs ?? null };
  const feed = feedResult.status === 'fulfilled'
    ? feedResult.value
    : { reviews: [], pages: 0, skipped: 0, complete: false, error: feedResult.reason?.message || 'the feed fetch did not complete', errorStatus: feedResult.reason?.httpStatus ?? null, errorRetryAfterMs: feedResult.reason?.retryAfterMs ?? null };
  const merged = new Map();
  for (const review of shelf.reviews) merged.set(review.id, review);
  for (const review of feed.reviews) if (!merged.has(review.id)) merged.set(review.id, review);
  const reviews = [...merged.values()].sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    return right - left || a.id.localeCompare(b.id);
  });
  const issues = [shelf.error && `halaman ulasan: ${shelf.error}`, feed.error && `feed ulasan: ${feed.error}`]
    .filter(Boolean);
  const complete = shelf.complete && feed.complete && !shelf.skipped && !feed.skipped;
  const status = reviews.length === 0 && shelf.error && feed.error ? 'error' : reviews.length === 0 ? 'empty' : complete && !issues.length ? 'success' : 'partial';
  const shared = [...new Set(shelf.reviews.map(review => review.id))].filter(id => feed.reviews.some(review => review.id === id)).length;
  const skippedTotal = shelf.skipped + feed.skipped;
  return {
    id: 'appstore',
    status,
    reviews,
    fetched: reviews.length,
    appId: String(appId),
    app: {
      title: shelf.title || candidate.title || null,
      developer: candidate.developer || null,
      url: candidate.url || appStoreUrl(String(appId)),
      score: shelf.rating ?? (Number.isFinite(candidate.score) ? candidate.score : null),
      ratings: shelf.ratingCount ?? (Number.isFinite(candidate.ratings) ? candidate.ratings : null),
      ratingHistogram: shelf.ratingHistogram,
      listing,
    },
    coverage: {
      shelfPages: shelf.pages,
      feedPages: feed.pages,
      shelfReviews: shelf.reviews.length,
      feedReviews: feed.reviews.length,
      sharedReviews: shared,
      feedOnly: feed.reviews.filter(review => !shelf.reviews.some(item => item.id === review.id)).length,
      skipped: skippedTotal,
      olderSkipped: (shelf.older || 0) + (feed.older || 0),
      incremental: Boolean(watermark) && Boolean(shelf.watermark || feed.watermark),
      since: watermark || null,
      shelfError: shelf.error || null,
      feedError: feed.error || null,
      listingError,
    },
    limits: {
      issues: [
        shelf.error && { source: 'shelf review pages', text: shelf.error, httpStatus: shelf.errorStatus, retryAfterMs: shelf.errorRetryAfterMs },
        feed.error && { source: 'customer feed', text: feed.error, httpStatus: feed.errorStatus, retryAfterMs: feed.errorRetryAfterMs },
        skippedTotal > 0 && {
          source: 'parser',
          text: `data structure: ${skippedTotal} items could not be used as reviews and were dropped`,
          httpStatus: null,
          retryAfterMs: null,
        },
      ].filter(Boolean),
      paths: [
        { label: 'shelf review pages', pages: shelf.pages, rows: shelf.reviews.length, skipped: shelf.skipped, complete: shelf.complete, error: shelf.error || null },
        { label: 'customer feed', pages: feed.pages, rows: feed.reviews.length, skipped: feed.skipped, complete: feed.complete, error: feed.error || null },
      ],
    },
    budgetMs,
    elapsedMs: Date.now() - startedAt,
    message: status === 'error'
      ? `App Store could not be read: ${issues.join('; ')}. This is a source failure, not zero reviews.`
      : status === 'empty'
        ? `App Store responded, but no public written review came back for this app. That is not proof the app has no reviews.${skippedTotal ? ` ${skippedTotal} items were received but could not be used as a review and were dropped.` : ''}`
        : `${reviews.length} App Store reviews were read from the public review pages (${shelf.pages} pages) and the customer feed (${feed.pages} pages); ${shared} reviews were confirmed by both paths.${issues.length ? ` Result not complete: ${issues.join('; ')}.` : ' Both paths finished reading.'}${skippedTotal ? ` ${skippedTotal} items could not be used as a review and were dropped, so coverage is smaller.` : ''}`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
