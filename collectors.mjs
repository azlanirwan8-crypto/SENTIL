import { createHash } from 'node:crypto';
import { playUrl } from './data.js';
import { validDate, validSource } from './model.js';

const appleId = '6741567238';
const appleUrl = `https://apps.apple.com/id/app/wondr-merchant-by-bni/id${appleId}?see-all=reviews&platform=iphone`;
// Batas keamanan jumlah tautan lanjutan, bukan pembatas jumlah sampel.
const applePageLimit = 30;
// Google memisahkan daftar ulasan menurut bahasa antarmuka. Setiap kumpulan harus dibaca lalu digabung.
export const playPools = [
  { hl: 'id', gl: 'ID', label: 'kumpulan bahasa Indonesia' },
  { hl: 'en', gl: 'US', label: 'kumpulan bahasa Inggris' },
];
const rpcUrl = (hl, gl) => `https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=oCPfdb&hl=${hl}&gl=${gl}`;
const check = (condition, message) => { if (!condition) throw new Error(`parse_error: ${message}`); };
const scripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
async function fetchText(url, options = {}, fetcher = fetch) {
  let response;
  try { response = await fetcher(url,{ ...options, redirect:'error', signal:AbortSignal.timeout(25000) }); }
  catch { throw new Error('network_error: koneksi sumber gagal atau melewati 25 detik.'); }
  if (!response.ok) throw new Error(`http_error: sumber mengembalikan HTTP ${response.status}.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error('response_error: respons sumber melebihi batas 12 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function normalizeReview(raw, platform, sourceUrl) {
  check(typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 200,'ID ulasan tidak valid');
  check(typeof raw.text === 'string' && raw.text.length <= 20000,'teks ulasan tidak valid');
  check(raw.author == null || (typeof raw.author === 'string' && raw.author.length <= 500),'nama pengguna tidak valid');
  check(raw.title == null || (typeof raw.title === 'string' && raw.title.length <= 2000),'judul ulasan tidak valid');
  check(raw.rating == null || (Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 5),'rating ulasan tidak valid');
  let publishedAt = null;
  if (raw.date != null) {
    check(typeof raw.date === 'string' && Number.isFinite(Date.parse(raw.date)) && validDate(raw.date.slice(0,10)),'tanggal ulasan tidak valid');
    publishedAt = raw.date;
  }
  return { id:platform === 'appstore' ? `apple-${raw.id}` : raw.id, platform, author:raw.author?.trim() || 'N/A', text:raw.text, ...(raw.title != null ? {title:raw.title} : {}), rating:raw.rating ?? null, date:publishedAt?.slice(0,10) ?? null, publishedAt, sourceUrl, provenance:platform === 'play' ? 'Halaman publik Google Play; gabungan kumpulan ulasan bahasa Indonesia dan Inggris, urutan terbaru (id.bni.wfb)' : 'Halaman ulasan publik App Store Indonesia; ID dan waktu asli (6741567238)' };
}
export function parseGoogleListing(html) {
  const listing = scripts(html).filter(m => /type=["']application\/ld\+json["']/i.test(m[1])).map(m => JSON.parse(m[2])).find(x => x['@type'] === 'SoftwareApplication');
  check(listing && new URL(listing.url).searchParams.get('id') === 'id.bni.wfb','identitas aplikasi di Google Play berubah');
  const rating = Number(listing.aggregateRating?.ratingValue), ratingCount = Number(listing.aggregateRating?.ratingCount);
  check(rating >= 1 && rating <= 5 && Number.isInteger(ratingCount) && ratingCount >= 0,'nilai rating Google Play tidak terbaca');
  return {rating,ratingCount};
}
// Histogram bintang pada halaman toko ikut dihitung karena Google menampilkan jumlah
// per bintang untuk SELURUH penilaian, termasuk yang tidak membawa teks ulasan.
export function parsePlayRatingHistogram(html) {
  const counts = new Map();
  for (const match of html.matchAll(/aria-label="(\d{1,7})\s*(?:reviews?|ulasan)\s+for star rating\s+([1-5])"/gi)) counts.set(Number(match[2]), Number(match[1]));
  for (const match of html.matchAll(/aria-label="(\d{1,7})\s*(?:reviews?|ulasan)\s+untuk rating bintang\s+([1-5])"/gi)) counts.set(Number(match[2]), Number(match[1]));
  if (counts.size !== 5) return null;
  const histogram = [5,4,3,2,1].map(star => counts.get(star));
  if (histogram.some(value => !Number.isInteger(value) || value < 0)) return null;
  return { histogram, total: histogram.reduce((sum, value) => sum + value, 0) };
}
// Google hanya menampilkan rentang unduhan, misalnya "10K+", bukan angka pasti.
export function parsePlayInstalls(html) {
  const match = html.match(/<div class="[^"]*">([^<]{1,24})<\/div><div class="[^"]*">\s*(Downloads|Unduhan)\s*<\/div>/i);
  return match ? match[1].trim() : null;
}
export function parseGoogleReviews(text) {
  const frames = text.split(/\r?\n/).filter(line => line.trimStart().startsWith('[')).flatMap(line => JSON.parse(line));
  const frame = frames.find(f => f[0] === 'wrb.fr' && f[1] === 'oCPfdb');
  check(frame,'data ulasan Google Play tidak ditemukan');
  if (typeof frame[2] !== 'string') throw new Error('rpc_error: sumber tidak mengirimkan isi ulasan; ini bukan berarti tidak ada ulasan.');
  const payload = JSON.parse(frame[2]);
  check(Array.isArray(payload) && Array.isArray(payload[0]),'struktur ulasan Google berubah');
  check(payload[1] == null || (Array.isArray(payload[1]) && typeof payload[1][1] === 'string'),'struktur halaman berikutnya di Google Play berubah');
  const reviews = payload[0].map(r => {
    let date = null;
    if (r[5] != null) {
      check(Array.isArray(r[5]) && Number.isFinite(r[5][0]) && (r[5][1] == null || Number.isFinite(r[5][1])),'waktu ulasan Google tidak valid');
      date = new Date(r[5][0]*1000 + Math.floor((r[5][1] || 0)/1e6)).toISOString();
    }
    return normalizeReview({id:r[0],author:r[1]?.[0],rating:r[2],text:r[4] ?? '',date},'play',playUrl);
  }).filter(r => r.text.trim());
  return {reviews, rows: payload[0].length, cursor:payload[1]?.[1] ?? null};
}
export function parseApplePage(html) {
  const script = scripts(html).find(m => /\bid=["']serialized-server-data["']/i.test(m[1]));
  check(script,'data ulasan App Store tidak ditemukan');
  const root = JSON.parse(script[2]);
  check(Array.isArray(root.data),'struktur data App Store berubah');
  const page = root.data.find(x => x.intent?.id === appleId && x.intent?.storefront === 'id')?.data;
  const shelf = page?.shelfMapping?.allProductReviews;
  const listing = page?.shelfMapping?.productRatings?.items?.[0];
  check(Array.isArray(shelf?.items),'bagian ulasan App Store tidak ditemukan');
  check(listing?.productId === appleId,'identitas aplikasi di App Store berubah');
  const rating = Number(listing.ratingAverage), ratingCount = Number(listing.totalNumberOfRatings);
  check(rating >= 1 && rating <= 5 && Number.isInteger(ratingCount) && ratingCount >= 0,'nilai rating App Store tidak terbaca');
  // Apple menyimpan jumlah per bintang pada urutan 5→1. Urutan tidak diasumsikan:
  // diverifikasi dari jumlah total dan rata-rata terbobot yang dipublikasikan sumber.
  const rawCounts = Array.isArray(listing.ratingCounts) && listing.ratingCounts.length === 5 && listing.ratingCounts.every(value => Number.isInteger(value) && value >= 0) ? listing.ratingCounts : null;
  const countsSum = rawCounts ? rawCounts.reduce((sum, value) => sum + value, 0) : null;
  const weighted = countsSum ? rawCounts.reduce((sum, value, index) => sum + value * (5 - index), 0) / countsSum : null;
  const ratingHistogram = rawCounts && countsSum === ratingCount && Math.abs(weighted - rating) <= 0.06 ? rawCounts : null;
  const unique = new Map();
  for (const item of shelf.items) {
    const r = item.review;
    check(r?.$kind === 'Review','struktur data ulasan Apple berubah');
    const review = normalizeReview({id:r.id,author:r.reviewerName,title:r.title,text:r.contents ?? '',rating:r.rating,date:r.date},'appstore',appleUrl);
    if (review.text.trim()) unique.set(review.id,review);
  }
  return {reviews:[...unique.values()],rating,ratingCount,ratingHistogram,continuationUrl: shelf.url ?? null};
}
// Paginasi dibaca sampai sumber tidak mengirim token halaman berikutnya; tidak ada batas jumlah sampel.
const timeBudget = 240000;
export async function collectGoogle(fetcher = fetch) {
  const listingHtml = await fetchText(playUrl + '&gl=ID',{},fetcher);
  const metadata = parseGoogleListing(listingHtml);
  const breakdown = parsePlayRatingHistogram(listingHtml);
  let installs = null;
  try { installs = parsePlayInstalls(await fetchText('https://play.google.com/store/apps/details?id=id.bni.wfb&hl=en&gl=US',{},fetcher)); }
  catch { installs = null; }
  const reviews = new Map();
  const pools = [];
  const started = Date.now();
  for (const pool of playPools) {
    const pageUrl = `https://play.google.com/store/apps/details?id=id.bni.wfb&hl=${pool.hl}&gl=${pool.gl}`;
    let cursor = null, complete = false, pagesRead = 0, rows = 0, added = 0, error = null;
    const cursors = new Set();
    for (;;) {
      if (Date.now() - started > timeBudget) { error = 'time_budget: batas waktu pengambilan tercapai; halaman berikutnya belum dibaca.'; break; }
      try {
        const args = [null,[2,2,[100,null,cursor],null,[null,null,null,null,null,null,null,null,2]],['id.bni.wfb',7]];
        const raw = await fetchText(rpcUrl(pool.hl,pool.gl),{method:'POST',body:new URLSearchParams({'f.req':JSON.stringify([[['oCPfdb',JSON.stringify(args),null,'generic']]])})},fetcher);
        const result = parseGoogleReviews(raw);
        pagesRead++; rows += result.rows;
        for (const review of result.reviews) if (!reviews.has(review.id)) { reviews.set(review.id,{...review,sourceUrl:pageUrl}); added++; }
        cursor = result.cursor;
        if (!cursor) { complete = true; break; }
        check(!cursors.has(cursor),'pagination_error: halaman berikutnya berulang; pengambilan dihentikan.');
        cursors.add(cursor);
      } catch (cause) { error = cause.message; break; }
    }
    pools.push({ ...pool, pagesRead, rows, added, complete, error });
  }
  const allPoolsComplete = pools.every(p => p.complete);
  const issues = pools.filter(p => p.error).map(p => `${p.label}: ${p.error}`);
  const depth = pools.map(p => `${p.label}: ${p.pagesRead} halaman, ${p.rows} baris`).join('; ');
  const histogramNote = breakdown
    ? `Histogram penilaian halaman toko dibaca penuh: ${breakdown.histogram.map((value, index) => `${5 - index}★=${value}`).join(', ')} (total ${breakdown.total} penilaian). ${reviews.size} ulasan membawa teks publik dan masuk analisis sentimen; ${breakdown.total - reviews.size} penilaian tanpa teks ikut dihitung sebagai penilaian tetapi tidak dapat dianalisis sentimennya.`
    : 'Histogram per bintang tidak terbaca pada pemeriksaan ini, sehingga hanya angka agregat halaman toko yang tersedia.';
  return {id:'play',status:allPoolsComplete?'success':'partial',...metadata,...(breakdown?{ratingHistogram:breakdown.histogram,ratingHistogramTotal:breakdown.total}:{}),installs,reviews:[...reviews.values()],fetched:reviews.size,
    coverage:{pools:pools.map(({hl,gl,label,pagesRead,rows,added,complete,error})=>({hl,gl,label,pagesRead,rows,added,complete,error})),pagesRead:pools.reduce((sum,p)=>sum+p.pagesRead,0),rows:pools.reduce((sum,p)=>sum+p.rows,0),sampleLimit:null},
    message:`${reviews.size} ulasan tertulis unik dibaca dari Google Play sebagai gabungan ${pools.map(p=>`${p.added} ulasan ${p.label}`).join(' dan ')}. Kedua kumpulan ditampilkan Google berdasarkan bahasa antarmuka, sehingga keduanya dibaca agar tidak ada ulasan terlewat. Paginasi diikuti sampai sumber tidak mengirim halaman berikutnya (${depth}); kolektor tidak memiliki batas jumlah sampel. ${allPoolsComplete?'Kedua kumpulan selesai dipaginasi.':`Hasil belum lengkap; ${issues.join('; ')}`} ${histogramNote} Angka agregat halaman toko menyebut ${metadata.ratingCount} penilaian; kedua angka dipublikasikan Google pada elemen halaman yang berbeda dan tidak dipaksa sama. Unduhan: ${installs ? `${installs} (rentang yang dipublikasikan Google, bukan angka pasti)` : 'tidak terbaca pada pemeriksaan ini'}.${issues.length?` Catatan: ${issues.join('; ')}`:''}`};
}
// Feed ulasan pelanggan publik Apple menjadi jalur resmi kedua, sehingga daftar halaman web dapat diuji silang.
export function parseAppleRss(text) {
  let feed;
  try { feed = JSON.parse(text).feed; } catch { throw new Error('parse_error: struktur feed ulasan App Store berubah'); }
  check(feed != null,'feed ulasan App Store tidak ditemukan');
  const reviews = [].concat(feed.entry ?? []).filter(entry => entry?.id?.label != null).map(entry => {
    const rating = Number(entry['im:rating']?.label);
    check(typeof entry.content?.label === 'string','teks ulasan feed App Store tidak valid');
    check(entry.author?.name?.label == null || typeof entry.author.name.label === 'string','nama penulis feed App Store tidak valid');
    return normalizeReview({id:String(entry.id.label),author:entry.author?.name?.label,title:entry.title?.label,text:entry.content.label,rating:Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,date:entry.updated?.label},'appstore',appleUrl);
  }).filter(review => review.text.trim());
  return {reviews};
}
function appleNextUrl(value, current) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value,'https://apps.apple.com'); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || !url.pathname.includes(`/id${appleId}`)) return null;
  return url.href === current ? null : url.href;
}
async function collectAppleShelf(fetcher) {
  const reviews = new Map(), seen = new Set();
  let url = appleUrl, rating = null, ratingCount = null, ratingHistogram = null, pages = 0, complete = false, error = null;
  for (;;) {
    if (seen.has(url)) { error = 'pagination_error: tautan lanjutan berulang; pengambilan dihentikan.'; break; }
    seen.add(url);
    if (pages >= applePageLimit) { error = 'page_limit: batas keamanan tautan lanjutan tercapai; halaman berikutnya belum dibaca.'; break; }
    let result;
    try { result = parseApplePage(await fetchText(url,{},fetcher)); }
    catch (cause) { error = cause.message; break; }
    pages++;
    rating = result.rating; ratingCount = result.ratingCount;
    if (ratingHistogram == null) ratingHistogram = result.ratingHistogram ?? null;
    for (const review of result.reviews) if (!reviews.has(review.id)) reviews.set(review.id,review);
    const next = appleNextUrl(result.continuationUrl, url);
    if (result.continuationUrl != null && !next) { error = 'continuation_error: tautan halaman berikutnya bukan halaman publik aplikasi ini; pengambilan dihentikan.'; break; }
    if (!next) { complete = true; break; }
    url = next;
  }
  return {reviews,rating,ratingCount,ratingHistogram,pages,complete,error};
}
async function collectAppleFeed(fetcher) {
  const reviews = new Map();
  let page = 1, pages = 0, complete = false, error = null;
  for (;;) {
    if (page > applePageLimit) { error = 'page_limit: batas keamanan halaman feed tercapai; feed belum tentu habis.'; break; }
    let result;
    try { result = parseAppleRss(await fetchText(`https://itunes.apple.com/id/rss/customerreviews/page=${page}/id=${appleId}/sortby=mostrecent/json`,{},fetcher)); }
    catch (cause) { error = cause.message; break; }
    if (!result.reviews.length) { complete = true; break; }
    pages = page;
    for (const review of result.reviews) if (!reviews.has(review.id)) reviews.set(review.id,review);
    page++;
  }
  return {reviews,pages,complete,error};
}
export async function collectApple(fetcher = fetch) {
  const [shelf, feed] = await Promise.all([collectAppleShelf(fetcher), collectAppleFeed(fetcher)]);
  const reviews = new Map(shelf.reviews);
  const feedOnly = [...feed.reviews.values()].filter(review => !reviews.has(review.id));
  for (const review of feedOnly) reviews.set(review.id,{...review,provenance:`${review.provenance}; ulasan ini hanya dikembalikan feed ulasan pelanggan publik Apple`});
  const complete = shelf.complete && feed.complete;
  const issues = [shelf.error && `halaman ulasan: ${shelf.error}`, feed.error && `feed ulasan: ${feed.error}`].filter(Boolean);
  const shared = [...shelf.reviews.keys()].filter(id => feed.reviews.has(id)).length;
  const histogramNote = shelf.ratingHistogram ? `Histogram penilaian halaman toko dibaca penuh: ${shelf.ratingHistogram.map((value, index) => `${5 - index}★=${value}`).join(', ')} (total ${shelf.ratingCount} penilaian). ${reviews.size} ulasan membawa teks publik dan masuk analisis sentimen; ${shelf.ratingCount - reviews.size} penilaian tanpa teks ikut dihitung sebagai penilaian tetapi tidak dapat dianalisis sentimennya.` : 'Histogram per bintang tidak terbaca atau tidak cocok dengan rata-rata yang dipublikasikan sumber, sehingga hanya angka agregat yang tersedia.';
  return {id:'appstore',status:complete?'success':'partial',reviews:[...reviews.values()],fetched:reviews.size,rating:shelf.rating,ratingCount:shelf.ratingCount,...(shelf.ratingHistogram?{ratingHistogram:shelf.ratingHistogram,ratingHistogramTotal:shelf.ratingCount}:{}),
    coverage:{shelfPages:shelf.pages,feedPages:feed.pages,shelfReviews:shelf.reviews.size,feedReviews:feed.reviews.size,sharedReviews:shared,feedOnly:feedOnly.length,sampleLimit:null},
    message:`${reviews.size} ulasan tertulis unik dibaca dari App Store Indonesia melalui dua jalur publik sekaligus: halaman ulasan resmi (${shelf.reviews.size} ulasan pada ${shelf.pages} halaman) dan feed ulasan pelanggan resmi (${feed.reviews.size} ulasan pada ${feed.pages} halaman); ${shared} ulasan dikonfirmasi oleh kedua jalur dan ${feedOnly.length} hanya dikembalikan salah satu jalur. Paginasi kedua jalur diikuti sampai sumber tidak memberi halaman berikutnya; kolektor tidak memiliki batas jumlah sampel. ${complete?'Kedua jalur selesai dibaca.':`Hasil belum lengkap; ${issues.join('; ')}.`} ${Number.isInteger(shelf.ratingCount)?histogramNote:'Nilai halaman toko tidak terbaca pada pemeriksaan ini.'} Apple tidak mempublikasikan jumlah unduhan.`};
}
const merchantIdentity = /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])|\b(?:id)?6741567238\b/i;
export function youtubeConfiguration(env = process.env) {
  const apiKey = env.YOUTUBE_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || '';
  const videoIds = [...new Set((env.YOUTUBE_VIDEO_IDS || '').split(/[\s,]+/).filter(Boolean))];
  const valid = videoIds.every(id => /^[\w-]{11}$/.test(id));
  return { apiKey, videoIds, status: apiKey && valid ? 'ready' : 'needs_setup', message: !apiKey ? 'Konektor YouTube Data API tersedia, tetapi YOUTUBE_API_KEY atau GOOGLE_API_KEY belum tersedia pada environment server. Aktifkan YouTube Data API v3 dan pasang kunci melalui environment server, bukan kolom browser atau chat. Belum ada komentar yang diambil.' : !valid ? 'YOUTUBE_VIDEO_IDS harus berisi ID video YouTube yang valid, dipisahkan koma. Belum ada permintaan dikirim.' : 'Kunci API tersedia, tetapi akses belum diuji. Tarik Analisis akan mencari video wondr merchant dan membaca komentar publik beserta balasannya; status ini belum berarti terhubung.' };
}
async function youtubeRequest(resource, params, apiKey, fetcher) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key,value] of Object.entries(params)) if (value != null) url.searchParams.set(key,value);
  let response;
  try { response = await fetcher(url.href,{headers:{'X-Goog-Api-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(25000)}); }
  catch { throw new Error('network_error: YouTube tidak dapat dihubungi atau melewati 25 detik.'); }
  let payload;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) throw new Error();
      chunks.push(chunk);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new Error('parse_error: respons YouTube tidak valid atau terlalu besar.'); }
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason;
    const reasons = { commentsDisabled:'komentar dinonaktifkan pada video; bukan nol keluhan', quotaExceeded:'kuota API habis; pengambilan belum lengkap', dailyLimitExceeded:'batas kuota API tercapai', keyInvalid:'kunci API ditolak', accessNotConfigured:'YouTube Data API belum diaktifkan', forbidden:'akses API ditolak', videoNotFound:'video tidak tersedia', commentNotFound:'komentar tidak tersedia' };
    throw new Error(`api_error: HTTP ${response.status}; ${Object.hasOwn(reasons,reason) ? reasons[reason] : 'permintaan ditolak YouTube'}.`);
  }
  check(Array.isArray(payload.items),'daftar item YouTube tidak tersedia');
  check(payload.nextPageToken == null || typeof payload.nextPageToken === 'string','token halaman YouTube tidak valid');
  return payload;
}
async function* youtubePages(resource, params, config, fetcher) {
  let pageToken;
  const seen = new Set();
  do {
    const page = await youtubeRequest(resource,{...params,pageToken},config.apiKey,fetcher);
    yield page;
    pageToken = page.nextPageToken;
    if (pageToken) {
      check(!seen.has(pageToken),'token halaman YouTube berulang; hasil belum lengkap');
      seen.add(pageToken);
    }
  } while (pageToken);
}
function youtubeComment(item, video, parentId, retrievedAt) {
  const snippet = item?.snippet;
  check(typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 200,'ID komentar YouTube tidak valid');
  check(snippet && typeof snippet.textDisplay === 'string','teks komentar YouTube tidak tersedia');
  check(snippet.textDisplay.length <= 20000,'teks komentar YouTube terlalu panjang');
  check(snippet.authorDisplayName == null || typeof snippet.authorDisplayName === 'string','nama penulis YouTube tidak valid');
  for (const field of ['publishedAt','updatedAt']) check(snippet[field] == null || (typeof snippet[field] === 'string' && validDate(snippet[field].slice(0,10)) && Number.isFinite(Date.parse(snippet[field]))),'waktu komentar YouTube tidak valid');
  if (parentId) check(snippet.parentId === parentId,'balasan YouTube tidak cocok dengan komentar induk');
  const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&lc=${encodeURIComponent(item.id)}`;
  return {id:item.id,platform:'youtube',author:snippet.authorDisplayName || 'N/A',text:snippet.textDisplay,rating:null,date:snippet.publishedAt?.slice(0,10) ?? null,publishedAt:snippet.publishedAt ?? null,updatedAt:snippet.updatedAt ?? null,sourceUrl,retrievedAt,parentId:parentId || null,authorChannelId:snippet.authorChannelId?.value ?? null,context:{videoId:video.id,title:video.snippet.title,description:video.snippet.description,channelId:video.snippet.channelId,product:'wondr-merchant'},provenance:'YouTube Data API v3; textDisplay dengan textFormat=plainText disimpan tanpa perubahan. Teks tampilan API dapat berbeda dari textOriginal penulis; judul dan deskripsi video hanya konteks, bukan sentimen.'};
}
export async function collectYouTube(fetcher = fetch, config = youtubeConfiguration()) {
  if (config.status === 'needs_setup') return {id:'youtube',status:'needs_setup',fetched:null,message:config.message,reviews:[]};
  const reviews = new Map(), ids = new Set(config.videoIds), issues = [];
  const scope = {mode:config.videoIds.length?'configured-videos':'search',query:config.videoIds.length?null:'"wondr merchant"',discoveredVideos:0,relevantVideos:0,completedVideos:0,pagesRead:0,paginationComplete:false};
  let responded = false;
  if (!config.videoIds.length) {
    try {
      for await (const page of youtubePages('search',{part:'snippet',type:'video',q:scope.query,maxResults:50,order:'date'},config,fetcher)) {
        responded = true; scope.pagesRead++;
        for (const item of page.items) {
          check(typeof item.id?.videoId === 'string' && /^[\w-]{11}$/.test(item.id.videoId),'ID video hasil pencarian tidak valid');
          ids.add(item.id.videoId);
        }
      }
    } catch (error) { issues.push({stage:'search',message:error.message}); }
  }
  scope.discoveredVideos = ids.size;
  const allIds = [...ids];
  for (let offset = 0; offset < allIds.length; offset += 50) {
    const batch = allIds.slice(offset,offset+50);
    let videos;
    try {
      const page = await youtubeRequest('videos',{part:'snippet',id:batch.join(',')},config.apiKey,fetcher);
      responded = true; scope.pagesRead++; videos = page.items;
      const returned = new Set(videos.map(video => video.id));
      for (const id of batch) if (!returned.has(id)) issues.push({stage:'video',videoId:id,message:'Video tidak tersedia melalui API; komentar belum dapat diperiksa.'});
    } catch (error) { issues.push({stage:'videos',message:error.message}); continue; }
    for (const video of videos) {
      try {
        check(batch.includes(video.id) && typeof video.snippet?.title === 'string' && typeof video.snippet?.description === 'string' && typeof video.snippet?.channelId === 'string','metadata video YouTube tidak valid');
        if (!merchantIdentity.test(`${video.snippet.title}\n${video.snippet.description}`)) continue;
        scope.relevantVideos++;
        let repliesComplete = true;
        for await (const page of youtubePages('commentThreads',{part:'snippet',videoId:video.id,maxResults:100,textFormat:'plainText',order:'time'},config,fetcher)) {
          scope.pagesRead++;
          for (const thread of page.items) {
            check(thread.snippet?.videoId === video.id,'video pada komentar YouTube tidak cocok');
            const comment = youtubeComment(thread.snippet.topLevelComment,video,null,new Date().toISOString());
            reviews.set(comment.id,comment);
            const replies = thread.snippet.totalReplyCount;
            check(Number.isInteger(replies) && replies >= 0,'jumlah balasan YouTube tidak valid');
            if (replies) {
              const replyIds = new Set();
              try {
                for await (const replyPage of youtubePages('comments',{part:'snippet',parentId:comment.id,maxResults:100,textFormat:'plainText'},config,fetcher)) {
                  scope.pagesRead++;
                  for (const item of replyPage.items) {
                    const reply = youtubeComment(item,video,comment.id,new Date().toISOString());
                    reviews.set(reply.id,reply); replyIds.add(reply.id);
                  }
                }
                check(replyIds.size >= replies,'balasan terbaca lebih sedikit dari metadata; data dapat berubah atau akses terbatas');
              } catch (error) { repliesComplete = false; issues.push({stage:'replies',videoId:video.id,parentId:comment.id,message:error.message}); }
            }
          }
        }
        if (repliesComplete) scope.completedVideos++;
      } catch (error) { issues.push({stage:'comments',videoId:video.id,message:error.message}); }
    }
  }
  scope.paginationComplete = issues.length === 0;
  const status = !issues.length?'success':responded?'partial':'error';
  return {id:'youtube',status,fetched:reviews.size,reviews:[...reviews.values()],scope,issues,message:`${reviews.size} komentar unik dibaca dari ${scope.relevantVideos} video dengan identitas wondr merchant pada metadata. ${scope.completedVideos} video selesai dipaginasi pada pemeriksaan ini. ${scope.mode==='search'?'Cakupan hanya hasil pencarian API untuk frasa "wondr merchant".':'Cakupan hanya ID video yang dikonfigurasi.'} ${issues.length?'Sebagian pengambilan gagal atau belum lengkap.':'Semua halaman yang dikembalikan API telah diproses, termasuk balasan.'} Komentar privat, dihapus, ditahan moderasi, dan konten di luar hasil API tidak tercakup; ini bukan seluruh percakapan YouTube. Komentar pemilik video, promosi, dan konteks yang belum jelas tidak diberi sentimen pelanggan otomatis.${issues.length?` Kendala: ${[...new Set(issues.map(issue=>issue.message))].join(' ')}`:''}`};
}
// Apify adalah layanan pengambilan data pihak ketiga yang sah. Token hanya dibaca dari environment
// server dan dikirim sebagai header Authorization; tidak pernah masuk URL, browser, atau pesan galat.
//
// Field input di bawah diverifikasi ulang pada 24 Oktober 2026 terhadap schema actor yang dipublikasikan
// Apify (GET /v2/acts/<actor>/builds/default?expand=inputSchema). Bentuk sebelumnya memakai field yang
// sudah tidak ada (query/queryType, type/keywords, searchTerms/maxResult), sehingga actor berjalan
// dengan input kosong dan mengembalikan "tidak ada hasil" — bukan karena kontennya tidak ada, melainkan
// karena pencariannya tidak pernah terjadi. Lihat apifyInputFields untuk penjaga pra-jalan.
// Batas jumlah komentar per fase dibaca dari environment saat dipakai, agar deployment
// dapat menaikkan atau menurunkan tanpa mengubah kode. Nilai bawaan dipilih agar biaya
// tetap terkendali; setiap batas yang tercapai selalu dilaporkan pada coverage.
function commentLimit(name, fallback) {
  const value = Number(process.env[`APIFY_COMMENT_${name}`]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
export const apifyChannels = {
  x: { label: 'X / Twitter', actor: 'apidojo/tweet-scraper', input: () => ({ searchTerms: ['"wondr merchant"', '"wondr merchant by BNI"', 'wondrmerchant', '"wondr merchant" BNI'], sort: 'Latest + Top' }) },
  instagram: { label: 'Instagram', actor: 'apify/instagram-scraper', input: () => ({ resultsType: 'posts', searchType: 'hashtag', search: 'wondrmerchant, wondrmerchantbni, wondrmerchantbybni', searchLimit: 250, resultsLimit: 250 }) },
  // Komentar TikTok dikembalikan actor ke dataset terpisah yang ditaut dari item video,
  // sehingga jumlah komentar per video harus diminta lewat input di bawah.
  tiktok: { label: 'TikTok', actor: 'clockworks/tiktok-scraper', input: () => ({ searchQueries: ['"wondr merchant"', '"wondr merchant by BNI"', 'wondrmerchant', '"wondr merchant" BNI'], resultsPerPage: commentLimit('TIKTOK_VIDEOS', 300), videoSearchSorting: 'LATEST', topLevelCommentsPerPost: commentLimit('TIKTOK_COMMENTS', 35), maxRepliesPerComment: commentLimit('TIKTOK_REPLIES', 10) }) },
  facebook: { label: 'Facebook', actor: 'apify/facebook-search-scraper', input: () => ({ categories: ['wondr merchant', 'wondr merchant by BNI'], searchType: 'posts', resultsLimit: 250 }) },
};
// Fase kedua: KOMENTAR pada konten yang sudah ditemukan. Nama field dibatasi pada schema
// actor yang terverifikasi (penjaga pra-jalan yang sama berlaku), dan setiap fase dicatat
// terpisah karena actor ini menagih per hasil.
// - Instagram: resultsType 'comments' + directUrls postingan yang baru ditemukan.
// - X: conversationIds utas dari tweet yang ditemukan, untuk mengambil balasan.
// - TikTok: tidak butuh fase kedua; komentarnya datang sebagai dataset tertaut.
// - Facebook: actor yang tersedia di akun ini hanya mengembalikan hasil pencarian, bukan
//   komentar pada sebuah postingan, jadi keterbatasan ini dilaporkan apa adanya.
// Fase kedua memakai actor yang sama dengan pencarian utamanya (hanya inputnya yang berubah),
// sehingga override APIFY_ACTOR_<KANAL> dan penjaga schema tetap berlaku untuk kedua fase.
export const apifyCommentRuns = {
  instagram: {
    label: 'pada postingan',
    input: ({ urls = [] } = {}) => {
      const list = [...new Set(urls.filter(url => /instagram\.com\/(p|reel)\//i.test(url)))].slice(0, commentLimit('INSTAGRAM_POSTS', 100));
      return list.length ? { resultsType: 'comments', directUrls: list, addParentData: true, resultsLimit: commentLimit('RESULTS', 3000) } : null;
    },
  },
  x: {
    label: 'dalam utas',
    input: ({ conversationIds = [] } = {}) => {
      const list = [...new Set(conversationIds)].slice(0, commentLimit('X_THREADS', 100));
      return list.length ? { conversationIds: list, maxItems: commentLimit('RESULTS', 3000), sort: 'Top' } : null;
    },
  },
};
const apifyTextFields = ['text', 'fullText', 'caption', 'content', 'body', 'reviewText', 'comment', 'shortText'];
// Actor menerima batas jumlah hasil dari namanya sendiri. Nilai ini bukan batas milik kolektor,
// tetapi tetap harus dilaporkan karena memotong hasil di sisi actor.
const apifyResultCapFields = ['maxItems', 'resultsLimit', 'resultsPerPage', 'maxResult', 'requestsPerCrawl', 'limit'];
export function apifyResultCap(input) {
  for (const field of apifyResultCapFields) {
    const value = Number(input?.[field]);
    if (Number.isInteger(value) && value > 0) return { field, value };
  }
  return null;
}
const apifyAuthorFields = ['author', 'username', 'owner', 'nickname', 'authorName', 'reviewerName', 'user', 'handle', 'authorMeta'];
const apifyIdFields = ['id', '_id', 'uniqueId', 'tweetId', 'idInline', 'reviewId'];
const apifyUrlFields = ['url', 'link', 'permalink', 'tweetUrl', 'webVideoUrl', 'mapsUrl', 'reviewUrl'];
function pickField(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') for (const nested of ['label', 'name', 'nickName', 'nickname', 'screenName', 'text', 'fullName', 'full_name', 'username']) if (typeof value[nested] === 'string' && value[nested].trim()) return value[nested].trim();
  }
  return null;
}
// Hanya tanggal ISO yang diterima; format lain dibiarkan kosong (N/A) daripada ditebak.
function apifyDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const iso = new Date(value > 1e11 ? value : value * 1000).toISOString();
    return validDate(iso.slice(0, 10)) ? iso : null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return validDate(value.slice(0, 10)) ? new Date(value).toISOString() : null;
}
function apifyItems(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['items', 'data', 'reviews', 'comments', 'tweets', 'posts', 'results']) if (Array.isArray(value[key])) return value[key];
  }
  return [];
}
function apifyRecords(item, platform, actor, runId, retrievedAt) {
  const found = [];
  let offIdentity = 0;
  const parentId = pickField(item, apifyIdFields);
  const postUrl = pickField(item, apifyUrlFields);
  const postText = pickField(item, apifyTextFields) || '';
  // Actor pencarian sosial mengembalikan hasil longgar (mis. "wandering merchant",
  // "Natalie Merchant wonder"). Teks yang tidak menyebut identitas produk dibuang di
  // sini, tetapi jumlahnya dilaporkan agar tidak ada yang hilang tanpa tercatat.
  const postRelevant = merchantIdentity.test(postText);
  const collect = (source, parent) => {
    const text = pickField(source, apifyTextFields);
    if (!text) return;
    if (!(postRelevant || merchantIdentity.test(text))) { offIdentity++; return; }
    const sourceId = pickField(source, apifyIdFields);
    // Item tanpa identitas sumber tetap disimpan sebagai teks nyata, tetapi ID lokal dibuat dari
    // hash isinya dan hal itu dicatat pada provenance agar tidak disangka ID dari platform.
    const id = sourceId ?? `${platform}-${createHash('sha256').update(`${parent ?? ''}|${text}`).digest('hex').slice(0, 32)}`;
    const rating = Number(source.rating ?? source.stars ?? source.score);
    const url = pickField(source, apifyUrlFields) ?? (parent ? postUrl : null);
    const when = apifyDate(source.date ?? source.createdAt ?? source.createTimeISO ?? source.createTime ?? source.timestamp ?? source.time ?? source.postedAt ?? source.publishedAt ?? source.creationDate ?? source.reviewDate);
    found.push({
      id, platform, author: pickField(source, apifyAuthorFields) || 'N/A', text, rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
      date: when?.slice(0, 10) ?? null, publishedAt: when,
      sourceUrl: url && validSource(url, platform) ? url : null, retrievedAt, parentId: parent ?? null,
      context: parent ? { postId: parent, postUrl: postUrl && validSource(postUrl, platform) ? postUrl : null, product: 'wondr-merchant' } : undefined,
      provenance: `Diambil melalui Apify actor ${actor} (run ${runId}); teks disimpan apa adanya dari item dataset. ${sourceId ? 'ID ulasan berasal dari item sumber.' : 'Item sumber tidak membawa ID, sehingga identitas di bawah adalah hash lokal dari teks ini, bukan ID dari platform.'} Waktu memakai nilai yang dikembalikan actor; tanggal yang tidak dapat dibaca dibiarkan kosong.`,
    });
  };
  collect(item, null);
  for (const key of ['comments', 'reviews']) if (Array.isArray(item[key])) for (const child of item[key]) if (child && typeof child === 'object') collect(child, parentId);
  return { records: found, offIdentity };
}
export function apifyConfiguration(env = process.env) {
  const token = env.APIFY_API_TOKEN?.trim() || '';
  const channels = Object.fromEntries(Object.entries(apifyChannels).map(([id, channel]) => {
    const upper = id.toUpperCase();
    let input = channel.input(), inputError = null;
    const rawInput = env[`APIFY_INPUT_${upper}`]?.trim();
    if (rawInput) { try { input = JSON.parse(rawInput); } catch { inputError = `APIFY_INPUT_${upper} bukan JSON yang valid.`; } }
    return [id, { label: channel.label, actor: env[`APIFY_ACTOR_${upper}`]?.trim() || channel.actor, input, inputError }];
  }));
  return { token, channels, status: token ? 'ready' : 'needs_setup', message: token
    ? 'Token Apify tersedia pada server, tetapi akses belum diuji. Tarik Analisis akan menjalankan actor untuk kanal ini; status ini belum berarti terhubung dan pemakaian actor dapat memakan kuota berbayar.'
    : 'Konektor Apify tersedia, tetapi APIFY_API_TOKEN belum tersedia pada environment server. Pasang kunci melalui environment server atau berkas .env lokal, bukan kolom browser atau chat. Belum ada data yang diambil.' };
}
async function apifyJson(path, token, fetcher, options = {}) {
  let response;
  try { response = await fetcher(`https://api.apify.com/v2/${path}`, { ...options, headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('network_error: Apify tidak dapat dihubungi atau melewati 30 detik.'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 12 * 1024 * 1024) throw new Error('response_error: respons Apify melebihi batas 12 MB.'); chunks.push(chunk); }
  const text = Buffer.concat(chunks).toString('utf8');
  let payload = null;
  try { payload = JSON.parse(text); } catch { if (response.ok) throw new Error('parse_error: respons Apify bukan JSON.'); }
  if (!response.ok) {
    const reason = String(payload?.error?.type ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const reasons = { invalidapikey: 'token Apify ditolak', tokennotfound: 'token Apify tidak dikenali', paymentrequired: 'pembayaran atau batas kuota Apify belum mencukupi', notfound: 'actor tidak ditemukan pada Apify', validationerror: 'input actor ditolak Apify', methodnotallowed: 'metode permintaan ditolak Apify', conflict: 'run actor bertabrakan dengan status saat ini' };
    throw new Error(`api_error: HTTP ${response.status}; ${Object.hasOwn(reasons, reason) ? reasons[reason] : reason ? `permintaan ditolak Apify (${reason})` : 'permintaan ditolak Apify'}.`);
  }
  return payload?.data ?? payload;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Daftar field yang diterima actor, dibaca dari schema publik actor (permintaan GET gratis, tidak
// menjalankan actor). Null berarti schema tidak terbaca; pemakaian field asing tidak boleh membuat
// penarikan berhenti total, tetapi tetap dicatat pada coverage.
const apifySchemaCache = new Map();
export async function apifyInputFields(actor, token, fetcher = fetch) {
  if (apifySchemaCache.has(actor)) return apifySchemaCache.get(actor);
  const build = await apifyJson(`acts/${encodeURIComponent(actor)}/builds/default?expand=inputSchema`, token, fetcher);
  let schema = build?.inputSchema;
  if (typeof schema === 'string') { try { schema = JSON.parse(schema); } catch { schema = null; } }
  const properties = schema?.properties ?? schema?.schema?.properties;
  const fields = properties && typeof properties === 'object' ? Object.keys(properties) : null;
  if (fields) apifySchemaCache.set(actor, fields);
  return fields;
}
export function apifyUnknownInputFields(input, fields) {
  if (!fields) return [];
  const known = new Set(fields);
  return Object.keys(input ?? {}).filter(key => key !== 'cleanInputs' && !known.has(key));
}
// Komentar TikTok disimpan actor di dataset terpisah yang ditaut dari item video. Tautan bisa
// berupa URL dataset langsung atau record key-value yang berisi URL itu; keduanya diurai di sini.
// Isi dataset berasal dari actor pihak ketiga, jadi hanya tautan HTTPS ke apify.com yang boleh
// dibaca dengan token — mencegah token terkirim ke host lain.
const apifyDatasetPath = /\/datasets\/([A-Za-z0-9_-]+)/;
const apifyRecordPath = /\/(key-value-stores|records)\//;
function apifyHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'apify.com' || url.hostname.endsWith('.apify.com'));
  } catch { return false; }
}
export async function apifyLinkedDatasetIds(links, token, fetcher = fetch) {
  const ids = new Set();
  let failed = 0;
  for (const link of links) {
    const text = String(link);
    if (!apifyHttpsUrl(text)) { failed++; continue; }
    const direct = text.match(apifyDatasetPath);
    if (direct) { ids.add(direct[1]); continue; }
    if (!apifyRecordPath.test(text)) { failed++; continue; }
    try {
      const response = await fetcher(text, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response?.ok) { failed++; continue; }
      const body = typeof response.text === 'function' ? await response.text() : '';
      const matches = [...String(body).matchAll(new RegExp(apifyDatasetPath.source, 'g'))];
      if (!matches.length) failed++;
      for (const match of matches) ids.add(match[1]);
    } catch { failed++; }
  }
  return { ids: [...ids], failed };
}
export async function collectApify(id, fetcher = fetch, config = apifyConfiguration(), { waitMs = 180000, pollMs = 5000, pageLimit = 1000, resume = null } = {}) {
  const channel = config.channels[id];
  if (config.status === 'needs_setup') return { id, status: 'needs_setup', fetched: null, message: config.message, reviews: [] };
  if (channel.inputError) return { id, status: 'error', fetched: null, message: `${channel.inputError} Belum ada permintaan dikirim; data tersimpan tetap dipertahankan.`, reviews: [] };
  const issues = [];
  const reviews = new Map();
  const markerNotes = new Set();
  const commentLinks = new Set();
  const mainUrls = [];
  const mainConversations = [];
  const stats = { items: 0, nested: 0, markers: 0, offIdentity: 0, commentItems: 0, commentRecords: 0 };

  const readDataset = async (datasetId, runId, actor, phase) => {
    if (typeof datasetId !== 'string' || !datasetId) { issues.push(`${phase}: Apify tidak mengembalikan identitas dataset untuk run ini`); return; }
    const comments = phase !== 'pencarian utama';
    for (let offset = 0; ; offset += pageLimit) {
      try {
        const page = apifyItems(await apifyJson(`datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&offset=${offset}&limit=${pageLimit}`, config.token, fetcher));
        for (const item of page) {
          if (comments) stats.commentItems++; else stats.items++;
          if (typeof item?.commentsDatasetURL === 'string') commentLinks.add(item.commentsDatasetURL);
          if (!comments) {
            if (typeof item?.url === 'string') mainUrls.push(item.url);
            if (item?.conversationId != null && item.conversationId !== '') mainConversations.push(String(item.conversationId));
          }
          // Actor menandai kueri tanpa hasil sebagai item khusus, bukan dataset kosong.
          // Item itu dihitung sebagai bukti "terhubung tetapi tidak ada konten", bukan kehilangan data.
          if (item && typeof item === 'object' && (item.noResults === true || typeof item.error === 'string')) {
            stats.markers++;
            const note = typeof item.errorDescription === 'string' ? item.errorDescription : typeof item.error === 'string' ? item.error : null;
            if (note) markerNotes.add(String(note).slice(0, 160));
          }
          const before = reviews.size;
          const parsed = apifyRecords(item, id, actor, runId, new Date().toISOString());
          stats.offIdentity += parsed.offIdentity;
          for (const record of parsed.records) if (!reviews.has(record.id)) { reviews.set(record.id, record); if (record.parentId) stats.nested++; }
          if (comments) stats.commentRecords += reviews.size - before;
        }
        if (page.length < pageLimit) break;
      } catch (error) { issues.push(`${phase}: ${error.message}`); break; }
    }
  };

  // Satu fase actor: jaga schema, jalankan (atau lanjutkan run yang sudah dimulai), tunggu, baca dataset.
  const runActor = async ({ phase, actor, input, resumeRun }) => {
    let fields = null;
    if (!resumeRun?.runId) {
      try { fields = await apifyInputFields(actor, config.token, fetcher); }
      catch (error) { issues.push(`${phase}: schema input actor tidak dapat dibaca: ${error.message}`); }
      // Penjaga pra-jalan: field yang tidak dikenal actor membuat actor berjalan dengan input
      // kosong dan mengembalikan "tidak ada hasil" yang terdengar sah padahal pencariannya tidak
      // pernah terjadi. Bila terdeteksi, actor tidak dijalankan sehingga tidak ada biaya timbul.
      const unknown = apifyUnknownInputFields(input, fields);
      if (unknown.length) return { unknown, fields, actor };
    }
    let run;
    if (resumeRun?.runId) {
      run = { id: resumeRun.runId, status: resumeRun.status ?? 'RUNNING', defaultDatasetId: resumeRun.datasetId ?? null };
      issues.push(run.status === 'SUCCEEDED' ? `${phase}: run sebelumnya sudah selesai tetapi datasetnya belum terbaca pada panggilan ini` : `${phase}: melanjutkan run actor yang masih berjalan dari permintaan sebelumnya`);
    } else {
      try {
        run = await apifyJson(`acts/${encodeURIComponent(actor)}/runs`, config.token, fetcher, { method: 'POST', body: JSON.stringify({ cleanInputs: true, ...input }) });
        if (typeof run?.id !== 'string') throw new Error('parse_error: Apify tidak mengembalikan identitas run.');
      } catch (error) { return { failure: error.message, actor, input }; }
    }
    const done = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'];
    const deadline = Date.now() + waitMs;
    let status = run.status ?? 'READY';
    while (!done.includes(status)) {
      if (Date.now() >= deadline) { issues.push(`${phase}: batas waktu tunggu actor tercapai; run ${run.id} dilanjutkan pada penarikan berikutnya`); break; }
      try { await wait(pollMs); status = (await apifyJson(`actor-runs/${encodeURIComponent(run.id)}`, config.token, fetcher)).status ?? status; }
      catch (error) { issues.push(`${phase}: ${error.message}`); break; }
    }
    const outcome = { runId: run.id, datasetId: run.defaultDatasetId ?? null, status, finished: done.includes(status), actor, fields, input };
    if (!outcome.finished) return outcome;
    if (status !== 'SUCCEEDED') issues.push(`${phase}: actor berakhir dengan status ${status}; hasil mungkin tidak lengkap`);
    await readDataset(outcome.datasetId, outcome.runId, actor, phase);
    return outcome;
  };

  const main = await runActor({
    phase: 'pencarian utama', actor: channel.actor, input: channel.input,
    resumeRun: resume?.runId ? { runId: resume.runId, datasetId: resume.datasetId, status: resume.status } : null,
  });
  if (main.unknown) return {
    id, status: 'error', fetched: null, reviews: [],
    coverage: { actor: channel.actor, unknownInputFields: main.unknown, inputChecked: true, sampleLimit: apifyResultCap(channel.input)?.value ?? null, sampleLimitField: apifyResultCap(channel.input)?.field ?? null },
    message: `Input untuk ${channel.label} memakai field yang tidak dikenal actor ${channel.actor}: ${main.unknown.join(', ')}. Actor tidak dijalankan, sehingga tidak ada biaya yang timbul dan data tersimpan tetap dipertahankan. Field yang diterima actor: ${main.fields.slice(0, 14).join(', ')}${main.fields.length > 14 ? ` (+${main.fields.length - 14} lainnya)` : ''}.`,
  };
  if (main.failure) return { id, status: 'error', fetched: null, message: `Pengambilan ${channel.label} gagal: ${main.failure} Belum ada data yang diubah.`, reviews: [] };

  // Dataset komentar tertaut (TikTok) dibaca dengan parser yang sama; tidak ada run baru,
  // sehingga tidak ada biaya tambahan di luar hasil yang sudah ditagih actor.
  const linked = await apifyLinkedDatasetIds([...commentLinks], config.token, fetcher);
  for (const datasetId of linked.ids) await readDataset(datasetId, main.runId, channel.actor, 'komentar terkait');
  if (linked.failed) issues.push(`${linked.failed} tautan dataset komentar tidak dapat diurai`);

  const followSpec = apifyCommentRuns[id];
  let follow = null;
  if (followSpec) {
    if (!main.finished) issues.push(`fase ${followSpec.label} dilewati karena run utama belum selesai; run ${main.runId} akan dilanjutkan lebih dulu pada penarikan berikutnya`);
    else {
      const input = followSpec.input({ urls: mainUrls, conversationIds: mainConversations });
      if (!input) follow = { skipped: `tidak ada konten utama yang membawa tautan untuk diambil ${followSpec.label}nya` };
      else {
        follow = await runActor({
          phase: `komentar ${followSpec.label}`, actor: channel.actor, input,
          resumeRun: resume?.followUp?.runId ? resume.followUp : null,
        });
        if (follow.unknown) issues.push(`fase komentar ${followSpec.label} tidak dijalankan: field ${follow.unknown.join(', ')} tidak dikenal actor ${channel.actor}, sehingga tidak ada biaya yang timbul`);
        if (follow.failure) issues.push(`fase ${followSpec.label} gagal: ${follow.failure}; hasil pencarian utama tetap tersimpan`);
      }
    }
  }
  const followCap = follow?.input ? apifyResultCap(follow.input) : null;
  const followTruncated = Boolean(followCap && follow?.datasetId && stats.commentItems >= followCap.value);

  const emptyEvidence = stats.markers ? ` Actor mengembalikan ${stats.markers} penanda tidak ada hasil${markerNotes.size ? ` (${[...markerNotes].join('; ')})` : ''} untuk kueri ini, artinya kanal dapat dihubungi tetapi tidak ada konten publik yang cocok.` : '';
  const identityEvidence = stats.offIdentity ? ` ${stats.offIdentity} teks lain dikembalikan actor tetapi tidak menyebut identitas wondr merchant, sehingga tidak disimpan sebagai konten produk; pencarian sosial bekerja longgar dan teks tersebut bukan milik aplikasi ini.` : '';
  // Batas hasil pada input actor dilaporkan apa adanya: jika jumlah item yang dikembalikan
  // mencapai batas itu, masih ada konten yang belum terbaca dan itu tidak boleh disebut lengkap.
  const cap = apifyResultCap(channel.input);
  const truncated = Boolean(cap && stats.items >= cap.value);
  const capEvidence = cap
    ? ` Hasil dibatasi input actor ${cap.field}=${cap.value}; ${stats.items} item dataset dikembalikan.${truncated ? ` Jumlah item mencapai batas tersebut, sehingga masih ada konten yang belum terbaca — naikkan ${cap.field} melalui APIFY_INPUT_${id.toUpperCase()} untuk membaca sisanya.` : ' Item yang dikembalikan belum mencapai batas tersebut.'}`
    : ' Tidak ada batas jumlah hasil pada input actor ini; seluruh dataset run dibaca.';
  // Kalimat komentar disusun dari yang benar-benar terjadi pada penarikan ini, bukan dari
  // asumsi: dataset tertaut, run fase kedua, atau memang tidak ada komentar yang dikembalikan.
  const commentParts = [];
  if (stats.commentItems) commentParts.push(`${stats.commentItems} item dataset komentar dibaca${linked.ids.length ? ` dari ${linked.ids.length} dataset tertaut` : ''}`);
  if (followSpec) {
    if (follow?.runId) commentParts.push(`run ${channel.actor} ${follow.runId} ${follow.finished ? 'selesai' : 'belum selesai dan dilanjutkan pada penarikan berikutnya'}`);
    else if (follow?.skipped) commentParts.push(`fase komentar dilewati (${follow.skipped})`);
    if (followCap) commentParts.push(`batas actor ${followCap.field}=${followCap.value}${followTruncated ? ' (tercapai — masih ada balasan yang belum terbaca)' : ''}`);
  }
  const commentEvidence = commentParts.length
    ? ` Fase komentar: ${commentParts.join(', ')}; ${stats.commentRecords} teks komentar baru tersimpan.`
    : ` Tidak ada komentar yang dikembalikan actor pada penarikan ini${followSpec ? '' : `; actor pencarian ${channel.label} hanya mengembalikan hasil pencarian, bukan komentar pada tiap postingan`}.`;
  const incomplete = issues.length > 0 || truncated || followTruncated || Boolean(follow && follow.finished === false);
  const complete = !incomplete;
  // Dataset yang mencapai batas actor tetap bukti kanal menjawab (partial), bukan kegagalan,
  // dan bukan pula "tidak ada percakapan".
  return { id, status: complete ? 'success' : reviews.size || truncated ? 'partial' : 'error', fetched: reviews.size, reviews: [...reviews.values()],
    coverage: { actor: channel.actor, runId: main.runId, datasetId: main.datasetId ?? null, itemsRead: stats.items, nestedRecords: stats.nested, emptyResultMarkers: stats.markers, identityFiltered: stats.offIdentity, sampleLimit: cap?.value ?? null, sampleLimitField: cap?.field ?? null, possiblyTruncated: truncated, inputChecked: Boolean(main.fields) || Boolean(resume?.runId), unknownInputFields: [], runFinished: main.finished === true,
      commentItemsRead: stats.commentItems, commentRecords: stats.commentRecords, commentDatasets: linked.ids.length,
      followUp: followSpec ? { actor: channel.actor, runId: follow?.runId ?? null, datasetId: follow?.datasetId ?? null, finished: follow?.finished === true, skipped: follow?.skipped ?? null, unknownInputFields: follow?.unknown ?? [], sampleLimit: followCap?.value ?? null, sampleLimitField: followCap?.field ?? null, possiblyTruncated: followTruncated } : null },
    message: `${reviews.size} teks unik dibaca dari ${channel.label} melalui Apify actor ${channel.actor} (run ${main.runId}); ${stats.items} item dataset diperiksa dan ${stats.nested} di antaranya berasal dari komentar/ulasan bersarang.${emptyEvidence}${identityEvidence}${capEvidence}${commentEvidence} ${complete ? 'Seluruh dataset run ini telah dibaca.' : `Hasil belum lengkap: ${[...new Set([...(truncated && cap ? [`item dataset mencapai ${cap.field}=${cap.value}`] : []), ...(followTruncated && followCap ? [`komentar mencapai ${followCap.field}=${followCap.value}`] : []), ...issues.map(String)])].join(' ')}`} Teks disimpan apa adanya dari actor. Ini adalah hasil kueri actor, bukan seluruh percakapan ${channel.label} di platform tersebut.` };
}
// Google Places API (New) adalah jalur resmi untuk ulasan di Google Maps. Kunci hanya dikirim
// sebagai header X-Goog-Api-Key; tidak pernah masuk URL, browser, atau pesan galat.
export function placesConfiguration(env = process.env) {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim() || '';
  const queries = [...new Set((env.GOOGLE_PLACES_QUERIES || 'wondr merchant,wondr merchant by BNI').split(',').map(query => query.trim()).filter(Boolean))];
  return {
    apiKey, queries,
    status: apiKey ? 'ready' : 'needs_setup',
    message: apiKey
      ? 'Kunci Google Places API tersedia pada server, tetapi akses belum diuji. Tarik Analisis akan mencari place wondr merchant melalui API resmi; status ini belum berarti ulasan teks dapat diambil.'
      : 'Konektor Google Places tersedia, tetapi GOOGLE_PLACES_API_KEY belum tersedia pada environment server. Pasang kunci melalui environment server atau berkas .env lokal, bukan kolom browser atau chat. Belum ada data yang diambil.',
  };
}
const placesMask = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,nextPageToken';
async function placesRequest(path, fieldMask, apiKey, fetcher, options = {}) {
  let response;
  try {
    response = await fetcher(`https://places.googleapis.com/v1/places${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
      redirect: 'error', signal: AbortSignal.timeout(25000),
    });
  } catch { throw new Error('network_error: Google Places tidak dapat dihubungi atau melewati 25 detik.'); }
  let payload = null;
  try { payload = JSON.parse(await response.text()); } catch { if (response.ok) throw new Error('parse_error: respons Google Places bukan JSON.'); }
  if (!response.ok) {
    const statusName = String(payload?.error?.status ?? '');
    const reasons = { permissiondenied: 'kunci API tidak punya izin Places API', resourceexhausted: 'kuota Places API habis', apikeynotvalid: 'kunci API ditolak', apikeydisabled: 'Places API belum diaktifkan pada proyek', requestrejected: 'permintaan ditolak Google', invalidargument: 'field mask atau isi permintaan ditolak Google' };
    throw new Error(`api_error: HTTP ${response.status}; ${Object.hasOwn(reasons, statusName.toLowerCase()) ? reasons[statusName.toLowerCase()] : 'permintaan ditolak Google'}.`);
  }
  return payload ?? {};
}
function placesReview(placeId, review, retrievedAt) {
  const text = typeof review?.text?.text === 'string' ? review.text.text.trim() : '';
  if (!text) return null;
  const hash = createHash('sha256').update(`${placeId}|${text}`).digest('hex').slice(0, 32);
  const published = typeof review?.publishTime === 'string' && Number.isFinite(Date.parse(review.publishTime)) ? review.publishTime : null;
  const when = published ? (validDate(published.slice(0, 10)) ? published.slice(0, 10) : null) : null;
  const rating = Number(review?.rating);
  return {
    id: `googlemaps-${hash}`, platform: 'googlemaps', author: review?.authorDisplayName || 'N/A', text,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    date: when, publishedAt: published, sourceUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    retrievedAt, parentId: placeId,
    context: { placeId, product: 'wondr-merchant' },
    provenance: 'Google Places API (New); teks ulasan disimpan apa adanya. Identitas ulasan adalah hash lokal karena API tidak mengembalikan ID ulasan yang stabil.',
  };
}
export async function collectGooglePlaces(fetcher = fetch, config = placesConfiguration()) {
  if (config.status === 'needs_setup') return { id: 'googlemaps', status: 'needs_setup', fetched: null, message: config.message, reviews: [] };
  const places = new Map();
  const reviews = new Map();
  const issues = [];
  let responded = 0, pagesRead = 0, reviewFieldsSeen = 0;
  for (const query of config.queries) {
    let pageToken;
    const seenTokens = new Set();
    let queryAnswered = false;
    do {
      try {
        const payload = await placesRequest(':searchText', placesMask, config.apiKey, fetcher, { method: 'POST', body: JSON.stringify({ textQuery: query, languageCode: 'id', regionCode: 'ID', ...(pageToken ? { pageToken } : {}) }) });
        pagesRead++;
        if (!queryAnswered) { queryAnswered = true; responded++; }
        check(payload.places === undefined || Array.isArray(payload.places), 'daftar place Google Places tidak valid');
        for (const place of payload.places ?? []) {
          check(typeof place?.id === 'string' && place.id.length > 0 && place.id.length <= 200, 'ID place Google tidak valid');
          const name = typeof place.displayName?.text === 'string' ? place.displayName.text : '';
          check(name.length <= 400, 'nama place Google tidak valid');
          if (!places.has(place.id)) places.set(place.id, { id: place.id, name, address: place.formattedAddress ?? null, rating: Number(place.rating) || null, ratingCount: Number(place.userRatingCount) || null, queries: [] });
          places.get(place.id).queries.push(query);
        }
        pageToken = payload.nextPageToken;
        if (pageToken) { check(!seenTokens.has(pageToken), 'token halaman Google Places berulang; hasil belum lengkap'); seenTokens.add(pageToken); }
      } catch (error) { issues.push(`kueri "${query}": ${error.message}`); break; }
    } while (pageToken);
  }
  const matches = [...places.values()].filter(place => merchantIdentity.test(place.name));
  for (const place of matches) {
    try {
      const detail = await placesRequest(`/${encodeURIComponent(place.id)}`, 'id,displayName,reviews,rating,userRatingCount', config.apiKey, fetcher);
      reviewFieldsSeen += Array.isArray(detail.reviews) ? detail.reviews.length : 0;
      for (const review of detail.reviews ?? []) {
        const record = placesReview(place.id, review, new Date().toISOString());
        if (record && !reviews.has(record.id)) reviews.set(record.id, record);
      }
    } catch (error) { issues.push(`ulasan place ${place.id}: ${error.message}`); }
  }
  const reachable = responded > 0;
  const status = issues.length ? (reachable ? 'partial' : 'error') : 'success';
  const nearest = [...places.values()].slice(0, 3).map(place => place.name).filter(Boolean).join('; ');
  const message = `Google Places API (New) menjawab ${responded} dari ${config.queries.length} kueri identitas produk dan mengembalikan ${places.size} place berbeda; ${matches.length} di antaranya bernama wondr merchant. ${reviewFieldsSeen ? `${reviewFieldsSeen} teks ulasan dikembalikan API.` : 'API tidak menyertakan satu pun teks ulasan pada pemeriksaan ini.'} ${nearest ? `Contoh hasil terdekat: ${nearest}.` : 'Tidak ada place yang dikembalikan.'} Place yang bukan aplikasi ini tidak dihitung sebagai sentimen merchant. Tidak ada upaya mengambil ulasan yang tidak disediakan API.`;
  return {
    id: 'googlemaps', status, fetched: reviews.size, reviews: [...reviews.values()], rating: matches[0]?.rating ?? null, ratingCount: matches[0]?.ratingCount ?? null,
    coverage: { queries: config.queries.length, answered: responded, pagesRead, placesFound: places.size, productMatches: matches.length, reviewFieldsSeen, sampleLimit: null, reviewTextServed: reviewFieldsSeen > 0 },
    message: `${message} ${issues.length ? `Kendala: ${[...new Set(issues)].join(' ')}` : 'Seluruh kueri konfigurasi telah dikirim.'}`,
  };
}
// Peta status kanal berkredensial untuk satu id platform; dipakai server lokal dan
// function serverless agar tampilan "perlu konfigurasi" identik di kedua jalur.
// Kanal berita/web memakai RSS resmi penerbit tanpa dependensi. Tidak ada URL bawaan yang
// dikarang: daftar suaka diisi operator melalui NEWS_RSS_URLS, sehingga statusnya jujur
// "belum dikonfigurasi" selama kosong.
const feedHost = value => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } };
function httpsFeed(value) {
  try { const url = new URL(String(value).trim()); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function newsConfiguration(env = process.env) {
  const configured = [...new Set(String(env.NEWS_RSS_URLS || '').split(',').map(value => value.trim()).filter(Boolean))];
  const feeds = configured.filter(httpsFeed);
  const rejected = configured.length - feeds.length;
  const limit = Number(env.NEWS_ITEM_LIMIT);
  return {
    feeds, rejected,
    itemLimit: Number.isInteger(limit) && limit > 0 ? limit : 200,
    status: feeds.length ? 'ready' : 'needs_setup',
    message: feeds.length
      ? `${feeds.length} suaka RSS terdaftar pada environment server; akses belum diuji pada sesi ini.${rejected ? ` ${rejected} alamat diabaikan karena bukan HTTPS tanpa kredensial di dalamnya.` : ''}`
      : 'Konektor RSS tersedia, tetapi NEWS_RSS_URLS belum diisi. Daftarkan URL suaka RSS resmi melalui environment server atau berkas .env lokal, bukan kolom browser atau chat. Belum ada permintaan yang dikirim.',
  };
}
const decodeEntities = value => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)) || ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)) || ' ')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'")
  .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&');
const plainText = value => decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export function parseFeed(xml) {
  const text = String(xml || '');
  const blocks = [...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(match => match[0]);
  return blocks.map((block, index) => {
    const field = names => {
      for (const name of names) {
        const found = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block);
        if (found?.[1]?.trim()) return found[1].trim();
      }
      return '';
    };
    const href = /<link[^>]*href\s*=\s*["']([^"']+)["']/i.exec(block);
    const link = (href?.[1] || field(['link'])).trim();
    const rawDate = field(['pubDate', 'published', 'updated', 'dc:date', 'date']);
    const title = plainText(field(['title', 'media:title']));
    return {
      title,
      summary: plainText(field(['description', 'summary', 'content:encoded', 'content'])),
      link: httpsFeed(link) ? link : '',
      stamp: Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null,
      author: plainText(field(['author', 'dc:creator'])),
      key: plainText(field(['guid', 'id'])) || link || `${title}|${index}`,
    };
  });
}
const integerText = value => new Intl.NumberFormat('id-ID').format(value);
export async function collectNews(fetcher = fetch, config = newsConfiguration()) {
  if (config.status === 'needs_setup') return { id: 'news', status: 'needs_setup', fetched: null, message: config.message, reviews: [] };
  const itemLimit = Number.isInteger(config.itemLimit) && config.itemLimit > 0 ? config.itemLimit : 200;
  const retrievedAt = new Date().toISOString();
  const identity = /\bwondr\s*(?:by\s*)?merchant\b|id\.bni\.wfb/i;
  const rows = new Map();
  const issues = [];
  let feedsRead = 0, itemsRead = 0, identityFiltered = 0, truncated = false;
  for (const feedUrl of config.feeds) {
    let body = '';
    try {
      const response = await fetcher(feedUrl, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) { issues.push(`${feedHost(feedUrl)} membalas HTTP ${response.status}`); continue; }
      body = await response.text();
    } catch (error) {
      const reason = /abort/i.test(String(error?.name ?? '')) ? 'waktu habis' : 'jaringan atau sertifikat';
      issues.push(`${feedHost(feedUrl)} tidak dapat dibaca (${reason})`);
      continue;
    }
    let items = [];
    try { items = parseFeed(body); } catch { issues.push(`struktur suaka ${feedHost(feedUrl)} tidak dapat diurai`); continue; }
    feedsRead++;
    if (!items.length) issues.push(`${feedHost(feedUrl)} mengembalikan 0 butir`);
    if (items.length > itemLimit) truncated = true;
    itemsRead += items.length;
    for (const item of items.slice(0, itemLimit)) {
      if (!identity.test(`${item.title} ${item.summary}`)) { identityFiltered++; continue; }
      const outlet = feedHost(item.link) || feedHost(feedUrl) || 'N/A';
      const hash = createHash('sha256').update(`${outlet}|${item.key}`).digest('hex').slice(0, 32);
      const text = [item.title, item.summary].filter(Boolean).join('. ').slice(0, 1500);
      rows.set(`news-${hash}`, {
        id: `news-${hash}`, platform: 'news', author: item.author || outlet,
        title: item.title, text, rating: null,
        date: item.stamp && validDate(item.stamp.slice(0, 10)) ? item.stamp.slice(0, 10) : null,
        publishedAt: item.stamp, sourceUrl: item.link || null, retrievedAt,
        context: { outlet, feedUrl },
        provenance: `Suaka RSS resmi ${outlet}; judul dan ringkasan disimpan apa adanya, bukan isi artikel penuh.`,
      });
    }
  }
  const coverage = { feeds: config.feeds.length, feedsRead, itemsRead, identityFiltered, productMatches: rows.size, sampleLimit: itemLimit, sampleLimitField: 'butiran per suaka', possiblyTruncated: truncated };
  const base = `${rows.size} judul & ringkasan menyebut identitas produk dari ${integerText(itemsRead)} butir pada ${feedsRead} dari ${config.feeds.length} suaka RSS; ${identityFiltered} butir lain tidak menyebut wondr merchant sehingga tidak disimpan.`;
  const limits = truncated ? ' Batas baca per suaka tercapai, jadi sebagian butir lama tidak diperiksa — bukan berarti tidak ada liputan.' : '';
  const message = `${base}${issues.length ? ` Sebagian suaka gagal: ${issues.join('; ')}.` : ' Semua suaka yang terdaftar dapat dibaca.'}${limits} Berita bukan ulasan pelanggan dan tidak dihitung sebagai sentimen merchant.`;
  return { id: 'news', status: issues.length || truncated ? 'partial' : 'success', fetched: rows.size, message, reviews: [...rows.values()], coverage };
}
export function channelConfigurations(env = process.env) {
  const apify = apifyConfiguration(env);
  return new Map([['youtube', youtubeConfiguration(env)], ['googlemaps', placesConfiguration(env)], ['news', newsConfiguration(env)], ...Object.keys(apifyChannels).map(id => [id, apify])]);
}
// Peta id platform -> kolektornya. Dipakai oleh collectOnline (semua kanal sekaligus)
// dan collectPlatform (satu kanal per permintaan, agar antarmuka dapat menampilkan
// progres yang nyata dan agar function serverless tidak perlu menahan 3 menit).
export function onlineCollectors({ apifyWaitMs = 180000, resume = new Map() } = {}) {
  const apify = apifyConfiguration();
  const youtube = youtubeConfiguration();
  const places = placesConfiguration();
  const news = newsConfiguration();
  const jobs = new Map([
    ['play', () => collectGoogle()],
    ['appstore', () => collectApple()],
    ['youtube', () => collectYouTube(fetch, youtube)],
    ['googlemaps', () => collectGooglePlaces(fetch, places)],
    ['news', () => collectNews(fetch, news)],
  ]);
  for (const id of Object.keys(apifyChannels)) jobs.set(id, () => collectApify(id, fetch, apify, { waitMs: apifyWaitMs, resume: resume.get(id) }));
  return jobs;
}
export async function collectPlatform(id, options = {}) {
  const collect = onlineCollectors(options).get(id);
  if (!collect) return null;
  try { return await collect(); } catch (error) {
    return { id, status: 'error', fetched: 0, message: `Gagal membaca sumber data. ${error instanceof SyntaxError ? 'parse_error: struktur data sumber berubah.' : error.message} Data sebelumnya tetap dipertahankan.`, reviews: [] };
  }
}
export async function collectOnline(options = {}) {
  return Promise.all([...onlineCollectors(options).keys()].map(id => collectPlatform(id, options)));
}
