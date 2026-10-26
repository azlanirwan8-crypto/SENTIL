// Kanal YouTube lewat YouTube Data API v3 (resmi, tanpa penyamaran). Kunci API hanya
// dibaca dari environment server — tidak pernah dari browser, kolom chat, atau berkas
// yang di-commit. Tanpa kunci, kanal mengembalikan needs_setup, bukan data kosong.
const REQUEST_MS = 12000;
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_COMMENT_CHARS = 8000;

const errorMessage = cause => String(cause?.message || cause || 'unknown error').slice(0, 220);

const splitIds = value => [...new Set(String(value || '').split(/[\s,]+/).map(part => part.trim()).filter(Boolean))];
const validVideoId = value => /^[\w-]{11}$/.test(String(value || ''));

export function youtubeConfiguration(env = process.env) {
  const apiKey = String(env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY || '').trim();
  const videoIds = splitIds(env.YOUTUBE_VIDEO_IDS).filter(validVideoId);
  const channelIds = splitIds(env.YOUTUBE_CHANNEL_IDS);
  const maxVideos = Number(env.YOUTUBE_MAX_VIDEOS);
  return {
    apiKey,
    videoIds,
    channelIds,
    maxVideos: Number.isInteger(maxVideos) && maxVideos > 0 ? maxVideos : null,
    status: apiKey ? 'ready' : 'needs_setup',
    message: apiKey
      ? `A YouTube Data API key is present in the server environment. ${videoIds.length ? `${videoIds.length} video ID(s) are pinned as the fixed coverage.` : 'Videos are searched from the entity name.'} This does not mean a connection until a pull actually runs.`
      : 'YouTube comments can only be read through the YouTube Data API v3, and no API key is installed in the server environment (YOUTUBE_API_KEY or GOOGLE_API_KEY). No request was sent, so no comment was invented.',
  };
}

async function request(resource, params, apiKey, fetchImpl, deadline) {
  const url = new URL(`${API}/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set('key', apiKey);
  let response;
  try {
    response = await fetchImpl(url.href, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_MS, deadline - Date.now()))),
    });
  } catch (cause) {
    throw new Error(`network_error: YouTube could not be reached (${errorMessage(cause)})`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let reason = '';
    try { reason = String(JSON.parse(body)?.error?.errors?.[0]?.reason || ''); } catch { /* tubuh error tidak terurai */ }
    const labels = {
      quotaExceeded: 'daily API quota exhausted',
      dailyLimitExceeded: 'daily API quota limit reached',
      keyInvalid: 'API key refused',
      invalidKey: 'API key is not valid',
      accessNotConfigured: 'YouTube Data API is not enabled on this key project',
      forbidden: 'API access denied',
      rateLimitExceeded: 'too many requests to the API',
    };
    throw Object.assign(
      new Error(`source returned HTTP ${response.status}${labels[reason] ? ` (${labels[reason]})` : reason ? ` (${reason})` : ''}`),
      { httpStatus: response.status, retryAfterMs: null, reason },
    );
  }
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('parse_error: the YouTube response is not JSON'); }
  if (!Array.isArray(payload.items)) throw new Error('parse_error: the YouTube item list is missing');
  return payload;
}

async function* pages(resource, params, apiKey, fetchImpl, deadline) {
  let token = null;
  const seen = new Set();
  for (;;) {
    if (Date.now() >= deadline) {
      throw Object.assign(new Error('fetch timeout reached'), { timeout: true });
    }
    const payload = await request(resource, token ? { ...params, pageToken: token } : params, apiKey, fetchImpl, deadline);
    yield payload;
    token = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null;
    if (!token) return;
    if (seen.has(token)) throw new Error('next page token repeated');
    seen.add(token);
  }
}

function commentRow(item, video, retrievedAt, parentId = null) {
  const snippet = item?.snippet;
  const text = typeof snippet?.textDisplay === 'string' ? snippet.textDisplay : '';
  if (!text) return null;
  const id = typeof item?.id === 'string' ? item.id : null;
  if (!id) return null;
  const publishedAt = Number.isFinite(Date.parse(snippet.publishedAt || '')) ? snippet.publishedAt : null;
  return {
    id: `yt-${id}`,
    platform: 'youtube',
    author: typeof snippet.authorDisplayName === 'string' && snippet.authorDisplayName.trim() ? snippet.authorDisplayName : 'N/A',
    title: null,
    text: text.slice(0, MAX_COMMENT_CHARS),
    rating: null,
    date: publishedAt ? publishedAt.slice(0, 10) : null,
    publishedAt,
    sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}${parentId ? `&lc=${encodeURIComponent(id)}` : ''}`,
    store: video.channelTitle || 'YouTube',
    language: null,
    meta: { via: 'youtube-data-api', videoId: video.id, parentId: parentId || null, replyCount: Number(item?.snippet?.totalReplyCount) || 0 },
  };
}

