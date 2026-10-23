import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { seedReviews, platforms, observationDate } from './data.js';
import { upsertReviews } from './model.js';
import { collectOnline } from './collectors.mjs';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/data.js', ['data.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
]);
const connectedSources = new Set(['play','appstore']);
export async function createDashboardServer({ storagePath = new URL('./online-data.json', import.meta.url), collector = collectOnline } = {}) {
  let data = {
    reviews: seedReviews, runs: [], lastRun: null,
    sources: platforms.map(p => ({ id: p.id, status: connectedSources.has(p.id) ? 'snapshot' : 'unsupported', fetched: 0, message: connectedSources.has(p.id) ? 'Data awal dari halaman publik; belum diperbarui pada sesi ini.' : `Belum terhubung; tidak ada pengambilan data. ${p.note}`, ...(p.rating ? { rating: p.rating, ratingCount: p.ratingCount, ratingObservedAt: observationDate } : {}) })),
  };
  try {
    const saved = JSON.parse(await readFile(storagePath,'utf8'));
    if (!Array.isArray(saved.reviews) || !Array.isArray(saved.sources) || !Array.isArray(saved.runs)) throw new Error('Format data tersimpan tidak valid. Berkas tidak diubah.');
    data = saved;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let running = false;
  const snapshot = () => ({ ...data, running });
  const persist = async next => {
    const temporary = storagePath instanceof URL ? new URL(storagePath.href + '.tmp') : storagePath + '.tmp';
    await writeFile(temporary, JSON.stringify(next,null,2),'utf8');
    await rename(temporary,storagePath);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify(body)); };
    const port = server.address().port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) { json(403,{error:'Host tidak diizinkan.'}); return; }
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (path === '/api/analyze' && req.method === 'POST') {
      if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { json(403,{error:'Permintaan lintas situs ditolak.'}); return; }
      if (running) { json(409,{error:'Pengambilan data sedang berjalan. Tunggu hingga selesai.'}); return; }
      running = true;
      const startedAt = new Date().toISOString();
      try {
        const results = await collector();
        const finishedAt = new Date().toISOString();
        const incoming = results.flatMap(r => r.reviews || []);
        const merged = upsertReviews(data.reviews,incoming,finishedAt.slice(0,10));
        const sources = platforms.map(p => {
          const result = results.find(r => r.id === p.id);
          const previous = data.sources.find(s => s.id === p.id) || { id: p.id };
          if (!result) return { ...previous, status: 'unsupported', fetched: 0, message: `Belum terhubung; tidak ada pengambilan data. ${p.note}` };
          const { reviews, ...source } = result;
          const success = source.status === 'success' || source.status === 'partial';
          return { ...previous, ...source, checkedAt: finishedAt, ...(success ? { lastSuccessAt: finishedAt } : {}), ...(Number.isFinite(source.rating) ? { ratingObservedAt: finishedAt } : {}) };
        });
        const successes = results.filter(r => r.status === 'success' || r.status === 'partial').length;
        const status = !successes ? 'error' : successes === platforms.length && results.every(r => r.status === 'success') ? 'success' : 'partial';
        const run = { startedAt, finishedAt, status, added: merged.added, updated: merged.updated, unchanged: merged.unchanged, sources: sources.map(s => ({ ...s })) };
        const next = { reviews: merged.reviews, sources, lastRun: run, runs: [...data.runs,run] };
        await persist(next);
        data = next;
        running = false;
        json(200,snapshot());
      } catch (error) {
        running = false;
        console.error('Pengambilan data gagal:',error.message);
        json(500,{error:'Pengambilan atau penyimpanan data gagal. Data sebelumnya tetap tersimpan; silakan coba lagi.'});
      }
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); json(405,{error:'Metode tidak didukung.'}); return; }
    if (path === '/api/status') { json(200,{status:'ok',mode:'online-pull',running}); return; }
    if (path === '/api/data') { json(200,snapshot()); return; }
    const target = files.get(path);
    if (!target) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const body = await readFile(new URL(target[0], import.meta.url));
      res.setHeader('Content-Type', target[1]);
      res.end(req.method === 'HEAD' ? '' : body);
    } catch { json(500,{error:'Aplikasi tidak dapat dimuat.'}); }
  });
  return server;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  const server = await createDashboardServer();
  server.listen(port,'127.0.0.1',() => console.log(`Dasbor sentimen wondr merchant: http://127.0.0.1:${port}`));
}
