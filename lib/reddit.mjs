// Kanal Reddit. Jalur publik tanpa kunci (www/old/api.reddit.com .json dan .rss) terbukti
// diblokir HTTP 403 dari jaringan server ini, jadi satu-satunya jalan yang jujur adalah
// OAuth2 aplikasi Reddit (gratuit, tapi butuh client id + secret di environment server).
const REQUEST_MS = 15000;
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';
const MAX_TEXT_CHARS = 8000;
const UA = 'sentil:public-review-analysis:v1 (sentiment analysis research)';

const errorMessage = cause => String(cause?.message || cause || 'unknown error').slice(0, 220);

export function redditConfiguration(env = process.env) {
  const clientId = String(env.REDDIT_CLIENT_ID || '').trim();
  const clientSecret = String(env.REDDIT_CLIENT_SECRET || '').trim();
  const subreddits = [...new Set(String(env.REDDIT_SUBREDDITS || '').split(/[\s,]+/).map(v => v.trim().replace(/^r\//, '')).filter(Boolean))];
  return {
    clientId,
    clientSecret,
    subreddits,
    status: clientId && clientSecret ? 'ready' : 'needs_setup',
    message: clientId && clientSecret
      ? `Reddit app credentials are present in the server environment${subreddits.length ? ` and the search is limited to ${subreddits.length} registered subreddit(s)` : ' so the search uses the Reddit global index'}. This does not mean a connection until a token is actually obtained.`
      : 'Reddit refuses the public path without a key (HTTP 403 on www.reddit.com, old.reddit.com, api.reddit.com and the .rss feeds — verified 26 October 2026). This channel needs a free Reddit app with REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in the server environment. No request was sent, so no comment was invented.',
  };
}

async function getToken(config, fetchImpl, deadline) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': UA,
      },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_MS, deadline - Date.now()))),
    });
  } catch (cause) {
    throw new Error(`network_error: Reddit could not be reached (${errorMessage(cause)})`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw Object.assign(
      new Error(`source returned HTTP ${response.status} on the token exchange${response.status === 401 ? ' (Reddit credentials refused)' : ''}`),
      { httpStatus: response.status, retryAfterMs: retryAfter(response) },
    );
  }
  let token = null;
  try { token = JSON.parse(text)?.access_token; } catch { throw new Error('parse_error: the Reddit token response is not JSON'); }
  if (typeof token !== 'string' || !token) throw new Error('parse_error: Reddit did not send an access_token');
  return token;
}

const retryAfter = response => {
  const seconds = Number(response.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 900 ? seconds * 1000 : null;
};

async function apiGet(path, token, fetchImpl, deadline) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': UA },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_MS, deadline - Date.now()))),
    });
  } catch (cause) {
    throw new Error(`network_error: the Reddit request did not complete (${errorMessage(cause)})`);
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(`source returned HTTP ${response.status}${response.status === 429 ? ' (request limit reached)' : response.status === 403 ? ' (Reddit access denied)' : ''}`),
      { httpStatus: response.status, retryAfterMs: retryAfter(response) },
    );
  }
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error('parse_error: the Reddit response is not JSON'); }
}

function listingRows(payload, platform, retrievedAt, counts) {
  const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
  const rows = [];
  for (const child of children) {
    const post = child?.data;
    const id = typeof post?.id === 'string' ? post.id : null;
    if (!id) { counts.invalid += 1; continue; }
    const text = [post.title, post.selftext].filter(part => typeof part === 'string' && part.trim()).join('. ');
    if (!text.trim()) { counts.empty += 1; continue; }
    const stamp = typeof post.created_utc === 'number' ? new Date(post.created_utc * 1000).toISOString() : null;
    rows.push({
      id: `reddit-${id}`,
      platform,
      author: typeof post.author === 'string' && post.author.trim() ? post.author : 'N/A',
      title: typeof post.title === 'string' ? post.title.slice(0, 400) : null,
      text: text.slice(0, MAX_TEXT_CHARS),
      rating: null,
      date: stamp ? stamp.slice(0, 10) : null,
      publishedAt: stamp,
      sourceUrl: `https://www.reddit.com${post.permalink || `/r/${post.subreddit}/comments/${id}/`}`,
      store: typeof post.subreddit === 'string' ? `r/${post.subreddit}` : 'Reddit',
      language: typeof post.lang === 'string' ? post.lang : null,
      meta: { via: 'reddit-oauth', score: Number.isInteger(post.score) ? post.score : null, numComments: Number.isInteger(post.num_comments) ? post.num_comments : null },
    });
  }
  return rows;
}

