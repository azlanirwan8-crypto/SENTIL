// Orkestrasi penarikan otomatis: penemuan identitas toko, penarikan ulasan paralel
// dari Google Play dan App Store, lalu analisis korpus tanpa kamus manual.
// Cache disimpan per kanal selama satu jam; Force Sync melewati cache.
import { analyzeCorpus, ENGINE_VERSION } from './corpus-engine.mjs';
import { discoverGooglePlay, fetchGooglePlayReviews } from './googleplay.mjs';
import { discoverAppStore, fetchAppStoreReviews } from './appstore.mjs';

export const CACHE_TTL_MS = 60 * 60 * 1000;
// Anggaran di bawah maxDuration function (60 detik) agar pengambilan yang belum selesai
// tetap dikembalikan sebagian, bukan dipotong host di tengah jalan.
export const DEFAULT_PLAY_BUDGET_MS = 30000;
export const DEFAULT_APPSTORE_BUDGET_MS = 24000;
const CACHE_LIMIT = 64;
const PLAY_ID = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const APPLE_ID = /^\d{5,12}$/;

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
};

export function normalizeEntity(value) {
  const entity = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (entity.length < 2) throw new SyncError('entity_invalid', 'Nama entitas minimal dua karakter.');
  if (entity.length > 80) throw new SyncError('entity_invalid', 'Nama entitas maksimal 80 karakter.');
  return entity;
}

function optionalAppId(value, pattern, label) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  if (!pattern.test(id)) throw new SyncError('target_invalid', `${label} tidak berbentuk ID yang sah.`);
  return id;
}

function errorMessage(cause) {
  const message = String(cause?.message || cause || 'kesalahan tidak diketahui');
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
    message: `Kanal ini gagal dibaca: ${message}. Snapshot sebelumnya tidak dicampur dengan hasil baru.`,
    error: message,
    truncated: true,
    cached: false,
  };
}

function stripReviews(channel) {
  const { reviews, ...meta } = channel;
  return meta;
}

function summarize(rows, model, channels) {
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
} = {}) {
  const api = { ...defaultDeps, ...deps };
  const cache = new Map();

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
    const playCandidates = playResult.status === 'fulfilled' ? playResult.value : [];
    const appleCandidates = appleResult.status === 'fulfilled' ? appleResult.value : [];
    const playError = playResult.status === 'rejected' ? errorMessage(playResult.reason) : null;
    const appleError = appleResult.status === 'rejected' ? errorMessage(appleResult.reason) : null;
    const value = {
      entity: name,
      discoveredAt: new Date(now()).toISOString(),
      play: {
        status: playError ? 'error' : playCandidates.length ? 'ok' : 'empty',
        candidates: playCandidates,
        message: playError
          ? `Pencarian Google Play gagal: ${playError}. Kolom ini tidak dikarang; coba lagi atau gunakan nama entitas lain.`
          : `${playCandidates.length} kandidat Google Play ditemukan. Pilih yang identitasnya cocok — aplikasi tidak memilih kandidat secara otomatis.`,
      },
      appstore: {
        status: appleError ? 'error' : appleCandidates.length ? 'ok' : 'empty',
        candidates: appleCandidates,
        message: appleError
          ? `Pencarian App Store gagal: ${appleError}. Kolom ini tidak dikarang; coba lagi atau gunakan nama entitas lain.`
          : `${appleCandidates.length} kandidat App Store ditemukan. Pilih yang identitasnya cocok — aplikasi tidak memilih kandidat secara otomatis.`,
      },
    };
    const anyFulfilled = playResult.status === 'fulfilled' || appleResult.status === 'fulfilled';
    const info = anyFulfilled ? writeCache(key, value) : { hit: false, ageMs: 0, fetchedAt: new Date(now()).toISOString(), ttlMs };
    return { action: 'discover', ...value, cache: { ...info, force: force === true } };
  }

  async function sync({ entity, playAppId, appleAppId, force = false }) {
    const name = normalizeEntity(entity);
    const playId = optionalAppId(playAppId, PLAY_ID, 'ID paket Google Play');
    const appleId = optionalAppId(appleAppId, APPLE_ID, 'ID App Store');
    if (!playId && !appleId) throw new SyncError('target_required', 'Pilih minimal satu identitas toko (Google Play atau App Store).');

    const jobs = [];
    if (playId) {
      jobs.push({
        id: 'play',
        key: `play:${playId}`,
        run: () => api.fetchGooglePlayReviews(playId, {}, { budgetMs: playBudgetMs }),
      });
    }
    if (appleId) {
      jobs.push({
        id: 'appstore',
        key: `appstore:${appleId}`,
        run: () => api.fetchAppStoreReviews(appleId, {}, { budgetMs: appStoreBudgetMs }),
      });
    }

    const results = await Promise.allSettled(jobs.map(job => {
      const cached = readCache(job.key, force === true);
      if (cached) return Promise.resolve({ channel: { ...cached.value, cache: { ...cached.info, force: force === true } }, cacheInfo: cached.info });
      return Promise.resolve()
        .then(job.run)
        .then(channel => {
          const info = channel.status === 'error'
            ? { hit: false, ageMs: 0, fetchedAt: new Date(now()).toISOString(), ttlMs, force: force === true }
            : { ...writeCache(job.key, channel), force: force === true };
          return { channel: { ...channel, cache: info }, cacheInfo: info };
        });
    }));

    const channels = results.map((result, index) => result.status === 'fulfilled'
      ? result.value.channel
      : failureChannel(jobs[index].id, result.reason));
    const reviews = new Map();
    for (const channel of channels) {
      for (const review of channel.reviews) {
        const key = `${review.platform}:${review.id}`;
        if (!reviews.has(key)) reviews.set(key, review);
      }
    }
    const rows = [...reviews.values()].sort(sortReviews);
    const generatedAt = new Date(now()).toISOString();
    const { rows: analyzedRows, model } = analyzeCorpus(rows, { generatedAt });
    const channelMeta = channels.map(stripReviews);
    return {
      action: 'sync',
      ok: true,
      entity: name,
      target: { playAppId: playId, appleAppId: appleId },
      fetchedAt: generatedAt,
      engine: { version: ENGINE_VERSION, supervision: 'weak-rating', dictionary: 'none' },
      cache: {
        ttlMs,
        force: force === true,
        channels: Object.fromEntries(channels.map(channel => [channel.id, channel.cache || { hit: false, ttlMs, force: force === true }])),
      },
      channels: channelMeta,
      reviews: analyzedRows,
      model,
      summary: summarize(analyzedRows, model, channelMeta),
    };
  }

  return {
    discover,
    sync,
    clearCache: () => cache.clear(),
    cacheSize: () => cache.size,
  };
}

export const syncService = createSyncService();