export async function fetchYouTubeReviews(entity, { env = process.env, fetchImpl = fetch, budgetMs = 26000, target = null } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const config = target?.youtube ? { ...youtubeConfiguration(env), ...target.youtube } : youtubeConfiguration(env);
  const retrievedAt = new Date(startedAt).toISOString();
  const base = {
    id: 'youtube',
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

  if (config.status !== 'ready') {
    return { ...base, message: config.message, elapsedMs: Date.now() - startedAt };
  }

  const issues = [];
  const videos = new Map();
  const readVideoIds = splitIds(config.videoIds || '').filter(validVideoId);
  let searchPages = 0;
  let searchTruncated = false;

  try {
    if (readVideoIds.length) {
      for (let index = 0; index < readVideoIds.length; index += 50) {
        const batch = readVideoIds.slice(index, index + 50);
        const payload = await request('videos', { part: 'snippet', id: batch.join(',') }, config.apiKey, fetchImpl, deadline);
        for (const item of payload.items) {
          if (!validVideoId(item?.id)) continue;
          videos.set(item.id, { id: item.id, title: item.snippet?.title || 'N/A', channelTitle: item.snippet?.channelTitle || 'N/A', publishedAt: item.snippet?.publishedAt || null });
        }
      }
    } else {
      const params = { part: 'snippet', type: 'video', q: `"${entity}"`, order: 'date', maxResults: 50 };
      if (config.channelIds.length) params.channelId = config.channelIds.join(',');
      for await (const payload of pages('search', params, config.apiKey, fetchImpl, deadline)) {
        searchPages += 1;
        for (const item of payload.items) {
          const id = item?.id?.videoId;
          if (!validVideoId(id) || videos.has(id)) continue;
          videos.set(id, { id, title: item.snippet?.title || 'N/A', channelTitle: item.snippet?.channelTitle || 'N/A', publishedAt: item.snippet?.publishedAt || null });
        }
        if (config.maxVideos && videos.size >= config.maxVideos) { searchTruncated = true; break; }
      }
    }
  } catch (cause) {
    issues.push(`video search: ${errorMessage(cause)}`);
    if (cause?.timeout) searchTruncated = true;
  }

  const reviews = new Map();
  let skipped = 0;
  let threads = 0;
  let replies = 0;
  const quotaStopped = () => issues.some(issue => /quota|HTTP 403|HTTP 429/.test(issue));
  const videoList = [...videos.values()];

  for (const video of videoList) {
    if (Date.now() >= deadline) { issues.push(`timeout reached after ${threads} videos were read out of ${videoList.length}`); break; }
    if (quotaStopped()) { issues.push('comment stop: the API quota left no room in this session'); break; }
    try {
      for await (const payload of pages('commentThreads', { part: 'snippet', videoId: video.id, maxResults: 100, textFormat: 'plainText', order: 'time' }, config.apiKey, fetchImpl, deadline)) {
        for (const item of payload.items) {
          threads += 1;
          const topLevel = item?.snippet?.topLevelComment;
          const row = commentRow(topLevel, video, retrievedAt);
          if (row) reviews.set(row.id, row); else skipped += 1;
          const hasReplies = Number(topLevel?.snippet?.totalReplyCount) > 0;
          if (!hasReplies) continue;
          try {
            for await (const page of pages('comments', { part: 'snippet', parentId: topLevel.id, maxResults: 100, textFormat: 'plainText' }, config.apiKey, fetchImpl, deadline)) {
              for (const reply of page.items) {
                replies += 1;
                const replyRow = commentRow({ id: reply?.id, snippet: reply?.snippet }, video, retrievedAt, topLevel.id);
                if (replyRow) reviews.set(replyRow.id, replyRow); else skipped += 1;
              }
            }
          } catch (cause) {
            issues.push(`replies of video ${video.id}: ${errorMessage(cause)}`);
          }
        }
      }
    } catch (cause) {
      issues.push(`comments of video ${video.id}: ${errorMessage(cause)}`);
      if (/HTTP 403|HTTP 429/.test(String(cause?.message || ''))) break;
    }
  }

  const rows = [...reviews.values()];
  const videosRead = threads > 0 || readVideoIds.length > 0;
  const complete = !issues.length && !searchTruncated && videosRead;
  const status = !videosRead && issues.length
    ? 'error'
    : rows.length === 0 && issues.length && !videosRead
      ? 'error'
      : rows.length === 0
        ? 'empty'
        : complete ? 'success' : 'partial';

  return {
    ...base,
    status,
    reviews: rows,
    fetched: rows.length,
    appId: config.channelIds[0] || null,
    app: {
      title: `${entity} on YouTube`,
      developer: config.channelIds.length ? config.channelIds.join(', ') : 'search by entity name',
      url: `https://www.youtube.com/results?searchquery=${encodeURIComponent(`"${entity}"`)}`,
      score: null,
      ratings: null,
      ratingCount: null,
      reviewCountReported: null,
      ratingHistogram: null,
    },
    coverage: {
      videosFound: videos.size,
      videosRead: threads,
      replyRows: replies,
      searchPages,
      skipped,
      reportedReviewCount: null,
      reportedRatingCount: null,
      sampleLimit: config.maxVideos,
      quotaLimited: quotaStopped(),
    },
    limits: {
      issues: issues.map(text => ({ source: 'YouTube Data API v3', text })),
      paths: [{ label: readVideoIds.length ? 'pinned video list' : 'video search', pages: searchPages, rows: videos.size, added: videos.size, skipped: 0, complete: !searchTruncated, error: issues[0] || null }],
    },
    elapsedMs: Date.now() - startedAt,
    message: `${rows.length} public YouTube comments were read from ${threads} threads on ${videos.size} video(s) (${replies} of them replies).${issues.length ? ` Some paths stopped: ${issues.join('; ')}.` : ' Every page finished reading.'}${searchTruncated ? ` Video reading stopped at the ${config.maxVideos} limit set in the environment, so coverage is smaller.` : ''} Comment sections use no stars, so comments are not counted as ratings.`,
    truncated: !complete,
    error: issues.find(Boolean) || null,
  };
}
