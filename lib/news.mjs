// Kanal "ulasan internet" tanpa kunci: suaka RSS publik (Google News pencarian + suaka
// tambahan dari environment). Tidak ada batas jumlah di sisi kita — kalau hasil berhenti,
// itu batas sumber yang dilaporkan apa adanya.
import { createHash } from 'node:crypto';
import { coreTerms, nameTokens } from './name-match.mjs';

const REQUEST_MS = 15000;
const MAX_TEXT_CHARS = 1500;

const httpsFeed = value => {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

const hostOf = value => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return 'N/A';
  }
};

const errorMessage = cause => String(cause?.message || cause || 'unknown error').slice(0, 200);

const httpStatusOf = cause => {
  const match = /HTTP (\d{3})|status code (\d{3})/i.exec(String(cause?.message || ''));
  const status = Number(match?.[1] || match?.[2]);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
};

export function newsQuery(entity, { locale = 'id', country = 'ID' } = {}) {
  const term = String(entity || '').trim();
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`"${term}"`)}&hl=${locale}&gl=${country}&ceid=${country}:${locale}`;
}

// Kredensial tidak diperlukan; suaka tambahan hanyalah daftar URL yang boleh dibaca.
export function newsConfiguration(env = process.env) {
  const raw = [...new Set(String(env.NEWS_RSS_URLS || '').split(',').map(value => value.trim()).filter(Boolean))];
  const extra = raw.filter(httpsFeed);
  return {
    status: 'ready',
    extraFeeds: extra,
    rejectedFeeds: raw.length - extra.length,
    message: extra.length
      ? `${extra.length} extra feed(s) are read besides the Google News search.${raw.length > extra.length ? ` ${raw.length - extra.length} address(es) were ignored because they are not HTTPS.` : ''}`
      : 'Only the Google News search is used. Add NEWS_RSS_URLS in the server environment to read specific media feeds.',
  };
}

const fieldOf = (block, names) => {
  for (const name of names) {
    const found = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return '';
};

const decode = value => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

export function parseFeed(xml) {
  const blocks = [...String(xml || '').matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(match => match[0]);
  return blocks.map((block, index) => {
    const href = /<link[^>]*href\s*=\s*["']([^"']+)["']/i.exec(block);
    const link = decode(href?.[1] || fieldOf(block, ['link'])).trim();
    const stampRaw = fieldOf(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']);
    const title = decode(fieldOf(block, ['title', 'media:title']));
    const summary = decode(fieldOf(block, ['description', 'summary', 'content:encoded', 'content']));
    const key = decode(fieldOf(block, ['guid', 'id'])) || link || `${title}|${index}`;
    return {
      title,
      summary,
      link: httpsFeed(link) ? link : '',
      publishedAt: Number.isFinite(Date.parse(stampRaw)) ? new Date(stampRaw).toISOString() : null,
      author: decode(fieldOf(block, ['author', 'dc:creator'])),
      outlet: decode(fieldOf(block, ['source'])),
      key,
    };
  });
}

function mentionMatcher(entity) {
  const terms = coreTerms(entity);
  return text => {
    const tokens = new Set(nameTokens(text));
    return terms.length > 0 && terms.every(term => tokens.has(term));
  };
}

async function fetchFeed(url, fetchImpl, deadline) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_MS, deadline - Date.now()))),
  });
  if (!response.ok) {
    const retry = Number(response.headers?.get?.('retry-after'));
    throw Object.assign(new Error(`source returned HTTP ${response.status}`), {
      httpStatus: response.status,
      retryAfterMs: Number.isFinite(retry) && retry >= 0 && retry <= 900 ? retry * 1000 : null,
    });
  }
  return response.text();
}

export async function fetchNewsReviews(entity, { env = process.env, fetchImpl = fetch, budgetMs = 18000, feeds = null } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const config = feeds ? { status: 'ready', extraFeeds: feeds, rejectedFeeds: 0, message: '' } : newsConfiguration(env);
  const urls = [newsQuery(entity), ...config.extraFeeds];
  const matches = mentionMatcher(entity);
  const rows = new Map();
  const issues = [];
  const paths = [];
  let itemsRead = 0;
  let notAbout = 0;
  let invalid = 0;

  for (const url of urls) {
    const host = hostOf(url);
    let items = [];
    try {
      if (Date.now() >= deadline) {
        issues.push(`${host}: the channel time budget ran out before this feed was read`);
        paths.push({ label: host, pages: 0, rows: 0, added: 0, skipped: 0, complete: false, error: 'time budget ran out' });
        continue;
      }
      items = parseFeed(await fetchFeed(url, fetchImpl, deadline));
      if (!items.length) issues.push(`${host}: the feed returned zero items`);
    } catch (cause) {
      const status = httpStatusOf(cause);
      issues.push(`${host}: ${errorMessage(cause)}${status ? ` (HTTP ${status})` : ''}`);
      paths.push({
        label: host,
        pages: 0,
        rows: 0,
        added: 0,
        skipped: 0,
        complete: false,
        error: errorMessage(cause),
        httpStatus: status,
      });
      continue;
    }
    let added = 0;
    for (const item of items) {
      itemsRead += 1;
      const text = [item.title, item.summary].filter(Boolean).join('. ');
      if (!text) { invalid += 1; continue; }
      if (!matches(text)) { notAbout += 1; continue; }
      const id = `news-${createHash('sha256').update(`${host}|${item.key}`).digest('hex').slice(0, 32)}`;
      if (rows.has(id)) continue;
      const outlet = item.outlet || hostOf(item.link) || host;
      rows.set(id, {
        id,
        platform: 'news',
        author: item.author || outlet,
        title: item.title || null,
        text: text.slice(0, MAX_TEXT_CHARS),
        rating: null,
        date: item.publishedAt ? item.publishedAt.slice(0, 10) : null,
        publishedAt: item.publishedAt,
        sourceUrl: item.link || null,
        store: outlet,
        language: 'id',
        meta: { via: 'news-rss', feedHost: host },
      });
      added += 1;
    }
    paths.push({ label: host, pages: 1, rows: items.length, added, skipped: 0, complete: true, error: null });
  }

  const reviews = [...rows.values()];
  const truncated = paths.some(path => !path.complete);
  const status = reviews.length === 0 && issues.length ? 'error' : reviews.length === 0 ? 'empty' : issues.length || truncated ? 'partial' : 'success';
  const capNote = 'Google News cuts its results on the source side (around one hundred search headlines) and offers no pagination; a number below that is not a limit of this app.';
  return {
    id: 'news',
    status,
    reviews,
    fetched: reviews.length,
    appId: null,
    app: { title: `${entity} in online news`, developer: null, url: newsQuery(entity), score: null, ratingCount: null, reviewCountReported: null, installs: null, ratingHistogram: null, ratingHistogramTotal: null },
    coverage: {
      feeds: urls.length,
      feedsRead: paths.filter(path => path.complete).length,
      itemsRead,
      notAbout,
      skipped: invalid,
      productMatches: reviews.length,
      sampleLimit: null,
      reportedReviewCount: null,
      reportedRatingCount: null,
    },
    limits: {
      issues: issues.map(text => ({ source: 'RSS feed', text })),
      paths,
    },
    budgetMs,
    elapsedMs: Date.now() - startedAt,
    message: status === 'error'
      ? `The news feed could not be read: ${issues.join('; ')}. This is a source failure, not proof that no coverage of ${entity} exists.`
      : `${reviews.length} headline/summary items mention "${entity}" out of ${itemsRead} entries on ${paths.filter(path => path.complete).length} RSS feed(s); ${notAbout} entries did not mention this entity so they were not stored.${issues.length ? ` Some feeds failed: ${issues.join('; ')}.` : ''} ${capNote} News is not a customer review: it uses no stars and is not counted as customer sentiment.`,
    truncated,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
