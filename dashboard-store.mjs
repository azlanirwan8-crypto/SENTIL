// Penyimpanan dataset untuk lingkungan serverless (Vercel Functions).
// Disk /tmp hanya bertahan selama instance hidup, jadi state dipegang di memori
// dan ditulis ke DATA_PATH agar penarikan berikutnya tetap memakai riwayat yang sama.
// Berkas yang sama memuat beberapa project; setiap project punya dataset sendiri.
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { collectOnline, collectPlatform, channelConfigurations } from './collectors.mjs';
import { overlayConfiguration, buildDataset, reclassifyDerived, resumeMap, applyManualLabel } from './dashboard-core.mjs';
import { withAbsa } from './model.js';
import { discoverTarget } from './discovery.mjs';
import { defaultTarget, normalizeTarget, targetFromDiscovery } from './target.mjs';
import {
  migrateStore, initialStore, projectList, resolveProjectId, datasetFor, setDataset,
  projectTarget, safeProjectTarget, findProject, createProject, projectIdFrom, emptyDataset, emptyView, removeProject, renameProject, strictProjectId,
} from './projects.mjs';

// Environment dibaca saat dipakai agar fungsi yang baru dimuat ulang mengikuti
// konfigurasi deployment, bukan nilai saat modul pertama kali diimpor.
const storagePath = () => process.env.DATA_PATH?.trim() || '/tmp/online-data.json';
// Actor Apify dapat berjalan beberapa menit. Anggaran tunggu serverless dipotong hingga di
// bawah maxDuration function (60 detik, lihat api/analyze.js) supaya run yang belum selesai
// sempat dicatat dan dilanjutkan pada penarikan berikutnya, bukan dipotong di tengah jalan.
const serverlessBudgetMs = 45000;
const apifyWaitMs = () => {
  const configured = Number(process.env.APIFY_WAIT_MS);
  const value = Number.isFinite(configured) && configured > 0 ? configured : 120000;
  return Math.min(value, serverlessBudgetMs);
};

let cache = null;
let running = false;
// Kegagalan tulis terakhir ikut dikirim ke antarmuka: data sesi masih tampil di memori,
// tetapi riwayat tidak akan bertahan setelah instance serverless berganti.
let storageWarning = null;

export const isRunning = () => running;

async function readStored() {
  try { return migrateStore(JSON.parse(await readFile(storagePath(), 'utf8'))); }
  catch (error) {
    // Belum ada berkas memang keadaan normal instance baru. Berkas yang terpotong, rusak, atau
    // terbaca sebagian BUKAN keadaan kosong: bila dianggap kosong, penulisan berikutnya akan
    // menimpa data nyata dengan dataset awal.
    if (error.code === 'ENOENT') return null;
    throw new Error(`data_unreadable: berkas data tidak dapat dibaca (${error.message}); penyimpanan dihentikan agar isi berkas tidak ditimpa`);
  }
}

// rename() di Windows dan beberapa berkas sistem sementara sering gagal sesaat
// (EBUSY/EPERM/EACCES) ketika antivirus atau indexer masih memegang berkas target.
async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(from, to); return; }
    catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

// Ditulis ke berkas sementara lalu dipindahkan agar pembaca berikutnya tidak pernah melihat
// berkas setengah tertulis, dan kegagalan dilaporkan, tidak ditelan diam-diam.
// Satu instance dapat menangani beberapa permintaan sekaligus: antrean membuat setiap pemindahan
// selesai sebelum yang berikutnya mulai, dan nama sementara yang unik membuat dua penulisan tidak
// saling menimpa — berkas data yang tidak dapat dibaca ulang berarti seluruh ulasan hilang.
let writeQueue = Promise.resolve();

function writeStored(store) {
  const task = writeQueue.then(() => writeOnce(store));
  writeQueue = task.catch(() => {});
  return task;
}

