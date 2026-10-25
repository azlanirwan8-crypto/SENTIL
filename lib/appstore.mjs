// Sumber publik App Store tanpa API key: iTunes Search untuk penemuan, halaman ulasan
// publik untuk ulasan, dan feed pelanggan RSS sebagai jalur silang.
const MAX_SHELF_PAGES = 30;
const MAX_FEED_PAGES = 10;

export const appStoreUrl = (appId, country = 'id') => `https://apps.apple.com/${country}/app/id${encodeURIComponent(appId)}?see-all=reviews&platform=iphone`;

const httpError = status => new Error(`sumber mengembalikan HTTP ${status}`);
const parseError = message => new Error(`parse_error: ${message}`);

async function fetchText(url, { fetchImpl = fetch, timeoutMs = 15000, accept = 'text/html,application/xhtml+xml' } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; SentimentIntelligence/1.0; +https://github.com/azlanirwan8-crypto/analisa)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`network_error: ${error.name === 'TimeoutError' || error.name === 'AbortError' ? 'permintaan melewati batas waktu' : error.message}`);
  }
  if (!response.ok) throw httpError(response.status);
  return response.text();
}

async function fetchJson(url, options) {
  const text = await fetchText(url, { ...options, accept: 'application/json' });
  try { return JSON.parse(text); } catch { throw parseError('respons bukan JSON yang sah'); }
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
  if (term.length < 2) throw new Error('nama aplikasi minimal dua karakter');
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=id&entity=software&limit=8`;
  const payload = await fetchJson(url, { fetchImpl, timeoutMs });
  if (!Array.isArray(payload.results)) throw parseError('hasil pencarian App Store tidak berbentuk daftar');
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

export function parseApplePage(html, appId) {
  const scripts = [...String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const script = scripts.find(match => /\bid=["']serialized-server-data["']/i.test(match[1]));
  if (!script) throw parseError('data ulasan App Store tidak ditemukan');
  let root;
  try { root = JSON.parse(script[2]); } catch { throw parseError('data ulasan App Store bukan JSON yang sah'); }
  if (!Array.isArray(root.data)) throw parseError('struktur data App Store berubah');
  const candidates = root.data.filter(item => item?.intent?.id === appId && item?.data?.shelfMapping);
  const page = candidates.find(item => item.data.shelfMapping.allProductReviews)?.data || candidates[0]?.data;
  const shelf = page?.shelfMapping?.allProductReviews;
  const listing = page?.shelfMapping?.productRatings?.items?.[0];
  if (!Array.isArray(shelf?.items)) throw parseError('bagian ulasan App Store tidak ditemukan');
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
      if (normalized) reviews.push(normalized);
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
  try { feed = JSON.parse(text).feed; } catch { throw parseError('struktur feed ulasan App Store berubah'); }
  if (!feed) throw parseError('feed ulasan App Store tidak ditemukan');
  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const reviews = [];
  let skipped = 0;
  for (const entry of entries) {
    if (entry?.id?.label == null) continue;
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
      if (normalized) reviews.push(normalized);
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

async function collectShelf(appId, { fetchImpl, deadline, pageLimit = MAX_SHELF_PAGES }) {
  const reviews = new Map();
  let url = appStoreUrl(appId);
  const seen = new Set([url]);
  let pages = 0, skipped = 0, title = null, rating = null, ratingCount = null, ratingHistogram = null, complete = false, error = null;
  while (Date.now() < deadline) {
    if (pages >= pageLimit) { error = 'batas halaman keamanan tercapai'; break; }
    let parsed;
    try {
      parsed = parseApplePage(await fetchText(url, { fetchImpl, timeoutMs: Math.max(1000, Math.min(15000, deadline - Date.now())) }), appId);
    } catch (cause) { error = cause.message; break; }
    pages += 1;
    skipped += parsed.skipped;
    if (parsed.title) title = parsed.title;
    if (parsed.rating != null) rating = parsed.rating;
    if (parsed.ratingCount != null) ratingCount = parsed.ratingCount;
    if (!ratingHistogram && parsed.ratingHistogram) ratingHistogram = parsed.ratingHistogram;
    for (const review of parsed.reviews) reviews.set(review.id, review);
    const next = nextApplePage(parsed.continuationUrl, appId, url);
    if (parsed.continuationUrl != null && !next) { error = 'tautan halaman berikutnya tidak sah'; break; }
    if (!next) { complete = true; break; }
    if (seen.has(next)) { error = 'halaman berikutnya berulang'; break; }
    seen.add(next);
    url = next;
  }
  if (!error && !complete) error = 'batas waktu pengambilan tercapai';
  return { reviews: [...reviews.values()], pages, skipped, title, rating, ratingCount, ratingHistogram, complete, error };
}

async function collectFeed(appId, { fetchImpl, deadline, pageLimit = MAX_FEED_PAGES }) {
  const reviews = new Map();
  let pages = 0, skipped = 0, complete = false, error = null;
  for (let page = 1; page <= pageLimit && Date.now() < deadline; page += 1) {
    let parsed;
    try {
      const url = `https://itunes.apple.com/id/rss/customerreviews/page=${page}/id=${encodeURIComponent(appId)}/sortby=mostrecent/json`;
      parsed = parseAppleRss(await fetchText(url, { fetchImpl, timeoutMs: Math.max(1000, Math.min(12000, deadline - Date.now())), accept: 'application/json' }), appId);
    } catch (cause) { error = cause.message; break; }
    skipped += parsed.skipped;
    pages = page;
    if (!parsed.reviews.length) { complete = true; break; }
    for (const review of parsed.reviews) reviews.set(review.id, review);
  }
  if (!error && !complete) error = 'feed belum tentu habis dalam batas halaman/waktu';
  return { reviews: [...reviews.values()], pages, skipped, complete, error };
}

