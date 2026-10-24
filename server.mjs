import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { collectOnline, collectPlatform, channelConfigurations } from './collectors.mjs';
import { loadLocalEnv } from './local-env.mjs';
import { initialDataset, overlayConfiguration, buildDataset, reclassifyDerived, resumeMap } from './dashboard-core.mjs';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/data.js', ['data.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ...[400,500,600,700].map(weight => {
    const file = `assets/fonts/poppins-latin-${weight}-normal.woff2`;
    return [`/${file}`, [file, 'font/woff2']];
  }),
  ['/assets/fonts/Poppins-OFL.txt', ['assets/fonts/Poppins-OFL.txt', 'text/plain; charset=utf-8']],
]);
// Konfigurasi deployment. Mode publik (bind 0.0.0.0 atau domain diizinkan) wajib
// berkredensial: tombol Tarik Analisis memicu actor Apify berbayar pada akun pemilik.
export function deploymentConfig(env = process.env) {
  const bindHost = env.BIND_HOST?.trim() || '127.0.0.1';
  const allowedHosts = (env.ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean);
  const publicBind = bindHost === '0.0.0.0' || bindHost === '::' || bindHost === '*';
  const exposed = publicBind || allowedHosts.length > 0;
  const user = env.DASHBOARD_USER?.trim() || '';
  const password = env.DASHBOARD_PASSWORD || '';
  if (exposed && (!user || !password)) throw new Error('Mode publik membutuhkan DASHBOARD_USER dan DASHBOARD_PASSWORD. Tanpa itu, siapa pun yang mengetahui alamat situs dapat memicu penarikan data berbayar. Untuk pemakaian lokal, biarkan BIND_HOST pada 127.0.0.1 dan jangan isi ALLOWED_HOSTS.');
  return {
    bindHost, allowedHosts, exposed, user, password,
    port: Number(env.PORT || 4173),
    scheme: env.PUBLIC_SCHEME === 'http' ? 'http' : exposed ? 'https' : 'http',
    storagePath: env.DATA_PATH?.trim() || new URL('./online-data.json', import.meta.url),
  };
}
const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given), 'utf8'), b = Buffer.from(String(expected), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};
export async function createDashboardServer({ storagePath, collector = collectOnline, collectOne = collectPlatform, env, config = deploymentConfig(env ?? process.env) } = {}) {
  const dataPath = storagePath ?? config.storagePath;
  let data = initialDataset();
  try {
    const saved = JSON.parse(await readFile(dataPath,'utf8'));
    if (!Array.isArray(saved.reviews) || !Array.isArray(saved.sources) || !Array.isArray(saved.runs)) throw new Error('Format data tersimpan tidak valid. Berkas tidak diubah.');
    data = saved;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  data.reviews = reclassifyDerived(data.reviews);
  // Pengujian menyuntik env sendiri; tanpa env, berkas .env lokal dimuat lebih dulu.
  const environment = env ?? await loadLocalEnv().then(() => process.env);
  const channelConfig = channelConfigurations(environment);
  // Status konfigurasi hanya menimpa tampilan; data tersimpan tidak diubah dan kunci tidak pernah dikirim ke browser.
  data.sources = overlayConfiguration(data.sources, channelConfig);
  let running = false;
  const snapshot = () => ({ ...data, running });
  // rename() di Windows sering gagal sesaat (EBUSY/EPERM/EACCES) ketika antivirus atau
  // indexer masih memegang berkas target, jadi penulisan diulang beberapa kali sebelum
  // dilaporkan gagal.
  const renameWithRetry = async (from, to) => {
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(from, to); return; }
      catch (error) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  };
  const persist = async next => {
    const temporary = dataPath instanceof URL ? new URL(dataPath.href + '.tmp') : dataPath + '.tmp';
    await writeFile(temporary, JSON.stringify(next,null,2),'utf8');
    await renameWithRetry(temporary,dataPath);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify(body)); };
    const port = server.address().port;
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...config.allowedHosts]);
    if (!hosts.has(req.headers.host)) { json(403,{error:'Host tidak diizinkan.'}); return; }
    // /api/status dibiarkan tanpa kredensial karena host memakai endpoint itu untuk pemeriksaan kesehatan.
    if (config.user && path !== '/api/status') {
      const [method, encoded = ''] = String(req.headers.authorization || '').split(' ');
      const [user, ...passwordParts] = (method === 'Basic' ? Buffer.from(encoded, 'base64').toString('utf8') : '').split(':');
      if (!sameSecret(user, config.user) || !sameSecret(passwordParts.join(':'), config.password)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="wondr merchant", charset="UTF-8"');
        json(401,{error:'Kredensial diperlukan.'}); return;
      }
    }
    if (path === '/api/analyze' && req.method === 'POST') {
      const scheme = String(req.headers['x-forwarded-proto'] || config.scheme).split(',')[0].trim();
      if ((req.headers.origin && req.headers.origin !== `${scheme}://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { json(403,{error:'Permintaan lintas situs ditolak.'}); return; }
      if (running) { json(409,{error:'Pengambilan data sedang berjalan. Tunggu hingga selesai.'}); return; }
      running = true;
      const startedAt = new Date().toISOString();
      const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const platform = params.get('platform');
      // ?platform=x mengambil satu kanal; ?finish=1 menutup batch dan mencatat riwayat;
      // tanpa keduanya seluruh kanal diambil sekaligus seperti sebelumnya.
      const finish = params.get('finish') === '1';
      try {
        // Run actor yang masih berjalan dari permintaan sebelumnya dilanjutkan, bukan
        // diulang, agar penarikan lokal tidak membayar run ganda.
        const runOptions = { resume: resumeMap(data) };
        const results = finish ? [] : platform ? [await collectOne(platform, runOptions)] : await collector(runOptions);
        if (platform && !results[0]) { running = false; json(400,{error:'Kanal yang diminta tidak dikenal, sehingga tidak ada permintaan yang dikirim.'}); return; }
        const finishedAt = new Date().toISOString();
        const next = buildDataset({ previous: data, results, startedAt, finishedAt, channelConfig, recordRun: finish || !platform });
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
  await loadLocalEnv();
  const config = deploymentConfig();
  const server = await createDashboardServer({ config });
  const shown = config.exposed ? `${config.scheme}://<domain Anda>` : `http://127.0.0.1:${config.port}`;
  server.listen(config.port, config.bindHost, () => console.log(`Dasbor sentimen wondr merchant: ${shown}`));
}
