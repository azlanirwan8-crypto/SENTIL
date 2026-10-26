// Orkestrasi penarikan otomatis: penemuan identitas toko, lalu penarikan paralel dari
// kanal toko (Google Play, App Store) dan kanal sosial/web (YouTube, Reddit, berita RSS,
// Facebook, Instagram, TikTok, X). Satu bentuk keluaran untuk semua kanal supaya monitor
// batas sumber dan analisis korpus tidak perlu tahu sumber mana yang sedang dibaca.
// Cache disimpan per kanal selama satu jam; Force Sync melewati cache.
import { analyzeCorpus, ENGINE_VERSION } from './corpus-engine.mjs';
import { nameClusters, NAMING_VERSION } from './label-naming.mjs';
import { discoverGooglePlay, fetchGooglePlayReviews } from './googleplay.mjs';
import { discoverAppStore, fetchAppStoreReviews } from './appstore.mjs';
import { fetchNewsReviews } from './news.mjs';
import { fetchYouTubeReviews, youtubeConfiguration } from './youtube.mjs';
import { fetchRedditReviews, redditConfiguration } from './reddit.mjs';
import { apifyChannels, apifyConfiguration, fetchApifyReviews } from './apify.mjs';
import { describeCandidates, filterCandidates } from './name-match.mjs';
import { CHANNEL_CATALOG } from './channels.mjs';
import { attemptFromChannel, monitorFromDataset, pushAttempt } from './limit-monitor.mjs';

export const CACHE_TTL_MS = 60 * 60 * 1000;
// Anggaran per kanal diukur terhadap maxDuration fungsi (300 detik di api/sync.js), BUKAN terhadap
// angka 60 detik yang lama. Kanal-kanal berjalan paralel (Promise.allSettled), jadi angka terbesar
// yang menentukan: 180 dtk penarikan + analisis korpus (~6 dtk per 45.000 ulasan) + penamaan
// (maks 25 dtk) + penyimpanan bertahap masih di bawah plafon. Anggaran yang lebih kecil dari ini
// memotong penarikan besar secara struktural — itu sebabnya tarikan 40.000 ulasan selalu "partial".
export const DEFAULT_PLAY_BUDGET_MS = 180_000;
export const DEFAULT_APPSTORE_BUDGET_MS = 150_000;
export const DEFAULT_YOUTUBE_BUDGET_MS = 90_000;
export const DEFAULT_REDDIT_BUDGET_MS = 60_000;
export const DEFAULT_NEWS_BUDGET_MS = 45_000;
export const DEFAULT_APIFY_BUDGET_MS = 150_000;
const CACHE_LIMIT = 64;
const PLAY_ID = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const APPLE_ID = /^\d{5,12}$/;

// Katalog kanal. `credential` hanya dipakai untuk menjelaskan syarat aktifnya kanal ke UI;
// nilainya tidak pernah dibaca dari request, selalu dari environment server.
export { CHANNEL_CATALOG, CHANNEL_IDS, CHANNEL_LABELS } from './channels.mjs';

export class SyncError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.status = status;
  }
}

const defaultDeps = {
  discoverGooglePlay,
  discoverAppStore,
  fetchGooglePlayReviews,
  fetchAppStoreReviews,
  fetchYouTubeReviews,
  fetchRedditReviews,
  fetchNewsReviews,
  fetchApifyReviews,
};

const APIFY_IDS = Object.keys(apifyChannels);