async function writeOnce(store) {
  const path = storagePath();
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8');
    await renameWithRetry(temporary, path);
    storageWarning = null;
  } catch (error) {
    storageWarning = `Data berhasil dibaca dan dihitung, tetapi belum sempat disimpan ke ${path}: ${error.message}. Instance baru akan memulai dari berkas yang ada.`;
    console.error('[dashboard-store] gagal menyimpan data:', error.message);
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function datasetTarget(store, id) {
  // Dataset peninggalan berkas lama dapat tidak memiliki entri project; labelnya dinilai
  // dengan aturan bawaan, bukan membuat project asing muncul secara diam-diam.
  return findProject(store, id) ? safeProjectTarget(store, id) : null;
}

function readyDataset(dataset, target = null) {
  // Label otomatis dihitung ulang setiap kali data dibaca, sehingga perbaikan aturan langsung
  // berlaku pada baris yang sudah tersimpan, di semua project.
  return {
    ...dataset,
    reviews: withAbsa(reclassifyDerived(dataset.reviews, target)),
    sources: overlayConfiguration(dataset.sources, channelConfigurations(process.env, target ?? defaultTarget)),
  };
}

// Status konfigurasi hanya menimpa hasil baca pertama; hasil penarikan yang baru disimpan
// dikembalikan apa adanya agar kanal yang barusan berhasil tidak kembali dibaca "perlu konfigurasi".
function readyStore(base) {
  return { ...base, datasets: Object.fromEntries(Object.entries(base.datasets).map(([id, dataset]) => [id, readyDataset(dataset, datasetTarget(base, id))])) };
}

// Dua permintaan dapat tiba bersamaan pada instance yang sama. Tanpa gantungan ini, dua
// addProject paralel sama-sama membaca store kosong lalu saling menimpa saat menulis: satu
// project hilang tanpa pesan. Rantai janji membuat baca-modifikasi-tulis berjalan bergiliran.
let storeChain = Promise.resolve();
let loading = null;

function loadStore() {
  if (cache) return Promise.resolve(cache);
  if (!loading) loading = (async () => {
    const base = readyStore((await readStored()) ?? initialStore());
    cache = base;
    return base;
  })().finally(() => { loading = null; });
  return loading;
}

// Dijalankan berurutan; setiap aksi melihat store akhir dari aksi sebelumnya, dan hanya hasil
// yang benar-benar tertulis yang menjadi state berikutnya.
function serialized(task) {
  const run = storeChain.then(task);
  storeChain = run.then(() => undefined, () => undefined);
  return run;
}

// Ringkasan project selalu ikut dikirim agar antarmuka dapat menampilkan jumlah project
// dan pemilih project tanpa permintaan tambahan.
async function view(project) {
  const store = await loadStore();
  const id = resolveProjectId(store, project);
  // Tanpa project, tidak ada dataset maupun target: antarmuka menampilkan layar awal, bukan angka nol.
  return {
    ...(id ? datasetFor(store, id) : emptyView()),
    projects: projectList(store),
    activeProject: id,
    target: id ? safeProjectTarget(store, id) : null,
    running,
    storageWarning,
  };
}

export async function snapshot({ project } = {}) { return view(project); }

export async function listProjects() {
  const store = await loadStore();
  return { projects: projectList(store), activeProject: store.activeProject };
}

// Penemuan identitas memakai dua sumber gratis (iTunes Search dan halaman pencarian Google Play)
// dan tidak menulis apa pun: hasilnya hanya kandidat yang harus dikonfirmasi pengguna.
export async function discover({ entity, fetcher = fetch }) {
  const entityName = String(entity || '').trim();
  if (entityName.length < 2) throw new Error('project_entity: nama aplikasi minimal dua karakter');
  return discoverTarget({ entityName, fetcher });
}

// Membuat project baru dari hasil penemuan yang sudah dikonfirmasi, atau dari ID toko yang
// diisi manual. Dataset project baru selalu dimulai kosong: aplikasi tidak mengirim data contoh,
// jadi seluruh angka berasal dari penarikan yang dijalankan pemiliknya.
export function addProject({ name, entity, discovery, playAppId, appleAppId }) {
  // Ditolak segera bila penarikan sedang berjalan: tanpa pemeriksaan di luar antrean ini,
  // permintaan kedua hanya mengantri dan baru gagal setelah yang pertama selesai.
  if (running) throw new Error('busy');
  return serialized(async () => {
  if (running) throw new Error('busy');
  const store = await loadStore();
  const target = discovery
    ? targetFromDiscovery({ discovery, name, id: projectIdFrom(name || entity) })
    : normalizeTarget({ name, entityName: entity, playAppId, appleAppId });
  const project = createProject({ name: name || entity, entity, target });
  if (findProject(store, project.id)) throw new Error(`project_exists: nama itu sudah dipakai project ${project.id}`);
  // Dataset yatim tidak boleh ditimpa: hanya penghapusan yang disengaja yang boleh membuang baris.
  if ((store.datasets[project.id]?.reviews?.length || 0) > 0)
    throw new Error('project_data_exists: data lama dengan nama itu masih tersimpan, pakai nama lain');
  store.projects.push(project);
  store.datasets[project.id] = readyDataset(emptyDataset(), projectTarget(store, project.id));
  store.activeProject = project.id;
  cache = store;
  await writeStored(store);
  return view(project.id);
  });
}

export function activateProject(project) {
  if (running) throw new Error('busy');
  return serialized(async () => {
  if (running) throw new Error('busy');
  const store = await loadStore();
  const id = resolveProjectId(store, project);
  store.activeProject = id;
  await writeStored(store);
  return view(id);
  });
}

// Mengganti nama project tanpa menyentuh dataset maupun identitas tokonya.
export function editProject({ project, name }) {
  if (running) throw new Error('busy');
  return serialized(async () => {
  if (running) throw new Error('busy');
  const store = await loadStore();
  const id = strictProjectId(store, project);
  renameProject(store, id, name);
  cache = store;
  await writeStored(store);
  return view(id);
  });
}

// Menghapus project dan seluruh datasetnya. Project aktif berpindah ke project lain yang masih ada;
// bila project terakhir dihapus, penyimpanan kembali kosong. Dataset project yang tidak disebut
// tidak tersentuh.
export function dropProject(project) {
  if (running) throw new Error('busy');
  return serialized(async () => {
  if (running) throw new Error('busy');
  const store = await loadStore();
  const id = strictProjectId(store, project);
  removeProject(store, id);
  cache = store;
  await writeStored(store);
  return view(undefined);
  });
}

// Simpan atau reset label sentimen buatan analis. Aksi ini menulis berkas data dengan antrean
// yang sama seperti penarikan, sehingga label tidak dapat tertimpa salinan pull yang sedang
// berjalan. Hanya baris yang lolos penyaring relevansi yang boleh dilabeli.
export function labelReview({ project, platform, id, sentiment, action = 'set' } = {}) {
  if (running) throw new Error('busy');
  return serialized(async () => {
    if (running) throw new Error('busy');
    const store = await loadStore();
    const projectId = strictProjectId(store, project);
    const dataset = datasetFor(store, projectId);
    const target = projectTarget(store, projectId);
    const result = applyManualLabel(dataset.reviews, { platform, id, sentiment, action }, new Date().toISOString(), target);
    const next = {
      ...store,
      datasets: { ...store.datasets, [projectId]: { ...dataset, reviews: withAbsa(result.rows) } },
    };
    cache = next;
    await writeStored(next);
    return { ...(await view(projectId)), labelAction: result.action, labelId: `${platform}|${id}` };
  });
}

function runStep(project, produce, { recordRun }) {
  // Kunci ditetapkan SEBELUM masuk antrean. Bila tidak, dua penarikan yang tiba pada tick yang
  // sama sama-sama melihat "longgar" lalu yang kedua hanya mengantri dan akhirnya berjalan juga,
  // saling menimpa dataset yang sama.
  if (running) throw new Error('busy');
  running = true;
  return serialized(async () => {
  const startedAt = new Date().toISOString();
  try {
    const store = await loadStore();
    const id = resolveProjectId(store, project);
    // Tanpa project tidak ada yang bisa ditarik: target toko berasal dari project, jadi menaruh
    // ulasan di project mana pun akan menjadi tebakan.
    if (!id) throw new Error('project_required: belum ada project — buat project lebih dulu sebelum menarik data');
    const previous = datasetFor(store, id);
    const target = projectTarget(store, id);
    const results = await produce(previous, { resume: resumeMap(previous), apifyWaitMs: apifyWaitMs(), target });
    const finishedAt = new Date().toISOString();
    setDataset(store, id, buildDataset({ previous, results, startedAt, finishedAt, channelConfig: channelConfigurations(process.env, target), recordRun, target }), { pulledAt: recordRun ? finishedAt : undefined });
    cache = store;
    await writeStored(store);
    return view(id);
  } finally {
    running = false;
  }
  });
}

export async function pull({ project, collector = collectOnline } = {}) {
  return runStep(project, (previous, options) => collector(options), { recordRun: true });
}

// Satu kanal per permintaan. Antarmuka memakainya untuk menampilkan progres nyata per
// platform, dan function serverless selesai dalam waktu singkat tanpa menahan 3 menit.
export async function pullPlatform(id, { project, collect = collectPlatform } = {}) {
  return runStep(project, async (previous, options) => {
    const result = await collect(id, options);
    if (!result) throw new Error('unknown-platform');
    return [result];
  }, { recordRun: false });
}

// Menutup batch penarikan bertahap dan mencatat satu entri riwayat. Dipisahkan agar
// kegagalan satu kanal terakhir tidak membuat seluruh penarikan tanpa catatan.
export async function finishPull({ project } = {}) {
  return runStep(project, async () => [], { recordRun: true });
}
