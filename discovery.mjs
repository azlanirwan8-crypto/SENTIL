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
//   0,85 frasa yang sama muncul di judul toko tanpa spasi — toko menuliskan namanya rapat
//        ("BukaToko: Aplikasi Kasir" untuk kueri "buka toko"), jadi tanpa tingkatan ini
//        aplikasinya benar-benar ada tetapi dinilai tidak mirip sama sekali
//   0,75 × cakupan kata + 0,25 bila judul toko termuat dalam nama entitas
// Angka ini hanya dipakai untuk mengurutkan kandidat dan memutuskan apakah sistem boleh
// memilih sendiri; bukan klaim identitas. Bukti identitas yang sebenarnya adalah halaman
// toko yang dipilih, dan itu diperiksa pada tahap konfirmasi.
export function titleSimilarity(entityName, title) {
  const entity = normalize(entityName), shop = normalize(title);
  if (!entity || !shop) return 0;
  const entityFlat = entity.replace(/\s/g, ''), shopFlat = shop.replace(/\s/g, '');
  if (entity === shop || entityFlat === shopFlat) return 1;
  if (shop.includes(entity)) return .9;
  const wanted = [...new Set(entity.split(' ').filter(token => token.length > 1))];
  const have = new Set(shop.split(' '));
  if (!wanted.length) return 0;
  // Frasa rapat hanya dianggap bila nama entitas memang terdiri dari beberapa kata; untuk satu
  // kata, pengujian di atas sudah cukup dan penambahan tingkat ini hanya melonggarkan aturan.
  const flat = wanted.length > 1 && entityFlat.length >= 6 && shopFlat.includes(entityFlat) ? .85 : 0;
  const coverage = wanted.filter(token => have.has(token)).length / wanted.length;
  const reverse = entity.includes(shopFlat) ? .25 : 0;
  return Math.min(1, Math.max(flat, coverage * .75 + reverse));
}

// Variasi kueri: nama apa adanya, versi tanpa spasi (sering merupakan nama komersial),
// dan versi dengan kata "by" dihapus karena toko menuliskannya dengan cara berbeda.
export function queryVariants(entityName) {
  const raw = String(entityName || '').trim();
  const variants = [raw, raw.replace(/\s+/g, ''), raw.replace(/\s+\bby\b\s+/gi, ' ').trim(), raw.replace(/\bby\b/gi, '').replace(/\s+/g, ' ').trim()];
  return [...new Set(variants.filter(value => value.length >= 2))];
}

// Kartu hasil pencarian Play: tautan `/store/apps/details?id=…` diikuti judul di dalam
// <span class="DdYX5">, penerbit di <span class="wMUdtb">, dan rating di <span class="w2kbF">.
// Sebagian tata letak hanya memberi judul pada aria-label, jadi keduanya dibaca.
// Jendela baca harus lebih panjang dari satu kartu penuh (terukur 1.456 karakter pada
// storefront Indonesia): dengan jendela yang terlalu pendek judul tidak ikut terbaca dan
// pencarian tampak "tidak menemukan apa pun" padahal halamannya berisi puluhan aplikasi.
const playCardWindow = 4000;
const decodeEntities = value => String(value ?? '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, ' ').trim();

const playCardTitle = inner => decodeEntities(/class="DdYX5"[^>]*>([^<]{2,160})</i.exec(inner)?.[1]);
// Label rating ("Diberi rating 3,8 bintang dari 5 bintang") pernah diambil sebagai judul aplikasi
// pada tata letak lama. Frasa semacam ini bukan nama aplikasi, jadi ditolak.
const ratingLikeLabel = /bintang|rating|penilaian|stars?\b/i;
const playLabelTitle = source => {
  const label = decodeEntities(/aria-label="([^"]{2,160})"/i.exec(source)?.[1]);
  return label && !ratingLikeLabel.test(label) ? label : '';
};
// Jumlah tautan aplikasi pada halaman, terpisah dari jumlah judul yang terbaca: selisihnya
// membedakan "aplikasinya memang tidak ada" dari "halamannya terbaca tetapi tidak terurai".
export const countPlayLinks = html => [...String(html || '').matchAll(/href="\/store\/apps\/details\?id=([^"&]+)"/gi)].length;