// Config kanal sosial/web datang dari workspace (bukan dari user input bebas per permintaan):
// hanya flag `enabled` dan target yang sudah dinormalisasi yang diterima.
export function normalizeSocialTargets(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const targets = {};
  for (const channel of CHANNEL_CATALOG) {
    if (channel.group === 'store') continue;
    const entry = source[channel.id];
    const raw = entry && typeof entry === 'object' ? entry : {};
    const handle = typeof raw.handle === 'string' ? raw.handle.trim().slice(0, 60) : '';
    const videoIds = Array.isArray(raw.videoIds) ? raw.videoIds.map(id => String(id).trim()).filter(id => /^[\w-]{11}$/.test(id)).slice(0, 25) : [];
    const subreddits = Array.isArray(raw.subreddits) ? raw.subreddits.map(name => String(name).trim().replace(/^r\//, '')).filter(name => /^[A-Za-z0-9][\w]{1,20}$/.test(name)).slice(0, 12) : [];
    targets[channel.id] = {
      enabled: raw.enabled === true,
      handle: handle || null,
      videoIds,
      subreddits,
    };
  }
  return targets;
}

function socialCacheKey(id, name, targets) {
  const target = targets[id] || {};
  if (id === 'youtube' && target.videoIds.length) return `youtube:video:${target.videoIds.join(',')}`;
  if (id === 'reddit' && target.subreddits.length) return `reddit:r:${target.subreddits.join(',')}:${name.toLocaleLowerCase('id-ID')}`;
  return `${id}:search:${name.toLocaleLowerCase('id-ID')}`;
}

// Status kesiapan per kanal. Yang dibaca hanya "ada atau tidak ada" — nilai token, kunci,
// atau secret tidak pernah keluar dari server, termasuk dalam bentuk tersamar.
export function channelCredentials(env = process.env) {
  const youtube = youtubeConfiguration(env);
  const reddit = redditConfiguration(env);
  const apify = apifyConfiguration(env);
  const ready = config => config.status === 'ready';
  // `ready` dan `status` keduanya dikirim: kanal berbayar bisa punya kunci terpasang tetapi
  // masih belum boleh menarik (izin tertulis pemilik belum ada), dan itu bukan hal yang sama
  // dengan "kunci belum dipasang" bagi orang yang membaca panel.
  return {
    news: { ready: true, status: 'ready', message: 'Public RSS shelter, no credentials.' },
    youtube: { ready: ready(youtube), status: youtube.status, message: youtube.message },
    reddit: { ready: ready(reddit), status: reddit.status, message: reddit.message },
    ...Object.fromEntries(APIFY_IDS.map(id => [id, { ready: ready(apify), status: apify.status, message: apify.message }])),
  };
}

export function normalizeEntity(value) {
  const entity = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (entity.length < 2) throw new SyncError('entity_invalid', 'The entity name needs at least two characters.');
  if (entity.length > 80) throw new SyncError('entity_invalid', 'The entity name takes at most 80 characters.');
  return entity;
}

function optionalAppId(value, pattern, label) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  if (!pattern.test(id)) throw new SyncError('target_invalid', `${label} is not a valid ID shape.`);
  return id;
}

function errorMessage(cause) {
  const message = String(cause?.message || cause || 'unknown error');
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

function failureChannel(id, cause) {
  const message = errorMessage(cause);
  return {
    id,
    status: 'error',
    fetched: null,
    reviews: [],
    app: null,
    coverage: null,
    message: `This channel could not be read: ${message}. The previous snapshot was not mixed into the new result.`,
    error: message,
    truncated: true,
    cached: false,
  };
}

function stripReviews(channel) {
  const { reviews, ...meta } = channel;
  return meta;
}

export function summarizeDataset(rows, model, channels) {
  const rated = rows.filter(review => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
  const avgRating = rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null;
  return {
    reviews: rows.length,
    withText: model.coverage.withText,
    withoutText: model.coverage.withoutText,
    analyzed: model.coverage.analyzed,
    unclassified: model.coverage.unclassified,
    rated: rated.length,
    avgRating: avgRating == null ? null : Number(avgRating.toFixed(3)),
    positive: model.labels.positive,
    negative: model.labels.negative,
    neutral: model.labels.neutral,
    nss: model.nss,
    channels: channels.map(channel => ({ id: channel.id, status: channel.status, fetched: channel.fetched })),
  };
}

function sortReviews(left, right) {
  const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : -Infinity;
  const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : -Infinity;
  return rightTime - leftTime || String(left.platform).localeCompare(String(right.platform)) || String(left.id).localeCompare(String(right.id));
}

export function createSyncService({
  deps = {},
  now = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  playBudgetMs = DEFAULT_PLAY_BUDGET_MS,
  appStoreBudgetMs = DEFAULT_APPSTORE_BUDGET_MS,
  youTubeBudgetMs = DEFAULT_YOUTUBE_BUDGET_MS,
  redditBudgetMs = DEFAULT_REDDIT_BUDGET_MS,
  newsBudgetMs = DEFAULT_NEWS_BUDGET_MS,
  apifyBudgetMs = DEFAULT_APIFY_BUDGET_MS,
  env = process.env,
} = {}) {
  const api = { ...defaultDeps, ...deps };
  const cache = new Map();
  const attempts = new Map();
  // Run actor Apify bersifat asinkron dan menagih biaya, jadi ID run ditahan di memori
  // instance agar penarikan berikutnya menyambungkan run yang sama, bukan menjalankan duplikat.
  const apifyRuns = new Map();

  function recordAttempt(jobKey, attempt) {
    const key = `attempts:${jobKey}`;
    attempts.set(key, pushAttempt(attempts.get(key) || [], attempt));
    // Ledger tidak boleh tumbuh tanpa batas pada instance hangat: satu kunci per kanal,
    // dan kunci paling lama dibuang saat melewati anggaran yang sama dengan cache.
    while (attempts.size > CACHE_LIMIT) {
      const oldest = attempts.keys().next().value;
      if (oldest === undefined) break;
      attempts.delete(oldest);
    }
  }

  function attemptsFor(jobKey) {
    return [...(attempts.get(`attempts:${jobKey}`) || [])];
  }

  // Satu daftar pekerjaan untuk semua kanal. dipanggil oleh sync(), monitorOf(), dan
  // resetLimits() supaya kunci cache/ledger selalu sama untuk target yang sama.
  function buildJobs({ name, playId, appleId, social, since }) {
    const jobs = [];
    // Kanal toko dibaca dari yang terbaru. Kalau ada penanda tanggal dari snapshot sebelumnya,
    // penarikan berhenti begitu menyentuh baris yang sudah tersimpan — barisnya tidak dibuang,
    // analisis tetap memakai seluruh korpus, hanya halaman jaringannya yang dihemat.
    if (playId) jobs.push({ id: 'play', key: `play:${playId}`, run: () => api.fetchGooglePlayReviews(playId, {}, { budgetMs: playBudgetMs, since: since?.play || null }) });
    if (appleId) jobs.push({ id: 'appstore', key: `appstore:${appleId}`, run: () => api.fetchAppStoreReviews(appleId, {}, { budgetMs: appStoreBudgetMs, since: since?.appstore || null }) });
    if (social.news?.enabled) {
      jobs.push({
        id: 'news',
        key: socialCacheKey('news', name, social),
        run: () => api.fetchNewsReviews(name, { env, budgetMs: newsBudgetMs }),
      });
    }
    if (social.youtube?.enabled) {
      jobs.push({
        id: 'youtube',
        key: socialCacheKey('youtube', name, social),
        run: () => api.fetchYouTubeReviews(name, { env, budgetMs: youTubeBudgetMs, target: social.youtube }),
      });
    }
    if (social.reddit?.enabled) {
      jobs.push({
        id: 'reddit',
        key: socialCacheKey('reddit', name, social),
        run: () => api.fetchRedditReviews(name, { env, budgetMs: redditBudgetMs, target: social.reddit }),
      });
    }
    for (const id of APIFY_IDS) {
      if (!social[id]?.enabled) continue;
      // Kanal berbayar hanya ikut ditarik kalau izin tertulis pemilik ada di server. Tanpa itu
      // tidak ada run yang dikirim, dan statusnya dilaporkan lewat channelCredentials.
      if (!apifyConfiguration(env).allowed) continue;
      jobs.push({
        id,
        key: socialCacheKey(id, name, social),
        run: () => api.fetchApifyReviews(id, name, {
          env,
          budgetMs: apifyBudgetMs,
          resumeRunId: apifyRuns.get(`${id}:${name.toLocaleLowerCase('id-ID')}`) || null,
          onRunId: runId => apifyRuns.set(`${id}:${name.toLocaleLowerCase('id-ID')}`, runId),
        }),
      });
    }
    return jobs;
  }

  function targetsFrom({ entity, playAppId, appleAppId, social }) {
    const name = normalizeEntity(entity);
    const playId = optionalAppId(playAppId, PLAY_ID, 'the Google Play package ID');
    const appleId = optionalAppId(appleAppId, APPLE_ID, 'the App Store ID');
    const targets = normalizeSocialTargets(social);
    if (!playId && !appleId && !Object.values(targets).some(target => target.enabled)) {
      throw new SyncError('target_required', 'Select at least one data source (a store channel or a social channel).', 400);
    }
    return { name, playId, appleId, social: targets };
  }

  function limitViews(jobs, channels, { entity, fetchedAt }) {
    const attemptsByKey = {};
    for (const job of jobs) attemptsByKey[job.id] = attemptsFor(job.key);
    // Kanal yang diminta selalu ikut ditampilkan walau salinannya tidak ada di cache:
    // riwayat percobaannya tetap relevan bagi pembaca panel.
    return monitorFromDataset({ channels, entity, fetchedAt, requestedIds: jobs.map(job => job.id) }, { now: now(), attemptsByKey });
  }

  function readCache(key, force) {
    const at = now();
    const entry = cache.get(key);
    if (!force && entry && at - entry.at < ttlMs) {
      return { value: entry.value, info: { hit: true, ageMs: at - entry.at, fetchedAt: new Date(entry.at).toISOString(), ttlMs, force: false } };
    }
    return null;
  }

  function writeCache(key, value) {
    const at = now();
    cache.set(key, { at, value });
    if (cache.size > CACHE_LIMIT) {
      const oldest = [...cache].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    return { hit: false, ageMs: 0, fetchedAt: new Date(at).toISOString(), ttlMs, force: false };
  }

  async function discover(entity, { force = false } = {}) {
    const name = normalizeEntity(entity);
    const key = `discover:${name.toLocaleLowerCase('id-ID')}`;
    const cached = readCache(key, force === true);
    if (cached) return { action: 'discover', ...cached.value, cache: { ...cached.info, force: force === true } };

    const [playResult, appleResult] = await Promise.allSettled([
      api.discoverGooglePlay(name),
      api.discoverAppStore(name),
    ]);
    const playFilter = filterCandidates(name, playResult.status === 'fulfilled' ? playResult.value : []);
    const appleFilter = filterCandidates(name, appleResult.status === 'fulfilled' ? appleResult.value : []);
    const playError = playResult.status === 'rejected' ? errorMessage(playResult.reason) : null;
    const appleError = appleResult.status === 'rejected' ? errorMessage(appleResult.reason) : null;
    const value = {
      entity: name,
      discoveredAt: new Date(now()).toISOString(),
      play: {
        status: playError ? 'error' : playFilter.kept.length ? 'ok' : 'empty',
        candidates: playFilter.kept,
        matchMode: playFilter.mode,
        matched: playFilter.kept.filter(candidate => candidate.match?.coversAll).length,
        filteredOut: playFilter.dropped,
        searched: playFilter.queryTokens,
        message: playError
          ? `The Google Play search failed: ${playError}. Nothing here was invented; try again or use another entity name.`
          : describeCandidates(playFilter, 'Google Play'),
      },
      appstore: {
        status: appleError ? 'error' : appleFilter.kept.length ? 'ok' : 'empty',
        candidates: appleFilter.kept,
        matchMode: appleFilter.mode,
        matched: appleFilter.kept.filter(candidate => candidate.match?.coversAll).length,
        filteredOut: appleFilter.dropped,
        searched: appleFilter.queryTokens,
        message: appleError
          ? `The App Store search failed: ${appleError}. Nothing here was invented; try again or use another entity name.`
          : describeCandidates(appleFilter, 'App Store'),
      },
    };
    const anyFulfilled = playResult.status === 'fulfilled' || appleResult.status === 'fulfilled';
    const info = anyFulfilled ? writeCache(key, value) : { hit: false, ageMs: 0, fetchedAt: new Date(now()).toISOString(), ttlMs };
    return { action: 'discover', ...value, cache: { ...info, force: force === true } };
  }

  async function sync({ entity, playAppId, appleAppId, social, force = false, bypassCache = false, since = null, carry = null }) {
    const target = targetsFrom({ entity, playAppId, appleAppId, social });
    const { name, playId, appleId } = target;
    const jobs = buildJobs({ ...target, since: since && typeof since === 'object' ? since : {} });
    // Dua permintaan berbeda dan sengaja dipisah: `bypassCache` hanya menyuruh sumber ditanya ulang,
    // `force` juga memaksa analisis + penulisan snapshot walau tidak ada ulasan baru. Penjadwal
    // membutuhkan yang pertama tanpa yang kedua.
    const skipCache = force === true || bypassCache === true;

    const results = await Promise.allSettled(jobs.map(job => {
      const cached = readCache(job.key, skipCache);
      if (cached) {
        recordAttempt(job.key, attemptFromChannel(cached.value, {
          at: new Date(now()).toISOString(),
          cacheHit: true,
          cacheAgeMs: cached.info.ageMs,
        }));
        return Promise.resolve({ channel: { ...cached.value, cache: { ...cached.info, force: skipCache } }, cacheInfo: cached.info });
      }
      const startedAt = now();
      return Promise.resolve()
        .then(job.run)
        .then(channel => {
          const info = channel.status === 'error'
            ? { hit: false, ageMs: 0, fetchedAt: new Date(now()).toISOString(), ttlMs, force: skipCache }
            : { ...writeCache(job.key, channel), force: skipCache };
          recordAttempt(job.key, attemptFromChannel(channel, {
            at: new Date(startedAt).toISOString(),
            ms: now() - startedAt,
          }));
          return { channel: { ...channel, cache: info }, cacheInfo: info };
        });
    }));

    const channels = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value.channel;
      recordAttempt(jobs[index].key, attemptFromChannel({ status: 'error', fetched: 0, error: result.reason?.message || 'penarikan gagal' }, {
        at: new Date(now()).toISOString(),
        ms: null,
      }));
      return failureChannel(jobs[index].id, result.reason);
    });
    const reviews = new Map();
    // Baris yang sudah tersimpan ikut dihitung lagi. Analisis memakai seluruh korpus, jadi
    // penarikan inkremental tidak boleh mengurangi satu baris pun dari statistik.
    for (const review of Array.isArray(carry) ? carry : []) {
      if (!review || typeof review !== 'object' || !review.id) continue;
      const { analysis, ...raw } = review;
      reviews.set(`${raw.platform}:${raw.id}`, raw);
    }
    const carried = reviews.size;
    let fresh = 0;
    for (const channel of channels) {
      for (const review of channel.reviews) {
        const key = `${review.platform}:${review.id}`;
        if (!reviews.has(key)) fresh += 1;
        reviews.set(key, review);
      }
    }
    // Tidak ada baris baru dan tidak dipaksa: jangan buang waktu analisis + tulis 60.000 baris.
    // Kanal toko tetap melaporkan kegiatannya supaya monitor batas sumber tidak buta.
    if (!force && fresh === 0 && carried > 0) {
      const generatedAt = new Date(now()).toISOString();
      const channelMeta = channels.map(stripReviews);
      return {
        action: 'sync',
        ok: true,
        unchanged: true,
        entity: name,
        target: { playAppId: playId, appleAppId: appleId, social: target.social },
        credentials: channelCredentials(env),
        fetchedAt: generatedAt,
        incremental: { carried, fresh: 0, since: since || null },
        cache: {
          ttlMs,
          force: skipCache,
          channels: Object.fromEntries(channels.map(channel => [channel.id, channel.cache || { hit: false, ttlMs, force: skipCache }])),
        },
        channels: channelMeta,
        limits: limitViews(jobs, channelMeta, { entity: name, fetchedAt: generatedAt }),
        reviews: null,
        model: null,
        summary: null,
        message: `${carried} reviews were already stored and nothing new came back from the sources, so the analysis and the snapshot were left exactly as they were. Force a pull to rebuild anyway.`,
      };
    }
    const rows = [...reviews.values()].sort(sortReviews);
    const generatedAt = new Date(now()).toISOString();
    // Kosakata topik datang dari teks daftar aplikasi yang ditarik kanal toko. Kanal sosial
    // tidak punya deskripsi sendiri, jadi topik tetap bisa dibentuk selama satu toko terbaca.
    const listing = [...new Set(channels.map(channel => channel.app?.listing).filter(Boolean))].join('\n');
    const { rows: analyzedRows, model } = analyzeCorpus(rows, { generatedAt, listing, entity: name });
    // Penamaan AI berjalan SETELAH seluruh angka dihitung, dan hanya menerima id gerombol plus
    // frasa verbatim — tidak ada jumlah yang dikirim, tidak ada jumlah yang boleh kembali.
    // Tanpa kunci atau saat panggilan gagal, penamaan di-skip: penarikan data tidak pernah
    // bergantung padanya.
    if (model.painPoints?.labels?.length) {
      const naming = await nameClusters(
        model.painPoints.labels.map(label => ({ id: label.id, phrases: label.phrases.map(entry => entry.text) })),
        { env },
      );
      model.painPoints.naming = { version: NAMING_VERSION, at: generatedAt, ...naming };
    }
    const channelMeta = channels.map(stripReviews);
    return {
      action: 'sync',
      ok: true,
      entity: name,
      incremental: { carried, fresh, since: since || null },
      target: { playAppId: playId, appleAppId: appleId, social: target.social },
      credentials: channelCredentials(env),
      fetchedAt: generatedAt,
      engine: {
        version: ENGINE_VERSION,
        supervision: 'weak-rating',
        // "Tanpa kamus" hanya benar untuk bobot sentimen. Nama topik diambil dari kamus domain
        // bilingual, jadi versinya dinyatakan apa adanya beserta bagian mana yang memakai kamus.
        dictionary: model.taxonomy?.version || 'none',
        dictionaryScope: 'topic names only — weights, phrase labels, and every count are learned from this corpus',
        languages: model.languages?.version || null,
        // Kolom Category adalah satu-satunya bagian yang boleh berisi kata di luar korpus, jadi
        // status lapisan penamaan dinyatakan di sini, bukan disembunyikan di dalam model.
        naming: model.painPoints?.naming
          ? { version: NAMING_VERSION, status: model.painPoints.naming.status, model: model.painPoints.naming.model || null }
          : { version: NAMING_VERSION, status: 'not-applicable', model: null },
      },
      cache: {
        ttlMs,
        force: skipCache,
        channels: Object.fromEntries(channels.map(channel => [channel.id, channel.cache || { hit: false, ttlMs, force: skipCache }])),
      },
      channels: channelMeta,
      limits: limitViews(jobs, channelMeta, { entity: name, fetchedAt: generatedAt }),
      reviews: analyzedRows,
      model,
      summary: summarizeDataset(analyzedRows, model, channelMeta),
    };
  }

  function monitorOf({ entity, playAppId, appleAppId, social }) {
    const target = targetsFrom({ entity, playAppId, appleAppId, social });
    const jobs = buildJobs(target);
    const channels = jobs
      .map(job => {
        const entry = cache.get(job.key);
        if (!entry) return null;
        const { reviews, ...meta } = entry.value;
        return { ...meta, fetchedAt: new Date(entry.at).toISOString() };
      })
      .filter(Boolean);
    return {
      action: 'limits',
      ok: true,
      entity: target.name,
      credentials: channelCredentials(env),
      instanceScope: 'warm instance memory',
      ...limitViews(jobs, channels, { entity: target.name, fetchedAt: new Date(now()).toISOString() }),
    };
  }

  function resetLimits({ entity, playAppId, appleAppId, social }) {
    const target = targetsFrom({ entity, playAppId, appleAppId, social });
    const cleared = { attempts: [], cache: [], runs: [] };
    for (const job of buildJobs(target)) {
      if (attempts.delete(`attempts:${job.key}`)) cleared.attempts.push(job.key);
      if (cache.delete(job.key)) cleared.cache.push(job.key);
    }
    for (const [key, runId] of [...apifyRuns]) {
      if (key.endsWith(`:${target.name.toLocaleLowerCase('id-ID')}`)) {
        apifyRuns.delete(key);
        cleared.runs.push(runId);
      }
    }
    if (!cleared.attempts.length && !cleared.cache.length) {
      return { action: 'limits-reset', ok: true, cleared, message: 'There is no log on this instance; the next pull will indeed start from a clean state.' };
    }
    return {
      action: 'limits-reset',
      ok: true,
      cleared,
      message: `The attempt log (${cleared.attempts.length} channels) and cache (${cleared.cache.length} channels) were cleared.${cleared.runs.length ? ` ${cleared.runs.length} held actor run(s) were released too.` : ''} The next pull asks the sources again.`,
    };
  }

  return {
    discover,
    sync,
    limits: monitorOf,
    resetLimits,
    clearCache: () => {
      cache.clear();
      attempts.clear();
    },
    cacheSize: () => cache.size,
    attemptsSize: () => attempts.size,
  };
}

export const syncService = createSyncService();
