// Menyimpan atau mereset label sentimen yang dibuat analis. Teks asli, penulis, tanggal,
// bintang, dan tautan tidak diubah; hanya field turunan sentimen yang diganti.
export const config = { maxDuration: 30 };

import { labelReview } from '../dashboard-store.mjs';

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

const clientError = message => /^(label_|project_|body_too_large)/.test(String(message || ''));

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) { request.destroy(); throw new Error('body_too_large: permintaan terlalu besar'); }
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

export default async function handler(request, response, run = labelReview) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' });
    response.end('');
    return;
  }
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '');
  const origin = String(request.headers.origin || '');
  const site = String(request.headers['sec-fetch-site'] || '');
  // Sama seperti endpoint project: tanpa Origin DAN tanpa Sec-Fetch-Site same-origin, permintaan
  // tidak dilayani. Ini bukan pengganti login; dasbor memang dipakai tanpa akun.
  if (!host || site === 'cross-site' || site === 'none' || (origin ? !origin.endsWith(`://${host}`) : site !== 'same-origin')) {
    json(response, 403, { error: 'Permintaan dari luar halaman ini ditolak.' });
    return;
  }
  try {
    json(response, 200, await run(await readBody(request)));
  } catch (error) {
    if (error.message === 'busy') { json(response, 409, { error: 'Pengambilan data sedang berjalan. Tunggu hingga selesai sebelum melabeli ulasan.' }); return; }
    if (clientError(error.message)) { json(response, 400, { error: error.message }); return; }
    console.error('Label manual gagal disimpan:', error.message);
    json(response, 500, { error: 'Label tidak dapat disimpan. Data yang sudah ada tetap tersimpan.' });
  }
}
