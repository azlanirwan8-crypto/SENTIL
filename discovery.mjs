// Penemuan identitas entitas tanpa kunci API dan tanpa dependensi.
//
// Dua temuan nyata dari halaman pencarian Google Play dan iTunes Search API (25 Oktober 2026)
// menentukan desain modul ini:
//   1. Hasil TERATAS pencarian Play tidak dapat dipercaya. Untuk kueri "wondr merchant" pada
//      storefront Indonesia, kartu pertama adalah `id.bni.wondr` (aplikasi konsumen bank yang
//      sama) dan `id.co.bni.merchant` (aplikasi lama), sedangkan aplikasi yang dimaksud
//      (`id.bni.wfb`, judul "wondr merchant by BNI") baru muncul setelahnya. Memilih top-1
//      secara otomatis akan menganalisis aplikasi yang salah tanpa suara-suara.
//   2. Bentuk judul berbeda antar kanal ("wondr merchant by BNI" vs "wondrmerchant"), sehingga
//      beberapa variasi kueri digabung lalu diurutkan menurut kemiripan judul.
// Karena itu modul ini SELALU mengembalikan daftar kandidat beserta alasannya. Status
// 'confirmed' hanya dipakai bila satu kandidat unggul jauh; selain itu pengguna harus
// memastikan sendiri. Tidak ada ID yang dikarang.
const itunesLimit = 12;
export const discoveryMethod = 'store-search-candidates-v1';
export const categoryNames = { auto: 'Auto / Smart Detect', fintech: 'Banking & Fintech', ecommerce: 'E-Commerce', app: 'General App' };
export const targetCacheTtlMs = 60 * 60 * 1000;

export const playSearchUrl = (term, { hl = 'id', gl = 'id' } = {}) => `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${hl}&gl=${gl}`;
export const playAppUrl = appId => `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=id`;
export const itunesSearchUrl = (term, country = 'id') => `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=${itunesLimit}`;
export const appleAppUrl = (trackId, country = 'id') => `https://apps.apple.com/${country}/app/id${encodeURIComponent(trackId)}`;

const normalize = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Kemiripan judul, dari bukti terkuat ke terlemah:
//   1,0  sama persis setelah normalisasi (spasi diabaikan)
//   0,9  nama entitas muncul sebagai frasa utuh di dalam judul toko
//   0,75 × cakupan kata + 0,25 bila judul toko termuat dalam nama entitas
// Angka ini hanya dipakai untuk mengurutkan kandidat dan memutuskan apakah sistem boleh
// memilih sendiri; bukan klaim identitas. Bukti identitas yang sebenarnya adalah halaman
// toko yang dipilih, dan itu diperiksa pada tahap konfirmasi.
export function titleSimilarity(entityName, title) {
  const entity = normalize(entityName), shop = normalize(title);
  if (!entity || !shop) return 0;
  if (entity === shop || entity.replace(/\s/g, '') === shop.replace(/\s/g, '')) return 1;
  if (shop.includes(entity)) return .9;
  const wanted = [...new Set(entity.split(' ').filter(token => token.length > 1))];
  const have = new Set(shop.split(' '));
  if (!wanted.length) return 0;
  const coverage = wanted.filter(token => have.has(token)).length / wanted.length;
  const reverse = entity.includes(shop.replace(/\s/g, '')) ? .25 : 0;
  return Math.min(1, coverage * .75 + reverse);
}

// Variasi kueri: nama apa adanya, versi tanpa spasi (sering merupakan nama komersial),
// dan versi dengan kata "by" dihapus karena toko menuliskannya dengan cara berbeda.
export function queryVariants(entityName) {
  const raw = String(entityName || '').trim();
  const variants = [raw, raw.replace(/\s+/g, ''), raw.replace(/\s+\bby\b\s+/gi, ' ').trim(), raw.replace(/\bby\b/gi, '').replace(/\s+/g, ' ').trim()];
  return [...new Set(variants.filter(value => value.length >= 2))];
}

