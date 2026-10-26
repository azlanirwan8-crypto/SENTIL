// Kanal sosial lewat Apify (Facebook, Instagram, TikTok, X). Token hanya dibaca dari
// environment server. Actor berjalan asinkron: kalau anggaran function habis sebelum
// run selesai, run ID disimpan di memori instance dan penarikan berikutnya menyambungnya,
// bukan memulai duplikat yang menagih biaya lagi.
import { createHash } from 'node:crypto';
import { coreTerms, nameTokens } from './name-match.mjs';

const API = 'https://api.apify.com/v2';
const REQUEST_MS = 25000;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const PAGE_LIMIT = 1000;
const POLL_MS = 4000;
const MAX_TEXT_CHARS = 8000;

const TEXT_FIELDS = ['text', 'fullText', 'caption', 'content', 'body', 'reviewText', 'comment', 'shortText'];
const AUTHOR_FIELDS = ['author', 'username', 'owner', 'nickname', 'authorName', 'reviewerName', 'user', 'handle', 'authorMeta'];
const ID_FIELDS = ['id', '_id', 'uniqueId', 'tweetId', 'idInline', 'reviewId'];
const URL_FIELDS = ['url', 'link', 'permalink', 'tweetUrl', 'webVideoUrl', 'reviewUrl'];
const CAP_FIELDS = ['maxItems', 'resultsLimit', 'resultsPerPage', 'maxResult', 'requestsPerCrawl', 'limit', 'topLevelCommentsPerPost', 'maxRepliesPerComment'];

export const apifyChannels = {
  facebook: { label: 'Facebook', actor: 'apify/facebook-search-scraper', input: query => ({ categories: [query], searchType: 'posts', resultsLimit: 250 }) },
  instagram: { label: 'Instagram', actor: 'apify/instagram-scraper', input: query => ({ resultsType: 'posts', searchType: 'hashtag', search: query.replace(/\s+/g, ''), searchLimit: 250, resultsLimit: 250 }) },
  tiktok: { label: 'TikTok', actor: 'clockworks/tiktok-scraper', input: query => ({ searchQueries: query, resultsPerPage: 100, videoSearchSorting: 'LATEST', topLevelCommentsPerPost: 50, maxRepliesPerComment: 10 }) },
  x: { label: 'X / Twitter', actor: 'apidojo/tweet-scraper', input: query => ({ searchTerms: [query], sort: 'Latest', maxItems: 100 }) },
};

const errorMessage = cause => String(cause?.message || cause || 'unknown error').slice(0, 220);

const decode = value => String(value ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function pickField(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') {
      for (const nested of ['label', 'name', 'nickName', 'nickname', 'screenName', 'text', 'fullName', 'full_name', 'username']) {
        if (typeof value[nested] === 'string' && value[nested].trim()) return value[nested].trim();
      }
    }
  }
  return null;
}

function isoDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const iso = new Date(value > 1e11 ? value : value * 1000).toISOString();
    return Number.isFinite(Date.parse(iso.slice(0, 10))) ? iso : null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function rowDate(source) {
  return isoDate(source.date ?? source.createdAt ?? source.createTimeISO ?? source.createTime
    ?? source.timestamp ?? source.time ?? source.postedAt ?? source.publishedAt ?? source.creationDate ?? source.reviewDate);
}

export function apifyResultCap(input) {
  for (const field of CAP_FIELDS) {
    const value = Number(input?.[field]);
    if (Number.isInteger(value) && value > 0) return { field, value };
  }
  return null;
}

