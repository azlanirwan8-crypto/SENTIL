// Simpanan project analisis. Satu berkas data dapat memuat beberapa project; setiap project
// punya dataset sendiri (ulasan, status kanal, riwayat) sehingga angka sebuah project tidak pernah
// bercampur dengan project lain. Berkas lama dengan satu dataset di atas tetap dibaca apa adanya:
// isinya dipindahkan utuh menjadi project biasa yang boleh dihapus pemiliknya, tanpa mengubah
// satu baris ulasan pun.
import { defaultTarget, normalizeTarget } from './target.mjs';
import { initialDataset } from './dashboard-core.mjs';

export const storeVersion = 2;
export const defaultProjectId = defaultTarget.id;

// Dataset project baru: kerangka status kanal yang sama dengan dataset awal, tetapi tanpa
// satu baris ulasan pun. Semua kanal memakai status "belum diambil" dengan keterangan yang
// jujur, supaya angka nol pada project baru tidak terbaca sebagai "tidak ada keluhan".
export const freshSourceStatus = 'belum_ditarik';

export function emptyDataset() {
  const base = initialDataset();
  return {
    ...base,
    reviews: [],
    runs: [],
    lastRun: null,
    batch: null,
    sources: base.sources.map(source => ({
      id: source.id, status: freshSourceStatus, fetched: 0,
      message: 'Project baru belum pernah ditarik. Tekan Tarik Analisis untuk mengambil data dari kanal yang terhubung.',
    })),
  };
}

const nowIso = () => new Date().toISOString();
// Dataset yang dibaca dari berkas harus membawa tiga kunci array. Berkas hasil potongan atau
// suntingan tangan dapat kehilangan salah satunya, dan pemetakan berikutnya akan melempar
// TypeError saat awal — dasbor mati total tanpa pesan. Kunci yang HILANG dilengkapi; kunci yang
// ADA tetapi bentuknya salah tidak boleh diganti daftar kosong, karena itu akan membuang baris
// ulasan pada penulisan berikutnya.
function repairDataset(value, id) {
  const base = value && typeof value === 'object' ? value : {};
  for (const key of ['reviews', 'sources', 'runs']) {
    if (base[key] !== undefined && !Array.isArray(base[key]))
      throw new Error(`data_unreadable: dataset project "${id}" memiliki kunci ${key} yang bukan daftar; penulisan dihentikan agar isinya tidak diganti`);
  }
  return {
    ...base,
    reviews: Array.isArray(base.reviews) ? base.reviews : [],
    sources: Array.isArray(base.sources) ? base.sources : [],
    runs: Array.isArray(base.runs) ? base.runs : [],
    lastRun: base.lastRun ?? null,
    batch: base.batch ?? null,
  };
}
// ID project hanya boleh berisi huruf kecil, angka, dan tanda hubung karena dipakai sebagai
// kunci objek dan bagian dari alamat API.
export const projectIdFrom = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

export function createProject({ id, name, entity, target, playAppId, appleAppId, now = nowIso() }) {
  const entityName = String(entity || '').trim();
  const projectName = String(name || '').trim();
  if (projectName.length < 2) throw new Error('project_name: nama project minimal dua karakter');
  if (entityName.length < 2) throw new Error('project_entity: nama aplikasi minimal dua karakter');
  const resolved = target ?? normalizeTarget({ name: projectName, entityName, playAppId, appleAppId });
  if (!resolved.play?.appId && !resolved.appstore?.appId) throw new Error('project_target: pilih minimal satu identitas toko (Google Play atau App Store) agar penarikan tidak salah sasaran');
  const projectId = projectIdFrom(id || projectName || resolved.id);
  if (!projectId) throw new Error('project_id: nama project tidak menghasilkan ID yang dapat dipakai');
  return { id: projectId, name: projectName, entity: entityName, target: { ...resolved, id: projectId }, createdAt: now, updatedAt: now, lastPulledAt: null };
}

// Tidak ada project bawaan. Aplikasi mulai kosong dan project pertama dibuat sendiri oleh
// pengguna lewat penemuan identitas, sehingga seluruh angka berasal dari penarikan yang ia
// jalankan — bukan dari data yang ikut terkirim dalam berkas aplikasi.
export function initialStore() {
  return { version: storeVersion, projects: [], activeProject: '', datasets: {} };
}

