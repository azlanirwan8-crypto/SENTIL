// Membuat project baru, memindahkan project aktif, mengganti namanya, atau menghapus project
// beserta datasetnya. Batas waktu function dinyatakan di sini agar cocok dengan konfigurasi
// deployment ($0 tier).
export const config = { maxDuration: 30 };

import { addProject, activateProject, dropProject, editProject, isRunning } from '../dashboard-store.mjs';

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

const clientError = message => /^(project_|target_invalid|discovery_unconfirmed|body_too_large)/.test(String(message || ''));

// Isi permintaan hanya nama project dan identitas entitas; batas 32 KB dipasang agar permintaan
// besar tidak menahan memori function.
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

// `run` dapat disuntik agar pengujian tidak menyentuh penyimpanan; Vercel hanya mengirim
// (request, response) sehingga nilai bawaannya dipakai di production.
export default async function handler(request, response, run = runProject) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' });
    response.end('');
    return;
  }
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '');
  const origin = String(request.headers.origin || '');
  const site = String(request.headers['sec-fetch-site'] || '');
  // Pemeriksaan ditutup ke arah gagal: permintaan tanpa Origin DAN tanpa Sec-Fetch-Site
  // same-origin tidak dilayani. Kedua header hanya bisa dikirim peramban dan tidak dapat
  // dipalsukan dari fetch/skrip, jadi tombol tetap jalan tanpa akun atau kata sandi sementara
  // `curl` anonim tidak bisa lagi menghapus atau menimpa project.
  if (!host || site === 'cross-site' || site === 'none' || (origin ? !origin.endsWith(`://${host}`) : site !== 'same-origin')) {
    json(response, 403, { error: 'Permintaan dari luar halaman ini ditolak.' });
    return;
  }
  try {
    json(response, 200, await run(await readBody(request)));
  } catch (error) {
    if (error.message === 'busy' || isRunning()) { json(response, 409, { error: 'Pengambilan data sedang berjalan. Tunggu hingga selesai.' }); return; }
    if (clientError(error.message)) { json(response, 400, { error: error.message }); return; }
    console.error('Project gagal disimpan:', error.message);
    json(response, 500, { error: 'Project tidak dapat disimpan. Data yang sudah ada tetap tersimpan.' });
  }
}

function runProject(body) {
  const action = String(body.action || 'create');
  if (action === 'activate') return activateProject(body.project);
  if (action === 'rename') return editProject(body);
  if (action === 'delete') return dropProject(body.project);
  if (action !== 'create') throw new Error('project_action: aksi project tidak dikenal');
  return addProject(body);
}
