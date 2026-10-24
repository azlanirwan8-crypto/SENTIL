import { playUrl } from './data.js';
import { validDate } from './model.js';

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
  const unique = new Map();
  for (const item of shelf.items) {
    const r = item.review;
    check(r?.$kind === 'Review','struktur data ulasan Apple berubah');
    const review = normalizeReview({id:r.id,author:r.reviewerName,title:r.title,text:r.contents ?? '',rating:r.rating,date:r.date},'appstore',appleUrl);
    if (review.text.trim()) unique.set(review.id,review);
  }
  return {reviews:[...unique.values()],rating,ratingCount,continuationUrl: shelf.url ?? null};
}
// Paginasi dibaca sampai sumber tidak mengirim token halaman berikutnya; tidak ada batas jumlah sampel.
const timeBudget = 240000;
export async function collectGoogle(fetcher = fetch) {
  const metadata = parseGoogleListing(await fetchText(playUrl + '&gl=ID',{},fetcher));
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
  const notListed = metadata.ratingCount - reviews.size;
  const depth = pools.map(p => `${p.label}: ${p.pagesRead} halaman, ${p.rows} baris`).join('; ');
  return {id:'play',status:allPoolsComplete?'success':'partial',...metadata,installs,reviews:[...reviews.values()],fetched:reviews.size,
    coverage:{pools:pools.map(({hl,gl,label,pagesRead,rows,added,complete,error})=>({hl,gl,label,pagesRead,rows,added,complete,error})),pagesRead:pools.reduce((sum,p)=>sum+p.pagesRead,0),rows:pools.reduce((sum,p)=>sum+p.rows,0),sampleLimit:null},
    message:`${reviews.size} ulasan tertulis unik dibaca dari Google Play sebagai gabungan ${pools.map(p=>`${p.added} ulasan ${p.label}`).join(' dan ')}. Kedua kumpulan ditampilkan Google berdasarkan bahasa antarmuka, sehingga keduanya dibaca agar tidak ada ulasan terlewat. Paginasi diikuti sampai sumber tidak mengirim halaman berikutnya (${depth}); kolektor tidak memiliki batas jumlah sampel. ${allPoolsComplete?'Kedua kumpulan selesai dipaginasi.':`Hasil belum lengkap; ${issues.join('; ')}`} Halaman toko menampilkan ${metadata.ratingCount} penilaian, sedangkan daftar ulasan publik menampilkan ${reviews.size} ulasan berteks; selisih ${notListed} penilaian tidak muncul sebagai ulasan berteks pada daftar publik dan penyebabnya tidak disimpulkan per ulasan. Unduhan: ${installs ? `${installs} (rentang yang dipublikasikan Google, bukan angka pasti)` : 'tidak terbaca pada pemeriksaan ini'}.${issues.length?` Catatan: ${issues.join('; ')}`:''}`};
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
  let url = appleUrl, rating = null, ratingCount = null, pages = 0, complete = false, error = null;
  for (;;) {
    if (seen.has(url)) { error = 'pagination_error: tautan lanjutan berulang; pengambilan dihentikan.'; break; }
    seen.add(url);
    if (pages >= applePageLimit) { error = 'page_limit: batas keamanan tautan lanjutan tercapai; halaman berikutnya belum dibaca.'; break; }
    let result;
    try { result = parseApplePage(await fetchText(url,{},fetcher)); }
    catch (cause) { error = cause.message; break; }
    pages++;
    rating = result.rating; ratingCount = result.ratingCount;
    for (const review of result.reviews) if (!reviews.has(review.id)) reviews.set(review.id,review);
    const next = appleNextUrl(result.continuationUrl, url);
    if (result.continuationUrl != null && !next) { error = 'continuation_error: tautan halaman berikutnya bukan halaman publik aplikasi ini; pengambilan dihentikan.'; break; }
    if (!next) { complete = true; break; }
    url = next;
  }
  return {reviews,rating,ratingCount,pages,complete,error};
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
  return {id:'appstore',status:complete?'success':'partial',reviews:[...reviews.values()],fetched:reviews.size,rating:shelf.rating,ratingCount:shelf.ratingCount,
    coverage:{shelfPages:shelf.pages,feedPages:feed.pages,shelfReviews:shelf.reviews.size,feedReviews:feed.reviews.size,sharedReviews:shared,feedOnly:feedOnly.length,sampleLimit:null},
    message:`${reviews.size} ulasan tertulis unik dibaca dari App Store Indonesia melalui dua jalur publik sekaligus: halaman ulasan resmi (${shelf.reviews.size} ulasan pada ${shelf.pages} halaman) dan feed ulasan pelanggan resmi (${feed.reviews.size} ulasan pada ${feed.pages} halaman); ${shared} ulasan dikonfirmasi oleh kedua jalur dan ${feedOnly.length} hanya dikembalikan salah satu jalur. Paginasi kedua jalur diikuti sampai sumber tidak memberi halaman berikutnya; kolektor tidak memiliki batas jumlah sampel. ${complete?'Kedua jalur selesai dibaca.':`Hasil belum lengkap; ${issues.join('; ')}.`} ${Number.isInteger(shelf.ratingCount)?`Halaman toko menampilkan ${shelf.ratingCount} penilaian, sedangkan ${reviews.size} muncul sebagai ulasan berteks pada jalur publik; sisanya tidak ditampilkan sebagai teks ulasan dan penyebabnya tidak disimpulkan per ulasan. Jumlah ini bukan jumlah seluruh pengguna iOS.`:'Nilai halaman toko tidak terbaca pada pemeriksaan ini.'} Apple tidak mempublikasikan jumlah unduhan.`};
}
const merchantIdentity = /\bwondr\s+merchant\b|\bid\.bni\.wfb(?![\w.])|\b(?:id)?6741567238\b/i;
export function youtubeConfiguration(env = process.env) {
  const apiKey = env.YOUTUBE_API_KEY?.trim() || '';
  const videoIds = [...new Set((env.YOUTUBE_VIDEO_IDS || '').split(/[\s,]+/).filter(Boolean))];
  const valid = videoIds.every(id => /^[\w-]{11}$/.test(id));
  return { apiKey, videoIds, status: apiKey && valid ? 'ready' : 'needs_setup', message: !apiKey ? 'Konektor YouTube Data API tersedia, tetapi YOUTUBE_API_KEY belum dikonfigurasi pada server. Aktifkan YouTube Data API v3 dan pasang kunci melalui environment server, bukan kolom browser atau chat. Belum ada komentar yang diambil.' : !valid ? 'YOUTUBE_VIDEO_IDS harus berisi ID video YouTube yang valid, dipisahkan koma. Belum ada permintaan dikirim.' : 'Kunci API tersedia, tetapi akses belum diuji. Tarik Analisis akan mencari video wondr merchant dan membaca komentar publik beserta balasannya; status ini belum berarti terhubung.' };
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
export async function collectOnline() {
  return Promise.all([['play',collectGoogle],['appstore',collectApple],['youtube',collectYouTube]].map(async ([id,collect]) => {
    try { return await collect(); }
    catch (error) { return {id,status:'error',fetched:0,message:`Gagal membaca sumber data. ${error instanceof SyntaxError ? 'parse_error: struktur data sumber berubah.' : error.message} Data sebelumnya tetap dipertahankan.`,reviews:[]}; }
  }));
}
