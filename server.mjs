import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { collectOnline, collectPlatform, channelConfigurations } from './collectors.mjs';
import { loadLocalEnv } from './local-env.mjs';
import { overlayConfiguration, buildDataset, reclassifyDerived, resumeMap } from './dashboard-core.mjs';
import { discoverTarget } from './discovery.mjs';
import { normalizeTarget, targetFromDiscovery } from './target.mjs';
import {
  storeVersion, migrateStore, initialStore, projectList, resolveProjectId, datasetFor, setDataset,
  projectTarget, findProject, createProject, projectIdFrom, emptyDataset, removeProject, renameProject, strictProjectId,
} from './projects.mjs';
import { withAbsa } from './model.js';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/data.js', ['data.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/format.js', ['format.js', 'text/javascript; charset=utf-8']],
  ['/charts.js', ['charts.js', 'text/javascript; charset=utf-8']],
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
export async function createDashboardServer({ storagePath, collector = collectOnline, collectOne = collectPlatform, discover = discoverTarget, env, config = deploymentConfig(env ?? process.env) } = {}) {
  const dataPath = storagePath ?? config.storagePath;
  let store = initialStore();
  try {
    const saved = JSON.parse(await readFile(dataPath,'utf8'));
    if (saved.version !== storeVersion && !(Array.isArray(saved.reviews) && Array.isArray(saved.sources) && Array.isArray(saved.runs))) throw new Error('Format data tersimpan tidak valid. Berkas tidak diubah.');
    store = migrateStore(saved);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Pengujian menyuntik env sendiri; tanpa env, berkas .env lokal dimuat lebih dulu.
  const environment = env ?? await loadLocalEnv().then(() => process.env);
  const channelConfig = channelConfigurations(environment);
  // Status konfigurasi hanya menimpa tampilan; data tersimpan tidak diubah dan kunci tidak pernah dikirim ke browser.
  const readyDataset = (dataset, target = null) => ({
    ...dataset,
    reviews: withAbsa(reclassifyDerived(dataset.reviews, target)),
    sources: overlayConfiguration(dataset.sources, channelConfig),
  });
  const datasetTarget = (source, id) => (findProject(source, id) ? projectTarget(source, id) : null);
  store = { ...store, datasets: Object.fromEntries(Object.entries(store.datasets).map(([id, dataset]) => [id, readyDataset(dataset, datasetTarget(store, id))])) };
  let running = false;
  // Dataset yang dikirim selalu milik satu project, disertai daftar project agar antarmuka dapat
  // menampilkan jumlah project dan pemilihnya tanpa permintaan kedua. Status konfigurasi hanya
  // menimpa hasil baca pertama; hasil penarikan yang baru disimpan dilaporkan apa adanya.
  const view = project => {
    const id = resolveProjectId(store, project);
    return { ...datasetFor(store, id), projects: projectList(store), activeProject: id, target: projectTarget(store, id), running };
  };
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
  // Isi permintaan project hanya nama project dan identitas entitas: batas 32 KB dipasang agar
  // permintaan besar tidak menahan memori proses.
  const readJsonBody = async request => {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 32768) { request.destroy(); throw new Error('body_too_large: permintaan terlalu besar'); }
      chunks.push(chunk);
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  };
  // Project baru dibuat dari hasil penemuan yang sudah dikonfirmasi pengguna, atau dari ID toko
  // yang diisi manual. Datasetnya kosong; data awal tetap milik project bawaan.
  const addProject = async ({ name, entity, discovery, playAppId, appleAppId }) => {
    const target = discovery
      ? targetFromDiscovery({ discovery, name, id: projectIdFrom(name || entity) })
      : normalizeTarget({ name, entityName: entity, playAppId, appleAppId });
    const project = createProject({ name: name || entity, entity, target });
    if (findProject(store, project.id)) throw new Error('project_exists: project dengan nama itu sudah ada');
    // Dataset yatim (ID masih ada di berkas, project-nya tidak) tidak boleh ditimpa: itu satu-satunya
    // jalan yang bisa menghilangkan baris ulasan selain penghapusan yang disengaja.
    if ((store.datasets[project.id]?.reviews?.length || 0) > 0)
      throw new Error('project_data_exists: data lama dengan nama itu masih tersimpan, pakai nama lain');
    // Dataset baru langsung dibaca dengan status konfigurasi terkini: kanal tanpa kunci tampil
    // "perlu konfigurasi", kanal toko diberi keterangan "belum diambil pada project ini".
    const next = { ...store, projects: [...store.projects, project] };
    store = { ...next, activeProject: project.id, datasets: { ...store.datasets, [project.id]: readyDataset(emptyDataset(), projectTarget(next, project.id)) } };
    await persist(store);
    return view(project.id);
  };
  const activateProject = async project => {
    const id = resolveProjectId(store, project);
    store = { ...store, activeProject: id };
    await persist(store);
    return view(id);
  };
  // Mengganti nama project; dataset dan identitas toko tidak disentuh.
  const editProject = async ({ project, name }) => {
    const next = { ...store, projects: store.projects.map(item => ({ ...item })), datasets: { ...store.datasets } };
    const renamed = renameProject(next, strictProjectId(next, project), name);
    await persist(next);
    store = next;
    return view(renamed.id);
  };
  // Menghapus project non-bawaan beserta datasetnya; project aktif dikembalikan ke bawaan.
  const dropProject = async project => {
    const next = { ...store, projects: [...store.projects], datasets: { ...store.datasets } };
    removeProject(next, strictProjectId(next, project));
    await persist(next);
    store = next;
    return view(next.activeProject);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify(body)); };
    const port = server.address().port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...config.allowedHosts]);
    // Host diperiksa sebelum URL dibentuk. Header Host yang tidak sah membuat new URL()
    // melempar, dan lemparan di handler async menghentikan proses tanpa balasan — satu
    // permintaan rusak tidak boleh mematikan dasbor, apalagi di tengah penarikan data.
    if (!hosts.has(req.headers.host)) { json(403,{error:'Host tidak diizinkan.'}); return; }
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); }
    catch { json(400,{error:'Alamat permintaan tidak dapat dibaca.'}); return; }
    const path = url.pathname;
    const sameSite = !((req.headers.origin && req.headers.origin !== `${String(req.headers['x-forwarded-proto'] || config.scheme).split(',')[0].trim()}://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site');
    // Aksi yang mengubah project (buat, ganti nama, aktifkan, hapus) memakai pemeriksaan lebih
    // ketat: tanpa Origin dan tanpa Sec-Fetch-Site sama sekali, permintaan dianggap skrip. Kedua
    // header hanya dipasang peramban sehingga dasbor tetap terbuka tanpa akun.
    const site = String(req.headers['sec-fetch-site'] || '');
    const fromPage = site !== 'cross-site' && site !== 'none' && (req.headers.origin
      ? req.headers.origin === `${String(req.headers['x-forwarded-proto'] || config.scheme).split(',')[0].trim()}://${req.headers.host}`
      : site === 'same-origin');
    // /api/status dibiarkan tanpa kredensial karena host memakai endpoint itu untuk pemeriksaan kesehatan.
    if (config.user && path !== '/api/status') {
      const [method, encoded = ''] = String(req.headers.authorization || '').split(' ');
      const [user, ...passwordParts] = (method === 'Basic' ? Buffer.from(encoded, 'base64').toString('utf8') : '').split(':');
      if (!sameSecret(user, config.user) || !sameSecret(passwordParts.join(':'), config.password)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="wondr merchant", charset="UTF-8"');
        json(401,{error:'Kredensial diperlukan.'}); return;
      }
    }
    // Penemuan identitas memakai dua sumber gratis (iTunes Search dan halaman pencarian
    // Google Play) dan tidak menulis apa pun: hasilnya kandidat untuk dikonfirmasi pengguna.
    if (path === '/api/discover' && req.method === 'GET') {
      const entity = String(url.searchParams.get('entity') || '').trim();
      if (entity.length < 2) { json(400, { error: 'Nama entitas minimal dua karakter.' }); return; }
      try {
        json(200, { discovery: await discover({ entityName: entity }) });
      } catch (error) {
        console.error('Penemuan identitas gagal:', error.message);
        json(502, { error: 'Identitas aplikasi tidak dapat diperiksa saat ini. Data yang sudah tersimpan tidak diubah.' });
      }
      return;
    }
    if (path === '/api/project' && req.method === 'POST') {
      if (!sameSite || !fromPage) { json(403,{error:'Permintaan dari luar halaman ini ditolak.'}); return; }
      try {
        const body = await readJsonBody(req);
        const action = String(body.action || 'create');
        if (action === 'activate') { json(200, await activateProject(body.project)); return; }
        if (action === 'rename') { json(200, await editProject(body)); return; }
        if (action === 'delete') {
          if (running) { json(409, { error: 'Pengambilan data sedang berjalan. Tunggu hingga selesai.' }); return; }
          json(200, await dropProject(body.project));
          return;
        }
        if (action !== 'create') { json(400, { error: 'Aksi project tidak dikenal.' }); return; }
        if (running) { json(409, { error: 'Pengambilan data sedang berjalan. Tunggu hingga selesai.' }); return; }
        json(200, await addProject(body));
      } catch (error) {
        const message = String(error.message || '');
        if (/^(project_|target_invalid|discovery_unconfirmed|body_too_large)/.test(message)) { json(400, { error: message }); return; }
        console.error('Project gagal disimpan:', message);
        json(500, { error: 'Project tidak dapat disimpan. Data yang sudah ada tetap tersimpan.' });
      }
      return;
    }
    if (path === '/api/analyze' && req.method === 'POST') {
      if (!sameSite) { json(403,{error:'Permintaan lintas situs ditolak.'}); return; }
      if (running) { json(409,{error:'Pengambilan data sedang berjalan. Tunggu hingga selesai.'}); return; }
      running = true;
      const startedAt = new Date().toISOString();
      const params = url.searchParams;
      const platform = params.get('platform');
      // ?platform=x mengambil satu kanal; ?finish=1 menutup batch dan mencatat riwayat;
      // tanpa keduanya seluruh kanal diambil sekaligus seperti sebelumnya.
      const finish = params.get('finish') === '1';
      let project = store.activeProject;
      try {
        // Penarikan selalu mengikuti target project aktif: kanal yang kolektornya belum
        // mendukung target dilaporkan tidak dijalankan, bukan menarik data aplikasi lain.
        project = resolveProjectId(store, params.get('project'));
        const previous = datasetFor(store, project);
        const runOptions = { resume: resumeMap(previous), target: projectTarget(store, project) };
        const results = finish ? [] : platform ? [await collectOne(platform, runOptions)] : await collector(runOptions);
        if (platform && !results[0]) { running = false; json(400,{error:'Kanal yang diminta tidak dikenal, sehingga tidak ada permintaan yang dikirim.'}); return; }
        const finishedAt = new Date().toISOString();
        const recordRun = finish || !platform;
        // Salinan dangkal tidak cukup: setDataset mengubah objek dataset dan entri project,
        // sehingga store yang lama ikut berubah walau penyimpanan gagal.
        const next = { ...store, projects: store.projects.map(item => item.id === project ? { ...item } : item), datasets: { ...store.datasets } };
        setDataset(next, project, buildDataset({ previous, results, startedAt, finishedAt, channelConfig, recordRun, target: runOptions.target }), { pulledAt: recordRun ? finishedAt : undefined });
        await persist(next);
        store = next;
        running = false;
        json(200, view(project));
      } catch (error) {
        running = false;
        if (/^project_/.test(String(error.message))) { json(400, { error: error.message }); return; }
        console.error('Pengambilan data gagal:',error.message);
        json(500,{error:'Pengambilan atau penyimpanan data gagal. Data sebelumnya tetap tersimpan; silakan coba lagi.'});
      }
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); json(405,{error:'Metode tidak didukung.'}); return; }
    if (path === '/api/status') { json(200,{status:'ok',mode:'online-pull',running}); return; }
    if (path === '/api/data') {
      try { json(200, view(url.searchParams.get('project'))); }
      catch (error) { json(400, { error: String(error.message || 'Project tidak dikenal.') }); }
      return;
    }
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
