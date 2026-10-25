// Daftar ulasan dan status sumber untuk satu project. Data mentah tidak memuat kunci API.
import { snapshot } from '../dashboard-store.mjs';

export default async function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Metode tidak didukung.' }));
    return;
  }
  const project = new URL(request.url, 'http://internal').searchParams.get('project');
  let body;
  try {
    body = JSON.stringify(await snapshot({ project }));
  } catch (error) {
    const status = String(error.message).startsWith('project_') ? 400 : 500;
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: status === 400 ? 'Project yang diminta tidak terdaftar.' : 'Data tidak dapat dimuat.' }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? '' : body);
}
