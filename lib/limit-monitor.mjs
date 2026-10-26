// Pemantau batas sumber publik untuk semua kanal (toko, sosial, dan web). Klasifikasi hanya
// dari sinyal yang benar-benar terlihat pada respons atau kegagalan permintaan. Sumber yang
// tidak memaparkan sisa kuota tetap menghasilkan null — tidak ada estimasi kuota, tidak ada
// angka yang dikarang. Modul ini aman dibundel ke peramban: tanpa impor Node.
import { CHANNEL_IDS, CHANNEL_LABELS } from './channels.mjs';

const KIND_LABEL = {
  'rate-limit': 'Source rate limit',
  blocked: 'Request refused by source',
  unavailable: 'Source temporarily unavailable',
  timeout: 'Fetch timeout',
  'page-cap': 'Safety page cap',
  'parse-changed': 'Page structure changed',
  network: 'Network to source',
  unknown: 'Source note',
};

// Pola Indonesia dipertahankan supaya salinan dataset lama di peramban tetap terklasifikasi
// sama seperti saat pertama kali dibaca.
const RULES = [
  { kind: 'rate-limit', test: /http ?429|status ?code ?429|too many requests|rate[ -]?limit|ratelimit|quota|throttl|terlalu banyak permintaan/i },
  { kind: 'blocked', test: /http ?40[13]|http ?451|status ?code ?40[13]|forbidden|unauthorized|captcha|consent|robot|access denied|blocked|traffic mencurigakan|suspicious traffic/i },
  { kind: 'unavailable', test: /http ?50[0-9]|status ?code ?50[0-9]|service unavailable|bad gateway|gateway timeout|temporarily unavailable/i },
  { kind: 'timeout', test: /http ?408|status ?code ?408|batas waktu|timed? ?out|aborterror|timeouterror|deadline|premature/i },
  { kind: 'page-cap', test: /batas halaman|token halaman berikutnya berulang|halaman berikutnya berulang|tautan halaman berikutnya tidak sah|belum tentu habis|page cap|next page token repeated|next page link|next page repeated|not be exhausted/i },
  { kind: 'parse-changed', test: /parse[_ ]error|bukan json|struktur data|tidak terbaca|tidak ditemukan|tidak sah|not json|could not be read|not found|data structure|structure changed/i },
  { kind: 'network', test: /network_error|fetch failed|enotfound|econn|epipe|socket hang up|socket|dns|network/i },
];

const DEFAULT_COOLDOWN_MS = 60000;
const MAX_COOLDOWN_MS = 15 * 60000;
const ATTEMPT_LIMIT = 24;
const HISTORY_LIMIT = 24;

export const LIMIT_STATES = {
  ok: { label: 'Active', tone: 'pos' },
  limited: { label: 'Limited', tone: 'neu' },
  exhausted: { label: 'Limit exhausted', tone: 'neg' },
  failed: { label: 'Read failed', tone: 'neg' },
  empty: { label: 'Source answered, zero reviews', tone: 'slate' },
  setup: { label: 'Needs credentials', tone: 'slate' },
  idle: { label: 'Not pulled yet', tone: 'slate' },
};