export function apifyConfiguration(env = process.env) {
  const token = String(env.APIFY_API_TOKEN || env.APIFY_TOKEN || '').trim();
  // Actor Apify menagih biaya per hasil, jadi kunci yang terpasang saja tidak cukup: pemilik
  // harus menyatakan izin tertulis lewat APIFY_ALLOWED=true. Tanpanya kanal berbayar tidak
  // pernah mengirim run, walaupun token ada — dan itu dilaporkan, bukan disenyapkan.
  const allowed = String(env.APIFY_ALLOWED || '').trim().toLowerCase() === 'true';
  return {
    token,
    allowed,
    status: !token ? 'needs_setup' : allowed ? 'ready' : 'consent_required',
    message: !token
      ? 'This social channel uses Apify as its data provider, and APIFY_API_TOKEN is not installed in the server environment. No actor run was sent, so no post or comment was invented.'
      : allowed
        ? 'An Apify token is present and the owner has set APIFY_ALLOWED=true. The Apify bill runs on the price of the chosen actor, and every actor input carries an explicit result cap.'
        : 'An Apify token is installed, but paid actor runs are switched off: set APIFY_ALLOWED=true to enable them. No actor run was sent, so no post or comment was invented.',
  };
}

async function apifyRequest(path, token, fetchImpl, options = {}, deadline = Date.now() + REQUEST_MS) {
  let response;
  try {
    response = await fetchImpl(`${API}/${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_MS, deadline - Date.now()))),
    });
  } catch (cause) {
    throw new Error(`network_error: Apify could not be reached (${errorMessage(cause)})`);
  }
  const text = await response.text();
  if (!response.ok) {
    let reason = '';
    try { reason = String(JSON.parse(text)?.error?.type ?? '').toLowerCase(); } catch { /* tubuh error tidak terurai */ }
    const labels = {
      invalidapikey: 'Apify token refused',
      tokennotfound: 'Apify token not recognised',
      paymentrequired: 'Apify payment or quota limit not sufficient',
      notfound: 'actor not found on Apify',
      validationerror: 'actor input refused by Apify',
      conflict: 'actor run conflicts with the current status',
      'rate.limit.reached': 'Apify API request limit reached',
    };
    throw Object.assign(
      new Error(`source returned HTTP ${response.status}${labels[reason] ? ` (${labels[reason]})` : ''}`),
      { httpStatus: response.status, reason, retryAfterMs: null },
    );
  }
  try { return JSON.parse(text)?.data ?? JSON.parse(text); } catch { throw new Error('parse_error: the Apify response is not valid JSON'); }
}

const schemaCache = new Map();

export async function apifyInputFields(actor, token, fetchImpl = fetch) {
  if (schemaCache.has(actor)) return schemaCache.get(actor);
  try {
    const build = await apifyRequest(`acts/${encodeURIComponent(actor)}/builds/default?expand=inputSchema`, token, fetchImpl);
    let schema = build?.inputSchema;
    if (typeof schema === 'string') { try { schema = JSON.parse(schema); } catch { schema = null; } }
    const properties = schema?.properties ?? schema?.schema?.properties;
    const fields = properties && typeof properties === 'object' ? Object.keys(properties) : null;
    if (fields) schemaCache.set(actor, fields);
    return fields || null;
  } catch {
    return null;
  }
}

export function apifyUnknownInputFields(input, fields) {
  if (!fields) return [];
  const known = new Set(fields);
  return Object.keys(input ?? {}).filter(key => key !== 'cleanInputs' && !known.has(key));
}

const datasetPathRe = /\/datasets\/([A-Za-z0-9_-]+)/;
const recordPathRe = /\/(key-value-stores|records)\//;

function safeApifyUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'apify.com' || url.hostname.endsWith('.apify.com'));
  } catch {
    return false;
  }
}

// Komentar TikTok disimpan di dataset terpisah yang ditaut dari item video. Hanya tautan HTTPS
// ke apify.com yang boleh dibaca dengan token, supaya token tidak pernah keluar ke host lain.
async function linkedDatasetIds(links, token, fetchImpl, deadline) {
  const ids = new Set();
  let failed = 0;
  for (const link of links) {
    if (Date.now() >= deadline) { failed += 1; continue; }
    const text = String(link);
    if (!safeApifyUrl(text)) { failed += 1; continue; }
    const direct = text.match(datasetPathRe);
    if (direct) { ids.add(direct[1]); continue; }
    if (!recordPathRe.test(text)) { failed += 1; continue; }
    try {
      const response = await fetchImpl(text, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response?.ok) { failed += 1; continue; }
      const body = await response.text();
      const matches = [...String(body).matchAll(new RegExp(datasetPathRe.source, 'g'))];
      if (!matches.length) failed += 1;
      for (const match of matches) ids.add(match[1]);
    } catch {
      failed += 1;
    }
  }
  return { ids: [...ids], failed };
}

async function readDatasetItems(datasetId, token, fetchImpl, deadline, issues) {
  const items = [];
  let offset = 0;
  let pages = 0;
  for (;;) {
    if (Date.now() >= deadline) { issues.push(`dataset ${datasetId} read in part: the channel time budget ran out at row ${items.length}`); break; }
    if (pages >= PAGE_LIMIT) { issues.push(`dataset ${datasetId}: safety page cap of ${PAGE_LIMIT} reached`); break; }
    let page;
    try {
      page = await apifyRequest(`datasets/${datasetId}/items?offset=${offset}&limit=1000&clean=true`, token, fetchImpl, {}, deadline);
    } catch (cause) {
      issues.push(`dataset ${datasetId}: ${errorMessage(cause)}`);
      break;
    }
    const chunk = Array.isArray(page) ? page : [];
    pages += 1;
    items.push(...chunk);
    if (chunk.length < 1000) break;
    offset += chunk.length;
  }
  return { items, pages };
}

function mentionMatcher(entity) {
  const terms = coreTerms(entity);
  return text => {
    if (!terms.length) return false;
    const tokens = new Set(nameTokens(text));
    return terms.every(term => tokens.has(term));
  };
}

function toRows(item, platform, actor, runId, retrievedAt, mentions, counters) {
  const out = [];
  const parentId = pickField(item, ID_FIELDS);
  const postUrl = pickField(item, URL_FIELDS);
  const postText = decode(pickField(item, TEXT_FIELDS));
  const postRelevant = mentions(postText);

  const collect = (source, parent) => {
    const text = decode(pickField(source, TEXT_FIELDS));
    if (!text) { counters.empty += 1; return; }
    if (!(postRelevant || mentions(text))) { counters.offTopic += 1; return; }
    const sourceId = pickField(source, ID_FIELDS);
    const when = rowDate(source);
    const rating = Number(source.rating ?? source.stars ?? source.score ?? source.starRating);
    const id = sourceId
      ? `${platform}-${sourceId}`
      : `${platform}-local-${createHash('sha256').update(`${parent ?? ''}|${text}`).digest('hex').slice(0, 32)}`;
    if (!sourceId) counters.hashedIds += 1;
    out.push({
      id,
      platform,
      author: decode(pickField(source, AUTHOR_FIELDS)) || 'N/A',
      title: null,
      text: text.slice(0, MAX_TEXT_CHARS),
      rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
      date: when ? when.slice(0, 10) : null,
      publishedAt: when,
      sourceUrl: (() => {
        const url = pickField(source, URL_FIELDS) || (parent ? postUrl : null);
        return url && safeApifyUrl(url) === false && /^https?:\/\//i.test(String(url || '')) ? url : null;
      })(),
      store: apifyChannels[platform]?.label || platform,
      language: null,
      meta: {
        via: 'apify',
        actor,
        runId,
        parentId: parent || null,
        idOrigin: sourceId ? 'platform' : 'local-hash',
      },
    });
  };

  collect(item, null);
  for (const key of ['comments', 'reviews']) {
    if (Array.isArray(item?.[key])) for (const child of item[key]) if (child && typeof child === 'object') collect(child, parentId);
  }
  return out;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchApifyReviews(id, entity, {
  env = process.env,
  fetchImpl = fetch,
  budgetMs = 45000,
  resumeRunId = null,
  onRunId = () => {},
} = {}) {
  const channel = apifyChannels[id];
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const config = apifyConfiguration(env);
  const base = {
    id,
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
  if (!channel) throw new Error(`channel ${id} is not known to Apify`);
  if (config.status !== 'ready') return { ...base, message: config.message, elapsedMs: Date.now() - startedAt };

  const issues = [];
  const query = `"${entity}"`;
  const input = channel.input(query);
  const cap = apifyResultCap(input);
  const knownFields = await apifyInputFields(channel.actor, config.token, fetchImpl);
  const unknownFields = apifyUnknownInputFields(input, knownFields);
  if (unknownFields.length) issues.push(`actor input rejected by the schema: ${unknownFields.join(', ')} is unknown to ${channel.actor}`);

  let runId = resumeRunId;
  let runStatus = null;
  try {
    if (!runId) {
      const run = await apifyRequest(`acts/${encodeURIComponent(channel.actor)}/runs`, config.token, fetchImpl, { method: 'POST', body: JSON.stringify(input) }, deadline);
      runId = run?.data?.id || run?.id || null;
      if (!runId) throw new Error('parse_error: Apify returned no run ID');
      onRunId(runId);
      runStatus = run?.data?.status || run?.status || 'READY';
    }
    while (runStatus !== 'SUCCEEDED') {
      if (Date.now() >= deadline) {
        issues.push(`run ${runId} was still ${runStatus || 'running'} when the function time budget ran out; the next pull resumes the same run instead of starting a new one`);
        return {
          ...base,
          status: 'partial',
          app: { title: `${entity} on ${channel.label}`, developer: `Apify actor ${channel.actor}`, url: `https://console.apify.com/actors/${channel.actor}/runs`, score: null, ratingCount: null, reviewCountReported: null },
          coverage: { actor: channel.actor, runId, runStatus: runStatus || 'RUNNING', itemsRead: 0, productMatches: 0, offTopic: 0, skipped: 0, sampleLimit: cap ? `${cap.field}=${cap.value}` : null, datasetPages: 0 },
          limits: { issues: issues.map(text => ({ source: channel.label, text })), paths: [{ label: channel.actor, pages: 0, rows: 0, added: 0, skipped: 0, complete: false, error: 'run not finished' }] },
          elapsedMs: Date.now() - startedAt,
          message: `The actor run ${channel.actor} did not finish within ${Math.round(budgetMs / 1000)} seconds. Run ID ${runId} was recorded; press Pull data again to fetch its result. No data was invented while the run was going.`,
          error: issues[0],
        };
      }
      await wait(POLL_MS);
      const status = await apifyRequest(`actor-runs/${encodeURIComponent(runId)}`, config.token, fetchImpl, {}, deadline);
      runStatus = status?.data?.status || status?.status || 'RUNNING';
      if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(runStatus)) {
        issues.push(`run ${runId} ended ${runStatus}: ${String(status?.data?.statusMessage || status?.statusMessage || 'no message from the actor')}`);
        break;
      }
    }
  } catch (cause) {
    issues.push(errorMessage(cause));
    const status = /needs_setup|token/i.test(String(cause?.message)) ? 'error' : 'error';
    return {
      ...base,
      status,
      app: null,
      coverage: { actor: channel.actor, runId: runId || null, itemsRead: 0, productMatches: 0, offTopic: 0, skipped: 0, sampleLimit: cap ? `${cap.field}=${cap.value}` : null, datasetPages: 0 },
      limits: { issues: issues.map(text => ({ source: channel.label, text, httpStatus: cause?.httpStatus ?? null })), paths: [{ label: channel.actor, pages: 0, rows: 0, added: 0, skipped: 0, complete: false, error: errorMessage(cause) }] },
      elapsedMs: Date.now() - startedAt,
      message: `${channel.label} could not be read: ${issues.join('; ')}. This is a source or credential failure, not proof that no post exists.`,
      error: issues[0],
    };
  }

  const counters = { empty: 0, offTopic: 0, hashedIds: 0 };
  const mentions = mentionMatcher(entity);
  const retrievedAt = new Date(startedAt).toISOString();
  const rows = new Map();
  let itemsRead = 0;
  let datasetPages = 0;
  let linkedFailed = 0;

  if (runStatus === 'SUCCEEDED') {
    const run = await apifyRequest(`actor-runs/${encodeURIComponent(runId)}`, config.token, fetchImpl, {}, deadline).catch(() => null);
    const datasetId = run?.output?.defaultDatasetId || run?.data?.output?.defaultDatasetId || null;
    if (!datasetId) issues.push(`run ${runId} succeeded but pointed at no output dataset`);
    else {
      const read = await readDatasetItems(datasetId, config.token, fetchImpl, deadline, issues);
      itemsRead = read.items.length;
      datasetPages = read.pages;
      const linkedLinks = [];
      for (const item of read.items) {
        for (const row of toRows(item, id, channel.actor, runId, retrievedAt, mentions, counters)) rows.set(row.id, row);
        for (const key of ['comments', 'latestComments']) {
          const value = item?.[key];
          if (typeof value === 'string' && datasetPathRe.test(value)) linkedLinks.push(value);
          else if (Array.isArray(value)) for (const child of value) {
            const row = toRows({ ...child, ...{ [TEXT_FIELDS[0]]: child?.text || child?.comment } }, id, channel.actor, runId, retrievedAt, mentions, counters);
            for (const r of row) rows.set(r.id, r);
          }
        }
        for (const key of ['commentsDatasetUrl', 'commentsUrl', 'datasetUrl']) if (typeof item?.[key] === 'string') linkedLinks.push(item[key]);
      }
      if (linkedLinks.length) {
        const { ids, failed } = await linkedDatasetIds(linkedLinks, config.token, fetchImpl, deadline);
        linkedFailed = failed;
        for (const linked of ids) {
          const readLinked = await readDatasetItems(linked, config.token, fetchImpl, deadline, issues);
          itemsRead += readLinked.items.length;
          datasetPages += readLinked.pages;
          for (const comment of readLinked.items) {
            for (const row of toRows({ ...comment, text: comment?.text || comment?.content }, id, channel.actor, runId, retrievedAt, mentions, counters)) rows.set(row.id, row);
          }
        }
      }
    }
  }

  const reviews = [...rows.values()];
  const complete = runStatus === 'SUCCEEDED' && !issues.length;
  const status = reviews.length === 0 && (issues.length || runStatus !== 'SUCCEEDED')
    ? 'error'
    : reviews.length === 0 ? 'empty' : complete ? 'success' : 'partial';

  return {
    ...base,
    status,
    reviews,
    fetched: reviews.length,
    appId: runId || null,
    app: {
      title: `${entity} on ${channel.label}`,
      developer: `Apify actor ${channel.actor}`,
      url: runId ? `https://console.apify.com/actors/${runId}` : `https://apify.com/${channel.actor}`,
      score: null,
      ratingCount: null,
      reviewCountReported: null,
      ratingHistogram: null,
    },
    coverage: {
      actor: channel.actor,
      runId,
      runStatus,
      itemsRead,
      productMatches: reviews.length,
      offTopic: counters.offTopic,
      empty: counters.empty,
      hashedIds: counters.hashedIds,
      skipped: counters.empty,
      datasetPages,
      linkedFailed,
      sampleLimit: cap ? `${cap.field}=${cap.value}` : null,
      reportedReviewCount: null,
      reportedRatingCount: null,
    },
    limits: {
      issues: issues.map(text => ({ source: channel.label, text })),
      paths: [{ label: `${channel.actor} / dataset`, pages: datasetPages, rows: itemsRead, added: reviews.length, skipped: counters.empty, complete, error: issues[0] || null }],
    },
    elapsedMs: Date.now() - startedAt,
    message: `${reviews.length} ${channel.label} posts/comments mentioning "${entity}" were read from ${itemsRead} dataset items of actor ${channel.actor} (run ${runId}).${counters.offTopic ? ` ${counters.offTopic} items did not mention this entity and were not stored.` : ''}${counters.hashedIds ? ` ${counters.hashedIds} items carried no platform ID, so their ID is a local hash, not a platform ID.` : ''}${cap ? ` The actor was capped at ${cap.field}=${cap.value} on the Apify side, so coverage may be smaller.` : ''}${issues.length ? ` Note: ${issues.join('; ')}.` : ''} No bill was cancelled; this run used the Apify quota of this account.`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
    cached: false,
  };
}
