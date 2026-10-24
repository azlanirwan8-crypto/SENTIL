// Daftar ulasan dan status sumber untuk dasbor. Data mentah tidak memuat kunci API.
import { snapshot } from '../dashboard-store.mjs';

export default async function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Metode tidak didukung.' }));
    return;
  }
  const body = JSON.stringify(await snapshot());
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? '' : body);
}