// Berkas lama (v1) hanya memuat satu dataset. Isinya dipindah utuh menjadi project biasa —
// identitasnya memang aplikasi yang selama ini dianalisis — sehingga pemiliknya bebas
// menghapusnya tanpa ada satu baris ulasan pun yang hilang diam-diam.
export function legacyProject(now = nowIso()) {
  return createProject({ id: defaultProjectId, name: defaultTarget.name, entity: defaultTarget.entityName, target: defaultTarget, now });
}

// Pemindahan berkas lama ke bentuk multi-project dilakukan sekali saat dibaca. Semua kunci dataset
// lama disalin utuh; tidak ada penyaringan, penomoran ulang, atau penghapusan baris. Dataset tanpa
// entri project juga tetap disimpan (tidak dapat dibaca ulang oleh project mana pun, tetapi tidak
// hilang) karena menghapus data ulasan bukan cara yang sah untuk menyembuhkan berkas.
// Berkas yang berbentuk v2 tetapi kehilangan daftar project/datasetnya BERBAHAYA bila dianggap
// kosong: penulisan berikutnya akan menimpa berkas berisi ulasan dengan penyimpanan kosong.
export function migrateStore(saved) {
  if (!saved || typeof saved !== 'object') return initialStore();
  if (saved.version === storeVersion) {
    // Daftar project yang hilang berarti dataset berisi ulasan tidak lagi milik siapa pun: bila
    // dianggap kosong, penulisan berikutnya menimpa berkas itu dengan penyimpanan kosong. Kunci
    // datasets yang belum ada sama sekali tidak berbahaya (tidak ada baris yang bisa hilang).
    if (!Array.isArray(saved.projects))
      throw new Error('data_unreadable: berkas data versi 2 kehilangan daftar project; isi berkas tidak diganti menjadi penyimpanan kosong');
    if (saved.datasets !== undefined && (typeof saved.datasets !== 'object' || saved.datasets === null || Array.isArray(saved.datasets)))
      throw new Error('data_unreadable: kunci datasets pada berkas versi 2 bukan daftar berisi; penulisan dihentikan agar isinya tidak diganti');
    // 'builtIn' adalah sifat lama; project hasil baca berkas selalu dapat dihapus pemiliknya.
    // 'entity' yang hilang dipulihkan dari nama project: tanpanya projectTarget menolak dan
    // seluruh /api.data gagal, sehingga pemilik tidak bisa menghapus project rusak itu.
    const projects = saved.projects.map(({ builtIn, ...project }) => ({ ...project, entity: project.entity || project.name }));
    const known = new Set(projects.map(project => project.id));
    const datasets = Object.fromEntries(Object.entries(saved.datasets ?? {})
      .map(([id, value]) => [id, repairDataset(value, id)]));
    for (const project of projects) if (!datasets[project.id]) datasets[project.id] = emptyDataset();
    const activeProject = known.has(saved.activeProject) ? saved.activeProject : (projects[0]?.id || '');
    return { ...saved, version: storeVersion, projects, datasets, activeProject };
  }
  if (Array.isArray(saved.reviews) && Array.isArray(saved.sources) && Array.isArray(saved.runs)) {
    const project = legacyProject();
    const dataset = { reviews: saved.reviews, sources: saved.sources, runs: saved.runs, lastRun: saved.lastRun ?? null, batch: saved.batch ?? null };
    return { version: storeVersion, projects: [project], activeProject: project.id, datasets: { [project.id]: dataset } };
  }
  // Objek tak dikenal yang berisi data juga tidak boleh dianggap penyimpanan baru.
  if (Object.keys(saved).length)
    throw new Error('data_unreadable: bentuk berkas data tidak dikenal dan berisi data; isi berkas tidak diganti menjadi penyimpanan kosong');
  return initialStore();
}

export function projectList(store) {
  return store.projects.map(project => {
    const dataset = store.datasets[project.id];
    const last = dataset?.runs?.at(-1) || null;
    return {
      id: project.id, name: project.name, entity: project.entity,
      createdAt: project.createdAt, updatedAt: project.updatedAt,
      lastPulledAt: project.lastPulledAt || last?.finishedAt || null,
      reviewCount: Array.isArray(dataset?.reviews) ? dataset.reviews.length : 0,
      stores: [project.target?.play?.appId ? `Google Play ${project.target.play.appId}` : null,
        project.target?.appstore?.appId ? `App Store ${project.target.appstore.appId}` : null].filter(Boolean).join(' · ') || 'identitas toko belum lengkap',
    };
  // Urutan stabil: project terlama di atas, lalu nama. Nama sengaja bukan penentu utama supaya
  // mengganti nama project tidak memindahkan posisinya di pemilih.
  }).sort((a, b) => (a.createdAt || '9999').localeCompare(b.createdAt || '9999') || a.name.localeCompare(b.name));
}

