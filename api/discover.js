// Pemeriksaan identitas aplikasi lewat dua sumber gratis (iTunes Search dan halaman pencarian
// Google Play). Lintasan ini hanya membaca: tidak ada data yang disimpan sebelum pengguna
// mengonfirmasi kandidat yang ditampilkan dasbor.
export const config = { maxDuration: 30 };

import { discover } from '../dashboard-store.mjs';

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

// `run` disuntik pada pengujian agar tidak ada permintaan nyata ke Google atau Apple.
export default async function handler(request, response, run = discover) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end('');
    return;
  }
  const entity = String(new URL(request.url, 'http://internal').searchParams.get('entity') || '').trim();
  if (entity.length < 2) { json(response, 400, { error: 'Nama aplikasi minimal dua karakter.' }); return; }
  try {
    // Sama seperti server.mjs: yang dikirim ke antarmuka adalah isi pembungkus
    // { ok, discovery, queries, partial }, bukan objek pembungkusnya.
    const { discovery, queries = [], partial = null } = await run({ entity, fetcher: fetch });
    json(response, 200, { discovery, queries, partial });
  } catch (error) {
    if (String(error.message).startsWith('project_')) { json(response, 400, { error: error.message }); return; }
    console.error('Penemuan identitas gagal:', error.message);
    json(response, 502, { error: 'Identitas aplikasi tidak dapat diperiksa saat ini. Data yang sudah tersimpan tidak diubah.' });
  }
}
