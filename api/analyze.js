// Batas waktu function dinyatakan di sini agar cocok dengan anggaran tunggu actor:
// dashboard-store memotong APIFY_WAIT_MS di bawah nilai ini sehingga run yang belum selesai
// sempat dicatat dan dilanjutkan pada penarikan berikutnya, bukan dipotong Vercel di tengah
// jalan (yang meninggalkan run berbayar tanpa catatan).
export const config = { maxDuration: 60 };

// Memicu penarikan ulasan dari sumber publik. Tanpa login atas permintaan pemilik akun:
// yang tersisa hanya penolakan permintaan lintas situs dan kunci satu-penarikan-per-waktu.
import { pull, pullPlatform, finishPull } from '../dashboard-store.mjs';

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

// Host diambil dari proxy header Vercel lebih dahulu. Tanpa host yang dapat dipastikan,
// permintaan ditolak: penarikan ini memakai kuota berbayar, jadi gerbangnya gagal tertutup.
export function rejectsSameSiteCheck(headers) {
  const host = String(headers['x-forwarded-host'] || headers.host || '');
  const scheme = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const origin = String(headers.origin || '');
  if (!host || headers['sec-fetch-site'] === 'cross-site') return true;
  if (!origin) return false;
  return ![`${scheme}://${host}`, `https://${host}`, `http://${host}`].includes(origin);
}

// `run` dapat disuntik agar pengujian tidak memanggil sumber nyata; Vercel hanya mengirim
// (request, response) sehingga nilai bawaannya dipakai di production.
export default async function handler(request, response, run = runPull) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' });
    response.end('');
    return;
  }
  if (rejectsSameSiteCheck(request.headers)) {
    json(response, 403, { error: 'Permintaan lintas situs ditolak.' });
    return;
  }
  const params = new URL(request.url, 'http://internal').searchParams;
  try {
    json(response, 200, await run({ platform: params.get('platform'), finish: params.get('finish') === '1' }));
  } catch (error) {
    if (error.message === 'busy') { json(response, 409, { error: 'Pengambilan data sedang berjalan. Tunggu hingga selesai.' }); return; }
    if (error.message === 'unknown-platform') { json(response, 400, { error: 'Kanal yang diminta tidak dikenal, sehingga tidak ada permintaan yang dikirim.' }); return; }
    console.error('Penarikan data gagal:', error.message);
    json(response, 500, { error: 'Pengambilan atau penyimpanan data gagal. Data sebelumnya tetap tersimpan; silakan coba lagi.' });
  }
}

// ?platform=x mengambil satu kanal; ?finish=1 menutup batch dan mencatat riwayat;
// tanpa keduanya seluruh kanal diambil sekaligus.
function runPull({ platform, finish }) {
  if (finish) return finishPull();
  return platform ? pullPlatform(platform) : pull();
}