export function findProject(store, id) {
  return store.projects.find(project => project.id === id) || null;
}

export function resolveProjectId(store, requested) {
  const id = requested ? projectIdFrom(requested) : '';
  if (id && findProject(store, id)) return id;
  if (id) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  return store.activeProject;
}

export function datasetFor(store, id) { return id ? store.datasets[id] : undefined; }

// Dataset untuk keadaan "belum ada project": kosong dan tanpa daftar kanal, karena kanal mana pun
// hanya punya arti setelah sebuah project memilih identitas tokonya.
export const emptyView = () => ({ reviews: [], sources: [], runs: [], lastRun: null, batch: null });

export function setDataset(store, id, dataset, { pulledAt } = {}) {
  store.datasets[id] = dataset;
  const project = findProject(store, id);
  if (project && pulledAt) { project.lastPulledAt = pulledAt; project.updatedAt = pulledAt; }
  return dataset;
}

// Target sebuah project. Setiap project wajib mempunyai setidaknya satu ID toko agar
// penarikan tidak salah sasaran — tidak ada lagi target diam-diam dari aplikasi bawaan.
export function projectTarget(store, id) {
  const project = findProject(store, id);
  if (!project) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  return normalizeTarget({ ...project.target, entityName: project.target?.entityName || project.entity });
}

// Versi lunak untuk pembacaan: satu entri rusak (misalnya berkas hasil suntingan tangan) tidak boleh
// membuat seluruh /api.data gagal, karena itu mengunci pemilik dari menu Kelola — satu-satunya jalan
// menghapus entri rusak tersebut. Penarikan data tetap memakai projectTarget yang keras.
export function safeProjectTarget(store, id) {
  try { return projectTarget(store, id); } catch { return null; }
}

// Aksi menghancurkan data tidak boleh memakai project aktif sebagai nilai bawaan: permintaan
// tanpa ID harus ditolak, bukan menghapus dataset yang sedang dibuka pengguna.
export function requiredProjectId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error('project_required: tindakan ini wajib menyertakan ID project secara eksplisit');
  return id;
}

// Penghapus dan pengganti nama memakai pemeriksa ketat ini, bukan resolveProjectId: nilai yang
// tidak menghasilkan ID sah (misalnya "###") akan jatuh kembali ke project aktif dan justru
// menghapus dataset yang sedang dibuka pengguna.
export function strictProjectId(store, value) {
  const id = projectIdFrom(requiredProjectId(value));
  if (!id) throw new Error('project_unknown: ID project tidak menghasilkan nama yang dapat dipakai');
  if (!findProject(store, id)) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  return id;
}

// Mengganti nama tampilan sebuah project. ID, entitas, dan identitas toko tidak ikut berubah:
// nama hanyalah label, sedangkan data yang tersimpan terikat pada identitas toko.
export function renameProject(store, id, name) {
  const project = findProject(store, id);
  if (!project) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  const projectName = String(name || '').trim();
  if (projectName.length < 2) throw new Error('project_name: nama project minimal dua karakter');
  if (projectName.length > 80) throw new Error('project_name: nama project maksimal 80 karakter');
  if (store.projects.some(other => other.id !== project.id && other.name.toLowerCase() === projectName.toLowerCase()))
    throw new Error('project_exists: nama itu sudah dipakai project lain');
  project.name = projectName;
  project.updatedAt = new Date().toISOString();
  return project;
}

// Menghapus project beserta datasetnya. Setiap project boleh dihapus — termasuk project pertama
// yang dipindah dari berkas lama — asalkan ID-nya disebut secara eksplisit. Setelah project
// terakhir hilang, dasbor kembali kosong dan pengguna membuat project baru dari awal.
export function removeProject(store, id) {
  const project = findProject(store, id);
  if (!project) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  store.projects = store.projects.filter(item => item.id !== id);
  delete store.datasets[id];
  if (store.activeProject === id) store.activeProject = store.projects[0]?.id || '';
  return project;
}
