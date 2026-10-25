// Penyimpanan dataset untuk lingkungan serverless (Vercel Functions).
// Disk /tmp hanya bertahan selama instance hidup, jadi state dipegang di memori
// dan ditulis ke DATA_PATH agar penarikan berikutnya tetap memakai riwayat yang sama.
// Berkas yang sama memuat beberapa project; setiap project punya dataset sendiri.
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { collectOnline, collectPlatform, channelConfigurations } from './collectors.mjs';
import { overlayConfiguration, buildDataset, reclassifyDerived, resumeMap } from './dashboard-core.mjs';
import { withAbsa } from './model.js';
import { discoverTarget } from './discovery.mjs';
import { normalizeTarget, targetFromDiscovery } from './target.mjs';
import {
  migrateStore, initialStore, projectList, resolveProjectId, datasetFor, setDataset,
  projectTarget, findProject, createProject, projectIdFrom, emptyDataset, removeProject, requiredProjectId,
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
async function writeStored(store) {
  const path = storagePath();
  const temporary = `${path}.${process.pid}.tmp`;
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
  return findProject(store, id) ? projectTarget(store, id) : null;
}

function readyDataset(dataset, target = null) {
  // Label otomatis dihitung ulang setiap kali data dibaca, sehingga perbaikan aturan langsung
  // berlaku pada baris yang sudah tersimpan, di semua project.
  return {
    ...dataset,
    reviews: withAbsa(reclassifyDerived(dataset.reviews, target)),
    sources: overlayConfiguration(dataset.sources, channelConfigurations()),
  };
}

// Status konfigurasi hanya menimpa hasil baca pertama; hasil penarikan yang baru disimpan
// dikembalikan apa adanya agar kanal yang barusan berhasil tidak kembali dibaca "perlu konfigurasi".
function readyStore(base) {
  return { ...base, datasets: Object.fromEntries(Object.entries(base.datasets).map(([id, dataset]) => [id, readyDataset(dataset, datasetTarget(base, id))])) };
}

async function loadStore() {
  if (!cache) cache = readyStore((await readStored()) ?? initialStore());
  return cache;
}

// Ringkasan project selalu ikut dikirim agar antarmuka dapat menampilkan jumlah project
// dan pemilih project tanpa permintaan tambahan.
async function view(project) {
  const store = await loadStore();
  const id = resolveProjectId(store, project);
  return {
    ...datasetFor(store, id),
    projects: projectList(store),
    activeProject: id,
    target: projectTarget(store, id),
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
  if (entityName.length < 2) throw new Error('project_entity: nama entitas minimal dua karakter');
  return discoverTarget({ entityName, fetcher });
}

// Membuat project baru dari hasil penemuan yang sudah dikonfirmasi, atau dari ID toko yang
// diisi manual. Dataset baru dimulai kosong; data awal hanya milik project bawaan.
export async function addProject({ name, entity, discovery, playAppId, appleAppId }) {
  const store = await loadStore();
  const target = discovery
    ? targetFromDiscovery({ discovery, name, id: projectIdFrom(name || entity) })
    : normalizeTarget({ name, entityName: entity, playAppId, appleAppId });
  const project = createProject({ name: name || entity, entity, target });
  if (findProject(store, project.id)) throw new Error('project_exists: project dengan nama itu sudah ada');
  store.projects.push(project);
  store.datasets[project.id] = readyDataset(emptyDataset(), projectTarget(store, project.id));
  store.activeProject = project.id;
  cache = store;
  await writeStored(store);
  return view(project.id);
}

export async function activateProject(project) {
  const store = await loadStore();
  const id = resolveProjectId(store, project);
  store.activeProject = id;
  await writeStored(store);
  return view(id);
}

// Menghapus project dan seluruh datasetnya. Project bawaan ditolak, dan project aktif
// dikembalikan ke bawaan; dataset project lain tidak tersentuh.
export async function dropProject(project) {
  if (running) throw new Error('busy');
  const store = await loadStore();
  const id = resolveProjectId(store, requiredProjectId(project));
  removeProject(store, id);
  cache = store;
  await writeStored(store);
  return view(undefined);
}

async function runStep(project, produce, { recordRun }) {
  if (running) throw new Error('busy');
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const store = await loadStore();
    const id = resolveProjectId(store, project);
    const previous = datasetFor(store, id);
    const target = projectTarget(store, id);
    const results = await produce(previous, { resume: resumeMap(previous), apifyWaitMs: apifyWaitMs(), target });
    const finishedAt = new Date().toISOString();
    setDataset(store, id, buildDataset({ previous, results, startedAt, finishedAt, channelConfig: channelConfigurations(), recordRun, target }), { pulledAt: recordRun ? finishedAt : undefined });
    cache = store;
    await writeStored(store);
    return view(id);
  } finally {
    running = false;
  }
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