export async function fetchRedditReviews(entity, { env = process.env, fetchImpl = fetch, budgetMs = 20000, target = null } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const config = target?.reddit ? { ...redditConfiguration(env), ...target.reddit } : redditConfiguration(env);
  const base = {
    id: 'reddit',
    status: 'needs_setup',
    reviews: [],
    fetched: 0,
    appId: null,
    app: null,
    coverage: null,
    limits: { issues: [], paths: [] },
    budgetMs,
    elapsedMs: 0,
    truncated: true,
    error: null,
    cached: false,
  };
  if (config.status !== 'ready') return { ...base, message: config.message, elapsedMs: Date.now() - startedAt };

  const issues = [];
  const paths = [];
  const counts = { invalid: 0, empty: 0 };
  const rows = new Map();
  let token = null;
  try {
    token = await getToken(config, fetchImpl, deadline);
  } catch (cause) {
    issues.push(`token: ${errorMessage(cause)}`);
    return {
      ...base,
      status: 'error',
      coverage: { listingsRead: 0, postsRead: 0, skipped: counts.invalid + counts.empty, sampleLimit: null, reportedReviewCount: null, reportedRatingCount: null },
      limits: { issues: issues.map(text => ({ source: 'Reddit OAuth', text, httpStatus: cause?.httpStatus ?? null })), paths: [{ label: 'token exchange', pages: 0, rows: 0, added: 0, skipped: 0, complete: false, error: errorMessage(cause) }] },
      elapsedMs: Date.now() - startedAt,
      message: `Reddit refused the app credentials: ${issues.join('; ')}. No search request was sent.`,
      error: issues[0],
    };
  }

  const scopes = config.subreddits.length ? config.subreddits.map(name => ({ label: `r/${name}`, path: `/r/${name}/search`, params: { restrict_sr: 1 } })) : [{ label: 'global search', path: '/search', params: {} }];
  let listingsRead = 0;
  for (const scope of scopes) {
    if (Date.now() >= deadline) {
      issues.push('the Reddit time budget ran out before every path was read');
      paths.push({ label: scope.label, pages: 0, rows: 0, added: 0, skipped: 0, complete: false, error: 'timeout reached' });
      continue;
    }
    let after = null;
    let pages = 0;
    let added = 0;
    let complete = false;
    let scopeError = null;
    for (;;) {
      const query = new URL(`${API}${scope.path}`);
      query.searchParams.set('q', `"${entity}"`);
      query.searchParams.set('sort', 'new');
      query.searchParams.set('limit', '100');
      for (const [key, value] of Object.entries(scope.params)) query.searchParams.set(key, String(value));
      if (after) query.searchParams.set('after', after);
      try {
        const payload = await apiGet(query.pathname + query.search, token, fetchImpl, deadline);
        const found = listingRows(payload, 'reddit', new Date(startedAt).toISOString(), counts);
        pages += 1;
        listingsRead += 1;
        for (const row of found) {
          if (rows.has(row.id)) continue;
          rows.set(row.id, row);
          added += 1;
        }
        after = typeof payload?.data?.after === 'string' ? payload.data.after : null;
        if (!after) { complete = true; break; }
        if (Date.now() >= deadline) { scopeError = 'fetch timeout reached'; issues.push(`${scope.label}: ${scopeError}`); break; }
      } catch (cause) {
        scopeError = errorMessage(cause);
        issues.push(`${scope.label}: ${scopeError}`);
        break;
      }
      if (pages >= 25) { scopeError = 'safety page cap of 25 reached'; issues.push(`${scope.label}: ${scopeError}`); break; }
    }
    paths.push({ label: scope.label, pages, rows: added, added, skipped: 0, complete, error: scopeError });
  }

  const reviews = [...rows.values()];
  const truncated = paths.some(path => !path.complete);
  const complete = !issues.length && !truncated && paths.length > 0;
  const status = reviews.length === 0 && issues.length ? 'error' : reviews.length === 0 ? 'empty' : complete ? 'success' : 'partial';

  return {
    ...base,
    status,
    reviews,
    fetched: reviews.length,
    appId: null,
    app: {
      title: `${entity} on Reddit`,
      developer: config.subreddits.length ? config.subreddits.map(name => `r/${name}`).join(', ') : 'Reddit global index',
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(`"${entity}"`)}`,
      score: null,
      ratingCount: null,
      reviewCountReported: null,
      ratingHistogram: null,
    },
    coverage: {
      listingsRead,
      postsRead: reviews.length,
      skipped: counts.invalid + counts.empty,
      invalid: counts.invalid,
      emptyBody: counts.empty,
      sampleLimit: null,
      reportedReviewCount: null,
      reportedRatingCount: null,
    },
    limits: { issues: issues.map(text => ({ source: 'Reddit API', text })), paths },
    elapsedMs: Date.now() - startedAt,
    message: `${reviews.length} Reddit threads mentioning "${entity}" were read from ${listingsRead} listing pages on ${paths.length} search path(s).${counts.invalid ? ` ${counts.invalid} items without an ID were dropped.` : ''}${counts.empty ? ` ${counts.empty} items without text were dropped.` : ''}${issues.length ? ` Some paths stopped: ${issues.join('; ')}.` : ' Every path finished reading.'} Reddit uses no stars, so threads are not counted as ratings.`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
  };
}
