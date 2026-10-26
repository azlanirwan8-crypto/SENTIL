// Penyaring kandidat identitas toko. Aturan hanya struktural: token nama, kata
// struktur (by/pt/tbk/…), dan sebaran token di dalam pool hasil pencarian. Tidak ada
// kamus merek atau daftar aplikasi di sini, jadi filter ikut belajar dari toko.
// Kandidat dipertahankan hanya bila namanya memuat SEMUA kata yang dicari.
const STOP = new Set([
  'by', 'pt', 'tbk', 'persero', 'the', 'dan', 'and', 'for', 'of', 'di', 'a',
  'app', 'apps', 'aplikasi', 'official', 'resmi', 'new', 'terbaru',
]);

const GENERIC_SPREAD = 0.6;
const GENERIC_WEIGHT = 0.35;
const KEEP_LIMIT = 8;
const NEAREST_LIMIT = 4;
const NEAREST_SCORE = 0.5;

export function nameTokens(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function coreOf(tokens) {
  const stripped = tokens.filter(token => token.length > 1 && !STOP.has(token));
  if (stripped.length) return stripped;
  const kept = tokens.filter(token => !STOP.has(token));
  return kept.length ? kept : tokens;
}

function distinct(values) {
  return [...new Set(values)];
}

export function coreTerms(query) {
  return distinct(coreOf(nameTokens(query)));
}

export function scoreNameMatch(query, title, spread = new Map()) {
  const queryCore = coreTerms(query);
  const titleCore = new Set(coreOf(nameTokens(title)));
  if (!queryCore.length) {
    return { tier: 'none', score: 0, coversAll: false, firstMatched: false, matched: [], missing: [] };
  }

  const weight = token => (spread.get(token) || 1) > GENERIC_SPREAD ? GENERIC_WEIGHT : 1;
  const total = queryCore.reduce((sum, token) => sum + weight(token), 0);
  const matched = queryCore.filter(token => titleCore.has(token));
  const missing = queryCore.filter(token => !titleCore.has(token));
  const coversAll = missing.length === 0;
  const firstMatched = titleCore.has(queryCore[0]);

  let score = total ? matched.reduce((sum, token) => sum + weight(token), 0) / total : 0;
  if (!coversAll && weight(queryCore[0]) === 1 && !firstMatched) score *= 0.6;

  const queryText = queryCore.join(' ');
  const titleText = [...titleCore].join(' ');
  const exact = coversAll
    && (queryText === titleText || titleText.startsWith(`${queryText} `) || queryText.startsWith(`${titleText} `));

  const tier = !coversAll ? 'nearest' : exact ? 'exact' : 'full';
  return { tier, score: Number(score.toFixed(3)), coversAll, firstMatched, matched, missing };
}

const TIER_RANK = { exact: 0, full: 1, nearest: 2, none: 3 };

export function filterCandidates(query, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const queryTokens = coreTerms(query);
  if (!list.length) return { kept: [], dropped: 0, mode: 'empty', queryTokens };

  const cores = list.map(candidate => new Set(coreOf(nameTokens(candidate?.title ?? ''))));
  const spread = new Map();
  for (const token of queryTokens) {
    spread.set(token, cores.reduce((count, core) => count + (core.has(token) ? 1 : 0), 0) / list.length);
  }

  const scored = list.map((candidate, index) => ({ candidate, match: scoreNameMatch(query, candidate?.title ?? '', spread), index }));
  const matches = scored.filter(entry => entry.match.coversAll);
  const mode = matches.length ? 'matched' : 'nearest';
  const pool = matches.length
    ? matches
    : scored.filter(entry => entry.match.score >= NEAREST_SCORE);
  const limit = matches.length ? KEEP_LIMIT : NEAREST_LIMIT;

  const ordered = pool.sort((left, right) => TIER_RANK[left.match.tier] - TIER_RANK[right.match.tier]
    || Number(right.match.firstMatched) - Number(left.match.firstMatched)
    || right.match.score - left.match.score
    || (Number(right.candidate?.ratings) || 0) - (Number(left.candidate?.ratings) || 0)
    || left.index - right.index);

  return {
    kept: ordered.slice(0, limit).map(entry => ({ ...entry.candidate, match: entry.match })),
    dropped: list.length - Math.min(ordered.length, limit),
    mode,
    queryTokens,
  };
}

export function describeCandidates(filter, storeLabel) {
  const searched = filter.queryTokens.join(' ') || 'this name';
  if (filter.mode === 'empty') return `The ${storeLabel} source did not return any app.`;
  if (filter.mode === 'nearest') {
    return filter.kept.length
      ? `No ${storeLabel} result carries "${searched}" in its name. These are the ${filter.kept.length} closest matches — write the name exactly as the store shows it to get a different set.`
      : `No ${storeLabel} result carries "${searched}" in its name. Every store result was filtered out; change the spelling or add a more specific word.`;
  }
  const suffix = filter.dropped > 0
    ? `${filter.dropped} other results were filtered out because their name does not contain "${searched}".`
    : 'Every store result contains the searched words.';
  return `${filter.kept.length} ${storeLabel} candidate(s) match "${searched}". ${suffix} Pick the identity that is right; the app does not choose a candidate for you.`;
}