export function httpStatusFromText(text) {
  const match = String(text || '').match(/(?:http|status code|statuscode)[^\d]{0,3}(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export function retryAfterMsFrom(text) {
  const match = String(text || '').match(/retry[- ]after[^\d]*(\d+)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 900 ? seconds * 1000 : null;
}

export function classifyIssue(text, extra = {}) {
  const value = String(text || '').trim();
  const httpStatus = Number.isInteger(extra.httpStatus) ? extra.httpStatus : httpStatusFromText(value);
  const retryAfterMs = Number.isFinite(extra.retryAfterMs) ? extra.retryAfterMs : retryAfterMsFrom(value);
  const rule = RULES.find(candidate => candidate.test.test(value));
  const kind = rule ? rule.kind : 'unknown';
  return {
    kind,
    label: KIND_LABEL[kind] || KIND_LABEL.unknown,
    detail: value || KIND_LABEL.unknown,
    httpStatus,
    retryAfterMs: kind === 'rate-limit' ? retryAfterMs : (retryAfterMs ?? null),
  };
}

export function classifyIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .filter(issue => issue && (issue.text || issue.detail))
    .map(issue => ({
      ...classifyIssue(issue.text || issue.detail, issue),
      source: issue.source || 'source',
      at: issue.at || null,
    }));
}

function pagesOf(channel) {
  const coverage = channel?.coverage || {};
  if (Number.isInteger(coverage.pages)) return coverage.pages;
  const shelf = Number.isInteger(coverage.shelfPages) ? coverage.shelfPages : 0;
  const feed = Number.isInteger(coverage.feedPages) ? coverage.feedPages : 0;
  return shelf + feed > 0 ? shelf + feed : null;
}

function reportedOf(channel) {
  const coverage = channel?.coverage || {};
  const app = channel?.app || {};
  return coverage.reportedReviewCount ?? app.reviewCountReported ?? null;
}

function reportedRatingsOf(channel) {
  const coverage = channel?.coverage || {};
  const app = channel?.app || {};
  return coverage.reportedRatingCount ?? app.ratingCount ?? app.ratings ?? null;
}

function fallbackOf(channel) {
  const coverage = channel?.coverage || {};
  if (channel?.id === 'play') {
    const pools = Array.isArray(coverage.pools) ? coverage.pools : [];
    const carrying = pools.filter(pool => pool.added > 0);
    const blocked = pools.filter(pool => pool.error);
    if (!pools.length) return null;
    if (blocked.length && carrying.length) {
      return { used: true, detail: `${blocked.length} pool(s) failed, ${carrying.map(pool => pool.label).join(' + ')} still carried the result` };
    }
    if (carrying.length > 1) return { used: true, detail: 'two language pools merged, duplicates skipped' };
    return { used: false, detail: blocked.length ? 'every pool failed, no fallback path returned rows' : 'one pool was enough on this pull' };
  }
  if (channel?.id === 'appstore') {
    const shelfOk = !coverage.shelfError;
    const feedOk = !coverage.feedError;
    const feedOnly = Number(coverage.feedOnly) || 0;
    if (!shelfOk && feedOk && feedOnly > 0) return { used: true, detail: `the customer feed covered ${feedOnly} reviews that the shelf pages did not return` };
    if (feedOnly > 0) return { used: true, detail: `${feedOnly} reviews exist only on the customer feed (cross path)` };
    return { used: false, detail: shelfOk && feedOk ? 'shelf pages and feed both read' : 'the fallback path returned no extra rows' };
  }
  return null;
}

export function summarizeSource(channel, { now = Date.now(), attempts = [], id = null } = {}) {
  const signals = classifyIssues(channel?.limits?.issues || (channel?.error ? [{ text: channel.error, source: channel?.id }] : []));
  const sourceId = channel?.id || id || 'unknown';
  const kinds = new Set(signals.map(signal => signal.kind));
  const read = Number.isInteger(channel?.fetched) ? channel.fetched : null;
  const rateLimited = kinds.has('rate-limit') || kinds.has('blocked');
  const partial = channel?.status === 'partial' || channel?.truncated === true;

  let state = 'idle';
  const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  const ledgerLimited = lastAttempt?.limited === true;
  const ledgerFailed = Boolean(lastAttempt && (lastAttempt.status === 'error' || lastAttempt.status === 'partial' || ledgerLimited));
  if (channel) {
    if (channel.status === 'needs_setup') state = 'setup';
    else if (rateLimited && (!read)) state = 'exhausted';
    else if (channel.status === 'error') state = rateLimited ? 'exhausted' : 'failed';
    else if (channel.status === 'empty') state = 'empty';
    else if (rateLimited || partial || kinds.has('timeout') || kinds.has('unavailable') || kinds.has('page-cap') || kinds.has('parse-changed')) state = 'limited';
    else if (channel.status === 'success') state = 'ok';
  } else if (ledgerFailed) {
    state = ledgerLimited ? 'exhausted' : 'failed';
  }

  const waitMs = signals.reduce((max, signal) => Math.max(max, signal.retryAfterMs || 0), 0);
  const cooldownMs = (rateLimited || (!channel && ledgerLimited)) ? Math.min(MAX_COOLDOWN_MS, waitMs || DEFAULT_COOLDOWN_MS) : 0;
  const signalAt = signals.map(signal => signal.at).filter(Boolean).sort().slice(-1)[0] || channel?.fetchedAt || lastAttempt?.at || null;
  const anchor = signalAt ? Date.parse(signalAt) : Number.NaN;
  const realCalls = attempts.filter(attempt => !attempt.cacheHit);
  const errorCount = realCalls.filter(attempt => attempt.status === 'error' || attempt.status === 'partial' || attempt.limited).length;

  return {
    id: sourceId,
    label: CHANNEL_LABELS[sourceId] || sourceId,
    appId: channel?.appId || null,
    state,
    stateLabel: LIMIT_STATES[state].label,
    tone: LIMIT_STATES[state].tone,
    status: channel?.status || null,
    signals,
    kindCount: kinds.size,
    rateLimited,
    staleLedger: !channel && attempts.length > 0,
    read,
    reported: reportedOf(channel),
    reportedRatings: reportedRatingsOf(channel),
    pages: pagesOf(channel),
    fallback: fallbackOf(channel),
    errorCount,
    sourceCalls: realCalls.length,
    attempts: attempts.length,
    history: attempts.slice(-HISTORY_LIMIT),
    lastAttemptAt: lastAttempt?.at || channel?.fetchedAt || null,
    lastSignalAt: signalAt,
    cooldownMs: cooldownMs || null,
    nextSafeAt: cooldownMs && Number.isFinite(anchor) ? Math.min(anchor + cooldownMs, anchor + MAX_COOLDOWN_MS) : null,
    budgetMs: channel?.budgetMs ?? null,
    elapsedMs: channel?.elapsedMs ?? null,
    cache: channel?.cache || null,
    note: state === 'idle' || state === 'ok'
      ? null
      : (signals[0]?.detail || channel?.message || (lastAttempt?.status ? `no channel copy on this instance; the last attempt ended ${lastAttempt.status}` : null)),
  };
}

export function monitorFromDataset(dataset, { now = Date.now(), attemptsByKey = {} } = {}) {
  const channels = Array.isArray(dataset?.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const target = dataset?.target || {};
  const enabled = target.social || dataset?.workspaceChannels || {};
  const ids = [...new Set([...CHANNEL_IDS, ...channels.map(channel => channel.id)])];
  const requested = Array.isArray(dataset?.requestedIds) ? dataset.requestedIds : [];
  const sources = ids
    .map(id => {
      const channel = byId.get(id) ? { ...byId.get(id), fetchedAt: dataset?.fetchedAt } : null;
      return {
        ...summarizeSource(channel, { id, now, attempts: attemptsByKey[id] || [] }),
        configured: Boolean(
          channel
          || requested.includes(id)
          || dataset?.workspaceStores?.[id]?.appId
          || (id === 'play' ? target.playAppId : id === 'appstore' ? target.appleAppId : enabled[id]?.enabled),
        ),
      };
    })
    .filter(source => source.configured);
  const waiting = sources.filter(source => source.state === 'setup');
  const ranked = sources.filter(source => !['idle', 'setup'].includes(source.state));
  const worst = ranked.reduce((rank, source) => Math.max(rank, ['ok', 'empty'].includes(source.state) ? 0 : source.state === 'limited' ? 1 : 2), 0);
  const none = !ranked.length;
  return {
    generatedAt: new Date(now).toISOString(),
    target: dataset?.entity || null,
    overall: none ? (waiting.length ? 'setup' : 'idle') : worst === 2 ? 'exhausted' : worst === 1 ? 'limited' : 'ok',
    // Kanal yang menunggu kredensial tidak dihitung sebagai kegagalan, tetapi harus terlihat
    // supaya status gabungan tidak mengklaim "semua jalur terbaca" sementara ada yang menganggur.
    setupCount: waiting.length,
    sources,
    hint: none && waiting.length
      ? `${waiting.map(source => source.label).join(', ')} is waiting for credentials in the server environment. Those channels return needs_setup, never invented empty data.`
      : none
        ? 'This server instance has not stored a channel copy yet, so there is no limit signal to report.'
        : worst === 2
          ? 'At least one source stopped supplying data. Retry after a pause, or force a refresh to try again.'
          : worst === 1
            ? 'Some paths were cut by the time or page limit. The figures shown come only from rows that were actually read.'
            : null,
  };
}

export function pushAttempt(list, attempt, limit = ATTEMPT_LIMIT) {
  const next = [...(Array.isArray(list) ? list : []), attempt];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function attemptFromChannel(channel, { at, ms = null, cacheHit = false, cacheAgeMs = null }) {
  const signals = classifyIssues(channel?.limits?.issues || (channel?.error ? [{ text: channel.error }] : []));
  return {
    at,
    ms: cacheHit ? null : (Number.isFinite(ms) ? Math.round(ms) : null),
    cacheAgeMs: cacheHit && Number.isFinite(cacheAgeMs) ? Math.round(cacheAgeMs) : null,
    status: channel?.status || 'error',
    fetched: Number.isInteger(channel?.fetched) ? channel.fetched : null,
    kinds: [...new Set(signals.map(signal => signal.kind))],
    limited: signals.some(signal => signal.kind === 'rate-limit' || signal.kind === 'blocked'),
    cacheHit,
    pages: pagesOf(channel),
    httpStatuses: [...new Set(signals.map(signal => signal.httpStatus).filter(status => Number.isInteger(status)))],
  };
}
