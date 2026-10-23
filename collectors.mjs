import { playUrl } from './data.js';
import { validDate } from './model.js';

const appleUrl = 'https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?see-all=reviews&platform=iphone';
const rpcUrl = 'https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=oCPfdb&hl=id&gl=ID';
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
  return { id:platform === 'appstore' ? `apple-${raw.id}` : raw.id, platform, author:raw.author?.trim() || 'N/A', text:raw.text, ...(raw.title != null ? {title:raw.title} : {}), rating:raw.rating ?? null, date:publishedAt?.slice(0,10) ?? null, publishedAt, sourceUrl, provenance:platform === 'play' ? 'Halaman publik Google Play; daftar ulasan terbaru, Indonesia (id.bni.wfb)' : 'Halaman ulasan publik App Store Indonesia; ID dan waktu asli (6741567238)' };
}
export function parseGoogleListing(html) {
  const listing = scripts(html).filter(m => /type=["']application\/ld\+json["']/i.test(m[1])).map(m => JSON.parse(m[2])).find(x => x['@type'] === 'SoftwareApplication');
  check(listing && new URL(listing.url).searchParams.get('id') === 'id.bni.wfb','identitas aplikasi di Google Play berubah');
  const rating = Number(listing.aggregateRating?.ratingValue), ratingCount = Number(listing.aggregateRating?.ratingCount);
  check(rating >= 1 && rating <= 5 && Number.isInteger(ratingCount) && ratingCount >= 0,'nilai rating Google Play tidak terbaca');
  return {rating,ratingCount};
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
  return {reviews,cursor:payload[1]?.[1] ?? null};
}
export function parseApplePage(html) {
  const script = scripts(html).find(m => /\bid=["']serialized-server-data["']/i.test(m[1]));
  check(script,'data ulasan App Store tidak ditemukan');
  const root = JSON.parse(script[2]);
  check(Array.isArray(root.data),'struktur data App Store berubah');
  const page = root.data.find(x => x.intent?.id === '6741567238' && x.intent?.storefront === 'id')?.data;
  const shelf = page?.shelfMapping?.allProductReviews;
  const listing = page?.shelfMapping?.productRatings?.items?.[0];
  check(Array.isArray(shelf?.items),'bagian ulasan App Store tidak ditemukan');
  check(listing?.productId === '6741567238','identitas aplikasi di App Store berubah');
  const rating = Number(listing.ratingAverage), ratingCount = Number(listing.totalNumberOfRatings);
  check(rating >= 1 && rating <= 5 && Number.isInteger(ratingCount) && ratingCount >= 0,'nilai rating App Store tidak terbaca');
  const unique = new Map();
  for (const item of shelf.items) {
    const r = item.review;
    check(r?.$kind === 'Review','struktur data ulasan Apple berubah');
    const review = normalizeReview({id:r.id,author:r.reviewerName,title:r.title,text:r.contents ?? '',rating:r.rating,date:r.date},'appstore',appleUrl);
    if (review.text.trim()) unique.set(review.id,review);
  }
  return {reviews:[...unique.values()],rating,ratingCount,pagination: Boolean(shelf.url)};
}
export async function collectGoogle(fetcher = fetch, sorts = [2]) {
  const metadata = parseGoogleListing(await fetchText(playUrl + '&gl=ID',{},fetcher));
  const reviews = new Map();
  const issues = [];
  let exhaustedAll = true;
  const started = Date.now();
  for (const sort of sorts) {
    let cursor = null, exhausted = false;
    const cursors = new Set();
    for (let page = 0; page < 10; page++) {
      try {
        if (Date.now() - started > 110000) throw new Error('Batas waktu pengambilan tercapai; hasil yang sudah dibaca tetap disimpan.');
        const args = [null,[sort,2,[100,null,cursor],null,[null,null,null,null,null,null,null,null,2]],['id.bni.wfb',7]];
        const raw = await fetchText(rpcUrl,{method:'POST',body:new URLSearchParams({'f.req':JSON.stringify([[['oCPfdb',JSON.stringify(args),null,'generic']]])})},fetcher);
        const result = parseGoogleReviews(raw);
        for (const review of result.reviews) reviews.set(review.id,review);
        cursor = result.cursor;
        if (!cursor) { exhausted = true; break; }
        if (cursors.has(cursor)) throw new Error('pagination_error: halaman berikutnya berulang; pengambilan dihentikan.');
        cursors.add(cursor);
      } catch (error) {
        if (!reviews.size) throw error;
        issues.push(`urutan ${sort === 2 ? 'terbaru' : 'paling relevan'}: ${error.message}`);
        break;
      }
    }
    if (!exhausted) exhaustedAll = false;
  }
  return {id:'play',status:exhaustedAll?'success':'partial',...metadata,reviews:[...reviews.values()],fetched:reviews.size,message:`${reviews.size} ulasan tertulis unik dibaca dari urutan terbaru untuk wilayah Indonesia. ${exhaustedAll?'Seluruh halaman berhasil dibaca.':'Hasil belum lengkap; sebagian halaman gagal dibaca.'} Jumlah ini adalah ulasan berteks yang dapat diakses publik, bukan ${metadata.ratingCount} penilaian di halaman toko. Sebagian penilaian tidak menyertakan teks sehingga nama dan isinya tidak tersedia untuk dianalisis.${issues.length?` Catatan: ${issues.join('; ')}`:''}`};
}
export async function collectApple(fetcher = fetch) {
  const result = parseApplePage(await fetchText(appleUrl,{},fetcher));
  return {id:'appstore',status:result.pagination?'partial':'success',reviews:result.reviews,fetched:result.reviews.length,rating:result.rating,ratingCount:result.ratingCount,message:`${result.reviews.length} ulasan tertulis dibaca dari halaman publik App Store Indonesia. ${result.pagination?'Masih ada halaman lanjutan yang belum diambil.':'Tidak ada halaman lanjutan pada tampilan publik.'} Jumlah ini bukan jumlah seluruh penilaian.`};
}
export async function collectOnline() {
  return Promise.all([['play',collectGoogle],['appstore',collectApple]].map(async ([id,collect]) => {
    try { return await collect(); }
    catch (error) { return {id,status:'error',fetched:0,message:`Gagal membaca sumber data. ${error instanceof SyntaxError ? 'parse_error: struktur data sumber berubah.' : error.message} Data sebelumnya tetap dipertahankan.`,reviews:[]}; }
  }));
}
