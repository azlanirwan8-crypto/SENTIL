// Pemeriksaan kesehatan untuk platform hosting; sengaja tanpa data dan tanpa kredensial.
import { isRunning } from '../dashboard-store.mjs';

export default function handler(request, response) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ status: 'ok', mode: 'online-pull', running: isRunning() }));
}