// Kartu hasil pencarian Play: tautan `/store/apps/details?id=…` disertai `aria-label` berisi
// judul aplikasi. Judul diambil dari label terdekat pada anchor yang sama atau sesudahnya.
export function parsePlaySearchResults(html, { limit = 12 } = {}) {
  const text = String(html || '');
  const found = new Map();
  for (const match of text.matchAll(/href="\/store\/apps\/details\?id=([^"&]+)"([^>]*)>([\s\S]{0,1200}?)(?:<\/a>|class="Y4A2mc")/gi)) {
    const appId = decodeURIComponent(match[1]);
    if (!/^[a-zA-Z0-9._-]{3,120}$/.test(appId)) continue;
    const label = /aria-label="([^"]{2,120})"/i.exec(match[2])?.[1] || /aria-label="([^"]{2,120})"/i.exec(match[3])?.[1] || '';
    const title = label.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (!found.has(appId)) found.set(appId, { appId, title, sourceUrl: playAppUrl(appId) });
    else if (!found.get(appId).title && title) found.set(appId, { ...found.get(appId), title });
  }
  return [...found.values()].filter(candidate => candidate.title).slice(0, limit);
}

export function parseItunesResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.filter(item => Number.isFinite(Number(item.trackId)) && typeof item.trackName === 'string').map(item => ({
    appId: String(item.trackId),
    title: item.trackName.trim(),
    artist: typeof item.artistName === 'string' ? item.artistName.trim() : 'N/A',
    genre: typeof item.primaryGenreName === 'string' ? item.primaryGenreName : 'N/A',
    ratingCount: Number.isFinite(Number(item.userRatingCount)) ? Number(item.userRatingCount) : null,
    averageRating: Number.isFinite(Number(item.averageUserRating)) ? Number(item.averageUserRating) : null,
    price: typeof item.formattedPrice === 'string' ? item.formattedPrice : 'N/A',
    releasedAt: typeof item.releaseDate === 'string' ? item.releaseDate : null,
    sourceUrl: appleAppUrl(item.trackId),
  })).slice(0, itunesLimit);
}

const fintechWords = ['bank', 'perbankan', 'finance', 'fintech', 'pembayaran', 'payment', 'qris', 'dompet', 'wallet', 'kredit', 'pinjaman', 'investasi', 'ojk', 'money'];
const commerceWords = ['shop', 'belanja', 'marketplace', 'e-commerce', 'ecommerce', 'store', 'delivery', 'kirim', 'retail'];
// Kategori dideteksi dari kata yang benar-benar ada pada judul/penerbit/genre kandidat.
// Bila tidak ada bukti, hasilnya 'app' — bukan tebakan ke arah fintech.
export function detectCategory(candidates) {
  const haystack = normalize(candidates.map(candidate => `${candidate.title} ${candidate.artist || ''} ${candidate.genre || ''}`).join(' '));
  if (!haystack) return 'app';
  const hits = words => words.filter(word => haystack.includes(word)).length;
  const finance = hits(fintechWords), commerce = hits(commerceWords);
  if (!finance && !commerce) return 'app';
  return finance === commerce ? 'app' : finance > commerce ? 'fintech' : 'ecommerce';
}

// Kata kunci turunan untuk penyaringan kanal teks (sosial, YouTube, berita). Nama entitas
// dipakai apa adanya sebagai frasa berkutip; kata tunggal pendek dibuang karena terlalu
// longgar (mis. "by", "id"). Tidak ada kata merek yang dipatok di kode.
export function deriveKeywords(entityName) {
  const raw = String(entityName || '').trim();
  const compact = raw.replace(/\s+/g, '');
  const words = [...new Set(normalize(raw).split(' ').filter(word => word.length >= 4))];
  const phrases = [...new Set([raw, compact, `${raw} aplikasi`].filter(phrase => phrase.length >= 3))];
  const quoted = phrases.filter(phrase => phrase.includes(' ')).map(phrase => `"${phrase}"`);
  return { entity: raw, compact, terms: [...new Set([...words, compact])], phrases, quoted, searchTerms: [...new Set([...quoted, compact])] };
}

const ranked = (candidates, entityName) => candidates
  .map(candidate => ({ ...candidate, similarity: Number(titleSimilarity(entityName, candidate.title).toFixed(3)) }))
  .sort((a, b) => b.similarity - a.similarity || 0)
  .slice(0, 8);