export function parsePlaySearchResults(html, { limit = 12 } = {}) {
  const text = String(html || '');
  const found = new Map();
  for (const match of text.matchAll(new RegExp(`<a\\b[^>]*href="\\/store\\/apps\\/details\\?id=([^"&]+)"[^>]*>([\\s\\S]{0,${playCardWindow}}?)<\\/a>`, 'gi'))) {
    const appId = decodeURIComponent(match[1]);
    if (!/^[a-zA-Z0-9._-]{3,120}$/.test(appId)) continue;
    const inner = match[2];
    const title = playCardTitle(inner) || playLabelTitle(match[0]) || playLabelTitle(inner);
    if (!title) continue;
    const artist = decodeEntities(/class="wMUdtb"[^>]*>([^<]{2,160})</i.exec(inner)?.[1]);
    const rating = Number(decodeEntities(/class="w2kbF"[^>]*>([\d.,]+)</i.exec(inner)?.[1]).replace(',', '.'));
    if (!found.has(appId)) found.set(appId, {
      appId, title, artist: artist || null,
      averageRating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null,
      sourceUrl: playAppUrl(appId),
    });
    else if (!found.get(appId).artist && artist) found.set(appId, { ...found.get(appId), artist });
  }
  return [...found.values()].slice(0, limit);
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
  // Tautan yang terlihat di halaman Play tetapi tidak menghasilkan judul = pembacaan gagal,
  // bukan aplikasi yang tidak ada. Tanpa pembeda ini, keduanya tampil sama kosong.
  const playLinks = playHtml.reduce((sum, html) => sum + countPlayLinks(html), 0);
  const playDegraded = playLinks > 0 && play.length === 0;
  const pool = [...play.map(candidate => ({ ...candidate, store: 'play' })), ...apple.map(candidate => ({ ...candidate, store: 'appstore' }))];
  const category = detectCategory(pool);
  const agreement = play[0] && apple[0] && normalize(play[0].title).replace(/\s/g, '') === normalize(apple[0].title).replace(/\s/g, '');
  const status = decideStatus(play);
  const appleStatus = decideStatus(apple);
  return {
    entityName: String(entityName || '').trim(), resolvedAt: now, method: discoveryMethod, country,
    play: { status: playDegraded ? 'unreadable' : status, candidates: play, chosen: status === 'confirmed' ? play[0] : null, links: playLinks },
    appstore: { status: appleStatus, candidates: apple, chosen: appleStatus === 'confirmed' ? apple[0] : null },
    category, keywords: deriveKeywords(entityName), titleAgreement: Boolean(agreement),
    needsConfirmation: status !== 'confirmed' || appleStatus !== 'confirmed',
    note: playDegraded
      ? `Halaman pencarian Google Play terbaca dan memuat ${playLinks} tautan aplikasi, tetapi tidak satu pun judulnya dapat diurai. Ini kegagalan pembacaan halaman, bukan bukti aplikasinya tidak ada — isi nama paketnya di kolom manual bila Anda mengetahuinya.`
      : status === 'confirmed'
        ? 'Kandidat Google Play unggul cukup jauh untuk dipilih otomatis; tetap periksa sebelum penarikan penuh.'
        : status === 'not-found'
          ? 'Pencarian Google Play tidak mengembalikan satu pun judul yang dapat dibaca. Tidak ada ID yang dikarang — isi sendiri bila perlu.'
          : 'Beberapa judul hasil pencarian sama-sama mirip dengan nama aplikasi. Pilih salah satu; sistem tidak menebak.',
  };
}

const httpsOnly = url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; } };

