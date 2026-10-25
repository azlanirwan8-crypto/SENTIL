// Simpanan project analisis. Satu berkas data dapat memuat beberapa project; setiap project
// punya dataset sendiri (ulasan, status kanal, riwayat) sehingga angka sebuah project tidak pernah
// bercampur dengan project lain. Berkas lama dengan satu dataset di atas tetap dibaca apa adanya:
// isinya dipindahkan utuh menjadi project bawaan, tanpa mengubah satu baris ulasan pun.
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
// ID project hanya boleh berisi huruf kecil, angka, dan tanda hubung karena dipakai sebagai
// kunci objek dan bagian dari alamat API.
export const projectIdFrom = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

export function createProject({ id, name, entity, target, playAppId, appleAppId, now = nowIso() }) {
  const entityName = String(entity || '').trim();
  const projectName = String(name || '').trim();
  if (projectName.length < 2) throw new Error('project_name: nama project minimal dua karakter');
  if (entityName.length < 2) throw new Error('project_entity: nama entitas minimal dua karakter');
  const resolved = target ?? normalizeTarget({ name: projectName, entityName, playAppId, appleAppId });
  if (!resolved.play?.appId && !resolved.appstore?.appId) throw new Error('project_target: pilih minimal satu identitas toko (Google Play atau App Store) agar penarikan tidak salah sasaran');
  const projectId = projectIdFrom(id || projectName || resolved.id);
  if (!projectId) throw new Error('project_id: nama project tidak menghasilkan ID yang dapat dipakai');
  return { id: projectId, name: projectName, entity: entityName, target: { ...resolved, id: projectId }, createdAt: now, updatedAt: now, lastPulledAt: null };
}

// Project bawaan adalah aplikasi yang selama ini dianalisis; datanya sudah ada, jadi project ini
// tidak dibuat lewat alur penemuan identitas.
export function defaultProject() {
  return {
    id: defaultProjectId, name: 'wondr merchant by BNI', entity: defaultTarget.entityName,
    target: defaultTarget, createdAt: null, updatedAt: null, lastPulledAt: null, builtIn: true,
  };
}

export function initialStore() {
  return {
    version: storeVersion,
    projects: [defaultProject()],
    activeProject: defaultProjectId,
    datasets: { [defaultProjectId]: initialDataset() },
  };
}

// Pemindahan berkas lama ke bentuk multi-project dilakukan sekali saat dibaca. Semua kunci dataset
// lama disalin utuh; tidak ada penyaringan, penomoran ulang, atau penghapusan baris. Dataset tanpa
// entri project juga tetap disimpan (tidak dapat dibaca ulang oleh project mana pun, tetapi tidak
// hilang) karena menghapus data ulasan bukan cara yang sah untuk menyembuhkan berkas.
export function migrateStore(saved) {
  if (saved && saved.version === storeVersion && Array.isArray(saved.projects)) {
    const datasets = saved.datasets && typeof saved.datasets === 'object' ? saved.datasets : {};
    const known = new Set(saved.projects.map(project => project.id));
    for (const project of saved.projects) if (!datasets[project.id]) datasets[project.id] = emptyDataset();
    const projects = saved.projects.some(project => project.id === defaultProjectId) ? saved.projects : [defaultProject(), ...saved.projects];
    const activeProject = known.has(saved.activeProject) ? saved.activeProject : defaultProjectId;
    return { ...saved, version: storeVersion, projects, datasets, activeProject };
  }
  if (saved && Array.isArray(saved.reviews) && Array.isArray(saved.sources) && Array.isArray(saved.runs)) {
    const dataset = { reviews: saved.reviews, sources: saved.sources, runs: saved.runs, lastRun: saved.lastRun ?? null, batch: saved.batch ?? null };
    return { version: storeVersion, projects: [defaultProject()], activeProject: defaultProjectId, datasets: { [defaultProjectId]: dataset } };
  }
  return initialStore();
}

export function projectList(store) {
  return store.projects.map(project => {
    const dataset = store.datasets[project.id];
    const last = dataset?.runs?.at(-1) || null;
    return {
      id: project.id, name: project.name, entity: project.entity, builtIn: Boolean(project.builtIn),
      createdAt: project.createdAt, updatedAt: project.updatedAt,
      lastPulledAt: project.lastPulledAt || last?.finishedAt || null,
      reviewCount: Array.isArray(dataset?.reviews) ? dataset.reviews.length : 0,
      stores: [project.target?.play?.appId ? `Google Play ${project.target.play.appId}` : null,
        project.target?.appstore?.appId ? `App Store ${project.target.appstore.appId}` : null].filter(Boolean).join(' · ') || 'identitas toko belum lengkap',
    };
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

export function datasetFor(store, id) { return store.datasets[id]; }

export function setDataset(store, id, dataset, { pulledAt } = {}) {
  store.datasets[id] = dataset;
  const project = findProject(store, id);
  if (project && pulledAt) { project.lastPulledAt = pulledAt; project.updatedAt = pulledAt; }
  return dataset;
}

// Target sebuah project. Project bawaan memakai target yang sudah teruji; project lain wajib
// mempunyai setidaknya satu ID toko agar penarikan tidak salah sasaran.
export function projectTarget(store, id) {
  const project = findProject(store, id);
  if (!project) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  if (project.builtIn) return defaultTarget;
  return normalizeTarget({ ...project.target, entityName: project.target?.entityName || project.entity });
}

// Aksi menghancurkan data tidak boleh memakai project aktif sebagai nilai bawaan: permintaan
// tanpa ID harus ditolak, bukan menghapus dataset yang sedang dibuka pengguna.
export function requiredProjectId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error('project_required: tindakan ini wajib menyertakan ID project secara eksplisit');
  return id;
}

// Menghapus project beserta datasetnya. Ini satu-satunya jalur yang membuang baris ulasan, jadi
// project bawaan (data awal aplikasi yang selama ini dianalisis) ditolak dan pemanggil wajib
// menyertakan ID project secara eksplisit. Project aktif dipindahkan kembali ke project bawaan.
export function removeProject(store, id) {
  const project = findProject(store, id);
  if (!project) throw new Error('project_unknown: project yang diminta tidak terdaftar');
  if (project.builtIn) throw new Error('project_builtIn: project bawaan tidak dapat dihapus');
  store.projects = store.projects.filter(item => item.id !== id);
  delete store.datasets[id];
  if (store.activeProject === id) store.activeProject = defaultProjectId;
  return project;
}