export async function fetchAppStoreReviews(appId, candidate = {}, { fetchImpl = fetch, budgetMs = 22000 } = {}) {
  if (!/^\d+$/.test(String(appId))) throw new Error('ID App Store tidak valid');
  const deadline = Date.now() + budgetMs;
  const [shelfResult, feedResult] = await Promise.allSettled([
    collectShelf(String(appId), { fetchImpl, deadline }),
    collectFeed(String(appId), { fetchImpl, deadline }),
  ]);
  const shelf = shelfResult.status === 'fulfilled' ? shelfResult.value : { reviews: [], pages: 0, skipped: 0, complete: false, error: shelfResult.reason.message };
  const feed = feedResult.status === 'fulfilled' ? feedResult.value : { reviews: [], pages: 0, skipped: 0, complete: false, error: feedResult.reason.message };
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
    },
    coverage: {
      shelfPages: shelf.pages,
      feedPages: feed.pages,
      shelfReviews: shelf.reviews.length,
      feedReviews: feed.reviews.length,
      sharedReviews: shared,
      feedOnly: feed.reviews.filter(review => !shelf.reviews.some(item => item.id === review.id)).length,
      skipped: shelf.skipped + feed.skipped,
    },
    message: status === 'error'
      ? `App Store tidak dapat dibaca: ${issues.join('; ')}. Ini kegagalan sumber, bukan nol ulasan.`
      : status === 'empty'
        ? 'App Store terhubung, tetapi tidak ada ulasan tertulis publik yang dikembalikan untuk aplikasi ini. Ini bukan berarti aplikasi tidak memiliki ulasan.'
        : `${reviews.length} ulasan App Store dibaca dari halaman ulasan publik (${shelf.pages} halaman) dan feed pelanggan (${feed.pages} halaman); ${shared} ulasan dikonfirmasi kedua jalur.${issues.length ? ` Hasil belum lengkap: ${issues.join('; ')}.` : ' Kedua jalur selesai dibaca.'}`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