// Satu-satunya tempat modul ini menyentuh jaringan. Fetcher disuntuk agar pengujian
// tidak pernah memanggil Google atau Apple.
//
// Hasil pencarian disimpan sebentar (targetCacheTtlMs): halaman Play membatasi alamat keluar
// function serverless, jadi mengetik satu nama lalu menekan "Cari ulang" tidak boleh membayar
// ulang seluruh permintaan. Cache hanya menyimpan hasil pencarian, bukan pilihan pengguna.
const discoveryCache = new Map();
export function clearDiscoveryCache() { discoveryCache.clear(); }

export async function discoverTarget({ entityName, fetcher = fetch, country = 'id', locale = { hl: 'id', gl: 'id' }, timeoutMs = 20000 } = {}) {
  const name = String(entityName || '').trim();
  if (name.length < 2) return { ok: false, error: 'Nama aplikasi minimal 2 karakter; tidak ada permintaan yang dikirim.' };
  const cacheKey = `${country}|${locale.hl}|${locale.gl}|${name.toLowerCase()}`;
  // Cache hanya dipakai untuk permintaan nyata. Fetcher suntikan (pengujian, atau panggilan ulang
  // dengan sumber berbeda) harus selalu menjalankan permintaannya sendiri.
  const useCache = fetcher === fetch;
  const cached = useCache ? discoveryCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.at < targetCacheTtlMs) return { ...cached.result, cached: true };
  const queries = queryVariants(name).slice(0, 3);
  const urls = [
    ...queries.map(query => playSearchUrl(query, locale)),
    // Apple dan Google menulis nama aplikasi dengan cara berbeda; satu variasi saja membuat
    // aplikasi bernama rapat ("wondrmerchant") tidak pernah terkirim ke iTunes.
    ...[queries[0], queries[1]].filter(Boolean).map(query => itunesSearchUrl(query, country)),
  ].filter(httpsOnly);
  const settled = await Promise.allSettled(urls.map(async url => {
    const response = await fetcher(url, { headers: url.includes('itunes.apple.com') ? { accept: 'application/json' } : { 'user-agent': 'Mozilla/5.0', 'accept-language': `${locale.hl}-ID,${locale.hl};q=0.9` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return url.includes('itunes.apple.com') ? { kind: 'itunes', value: await response.json() } : { kind: 'play', value: await response.text() };
  }));
  const playHtml = [];
  // Beberapa variasi kueri digabung sebelum diparsing: toko dapat menulis namanya rapat
  // ("wondrmerchant") atau berjarak ("wondr merchant"), dan masing-masing mengembalikan set
  // aplikasi yang tidak identik. Bentuk mentahnya yang disimpan agar penafsir hanya sekali.
  const rawItunes = new Map();
  for (const result of settled) if (result.status === 'fulfilled' && result.value.kind === 'itunes')
    for (const item of Array.isArray(result.value.value?.results) ? result.value.value.results : [])
      if (!rawItunes.has(item?.trackId)) rawItunes.set(item?.trackId, item);
  const itunes = rawItunes.size ? { results: [...rawItunes.values()] } : null;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.kind === 'play') playHtml.push(result.value.value);
    else if (result.status === 'rejected' && urls[index].includes('itunes') === false) playHtml.push('');
  });
  const failures = settled.filter(result => result.status === 'rejected').length;
  const discovery = buildDiscovery({ entityName: name, playHtml, itunes, country });
  const result = { ok: true, discovery, queries, partial: failures > 0 ? `${failures} dari ${urls.length} permintaan pencarian tidak terjawab; kandidat yang ada tetap ditampilkan.` : null };
  // Hasil yang PARAH (sebagian permintaan tidak terjawab) tidak disimpan: membekukannya selama
  // satu jam akan mengubah gangguan sesaat menjadi "aplikasinya tidak ada".
  if (useCache && failures === 0 && (discovery.play.candidates.length || discovery.appstore.candidates.length))
    discoveryCache.set(cacheKey, { at: Date.now(), result });
  return result;
}