// Ambang konfirmasi dibuat ketat dari hasil pemeriksaan nyata: kandidat dengan kemiripan 0,75
// (mis. "Tokopedia & TikTok Shop Seller" untuk kueri "tokopedia seller") masih terlalu longgar
// untuk dipilih otomatis. 'confirmed' hanya bila judul toko memuat nama entitas sebagai frasa
// utuh (≥ 0,9) dan unggul jauh dari peringkat dua.
export const discoveryLead = 0.25, discoveryFloor = 0.9;
export function decideStatus(list) {
  if (!list.length) return 'not-found';
  if (list[0].similarity < discoveryFloor) return 'ambiguous';
  const runnerUp = list[1]?.similarity ?? 0;
  return list[0].similarity - runnerUp >= discoveryLead ? 'confirmed' : 'ambiguous';
}

export function buildDiscovery({ entityName, playHtml = [], itunes = null, now = new Date().toISOString(), country = 'id' }) {
  const seen = new Map();
  for (const html of playHtml) for (const candidate of parsePlaySearchResults(html)) {
    if (!seen.has(candidate.appId)) seen.set(candidate.appId, candidate);
    else if (!seen.get(candidate.appId).title && candidate.title) seen.set(candidate.appId, candidate);
  }
  const play = ranked([...seen.values()], entityName);
  const apple = ranked(parseItunesResults(itunes), entityName);
  const pool = [...play.map(candidate => ({ ...candidate, store: 'play' })), ...apple.map(candidate => ({ ...candidate, store: 'appstore' }))];
  const category = detectCategory(pool);
  const agreement = play[0] && apple[0] && normalize(play[0].title).replace(/\s/g, '') === normalize(apple[0].title).replace(/\s/g, '');
  const status = decideStatus(play);
  const appleStatus = decideStatus(apple);
  return {
    entityName: String(entityName || '').trim(), resolvedAt: now, method: discoveryMethod, country,
    play: { status, candidates: play, chosen: status === 'confirmed' ? play[0] : null },
    appstore: { status: appleStatus, candidates: apple, chosen: appleStatus === 'confirmed' ? apple[0] : null },
    category, keywords: deriveKeywords(entityName), titleAgreement: Boolean(agreement),
    needsConfirmation: status !== 'confirmed' || appleStatus !== 'confirmed',
    note: status === 'confirmed'
      ? 'Kandidat Google Play unggul cukup jauh untuk dipilih otomatis; tetap periksa sebelum penarikan penuh.'
      : status === 'not-found'
        ? 'Pencarian Google Play tidak mengembalikan satu pun judul yang dapat dibaca. Tidak ada ID yang dikarang — isi sendiri bila perlu.'
        : 'Beberapa judul hasil pencarian sama-sama mirip dengan nama entitas. Pilih salah satu; sistem tidak menebak.',
  };
}

const httpsOnly = url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; } };

// Satu-satunya tempat modul ini menyentuh jaringan. Fetcher disuntuk agar pengujian
// tidak pernah memanggil Google atau Apple.
export async function discoverTarget({ entityName, fetcher = fetch, country = 'id', locale = { hl: 'id', gl: 'id' }, timeoutMs = 20000 } = {}) {
  const name = String(entityName || '').trim();
  if (name.length < 2) return { ok: false, error: 'Nama entitas minimal 2 karakter; tidak ada permintaan yang dikirim.' };
  const queries = queryVariants(name).slice(0, 3);
  const urls = [
    ...queries.map(query => playSearchUrl(query, locale)),
    itunesSearchUrl(queries[0], country),
  ].filter(httpsOnly);
  const settled = await Promise.allSettled(urls.map(async url => {
    const response = await fetcher(url, { headers: url.includes('itunes.apple.com') ? { accept: 'application/json' } : { 'user-agent': 'Mozilla/5.0', 'accept-language': `${locale.hl}-ID,${locale.hl};q=0.9` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return url.includes('itunes.apple.com') ? { kind: 'itunes', value: await response.json() } : { kind: 'play', value: await response.text() };
  }));
  const playHtml = [], itunes = settled.find(result => result.status === 'fulfilled' && result.value.kind === 'itunes')?.value?.value ?? null;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.kind === 'play') playHtml.push(result.value.value);
    else if (result.status === 'rejected' && urls[index].includes('itunes') === false) playHtml.push('');
  });
  const failures = settled.filter(result => result.status === 'rejected').length;
  const discovery = buildDiscovery({ entityName: name, playHtml, itunes, country });
  return { ok: true, discovery, queries, partial: failures > 0 ? `${failures} dari ${urls.length} permintaan pencarian tidak terjawab; kandidat yang ada tetap ditampilkan.` : null };
}
