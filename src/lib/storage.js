export const META_KEY = 'si.workspaces.v1';
export const ACTIVE_KEY = 'si.active.v1';
export const DATASET_PREFIX = 'si.dataset.v1.';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

export function createWorkspaceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRaw(key) {
  try {
    return { value: window.localStorage.getItem(key), error: null };
  } catch {
    return {
      value: null,
      error: 'Penyimpanan peramban tidak dapat diakses. Analisis tetap berjalan di memori, tetapi tidak akan bertahan setelah halaman ditutup.',
    };
  }
}

function writeRaw(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return { ok: true, error: null };
  } catch (error) {
    const quota = error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
    return {
      ok: false,
      error: quota
        ? 'Ruang penyimpanan peramban penuh. Data terbaru tetap ada di memori sesi ini, tetapi belum tersimpan. Ekspor JSON agar tidak hilang.'
        : 'Data tidak dapat disimpan di peramban ini. Data tetap ada di memori sesi ini; ekspor JSON agar tidak hilang.',
    };
  }
}

function normalizeWorkspace(entry) {
  if (!isObject(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.label) || !isNonEmptyString(entry.entity)) return null;
  return {
    id: String(entry.id),
    label: String(entry.label),
    entity: String(entry.entity),
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
    lastSyncedAt: typeof entry.lastSyncedAt === 'string' ? entry.lastSyncedAt : null,
    stores: isObject(entry.stores) ? entry.stores : {},
    snapshot: isObject(entry.snapshot) ? entry.snapshot : null,
  };
}

export function readWorkspaces() {
  const raw = readRaw(META_KEY);
  if (raw.error) return { workspaces: [], error: raw.error };
  if (!raw.value) return { workspaces: [], error: null };
  try {
    const parsed = JSON.parse(raw.value);
    if (!Array.isArray(parsed)) {
      return { workspaces: [], error: 'Metadata analisis tidak berbentuk daftar. Tidak ada data yang dihapus otomatis; kamu dapat mengekspor atau memulai analisis baru.' };
    }
    const seen = new Set();
    const workspaces = [];
    let dropped = 0;
    for (const entry of parsed) {
      const normalized = normalizeWorkspace(entry);
      if (!normalized || seen.has(normalized.id)) {
        dropped += 1;
        continue;
      }
      seen.add(normalized.id);
      workspaces.push(normalized);
    }
    return {
      workspaces,
      error: dropped ? `${dropped} entri metadata tidak lengkap dan tidak dimuat. Entri lain dipertahankan.` : null,
    };
  } catch {
    return { workspaces: [], error: 'Metadata analisis di peramban rusak dan tidak dapat dibaca. Tidak ada data yang dihapus otomatis; kamu dapat memulai analisis baru.' };
  }
}

export function readActiveId() {
  const raw = readRaw(ACTIVE_KEY);
  return raw.value || null;
}

export function persistActiveId(id) {
  if (!id) {
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: null };
    }
  }
  return writeRaw(ACTIVE_KEY, String(id));
}

export function persistWorkspaces(workspaces) {
  return writeRaw(META_KEY, JSON.stringify(workspaces));
}

export function readDataset(workspaceId) {
  if (!workspaceId) return { dataset: null, error: null };
  const raw = readRaw(`${DATASET_PREFIX}${workspaceId}`);
  if (raw.error) return { dataset: null, error: raw.error };
  if (!raw.value) return { dataset: null, error: null };
  try {
    const parsed = JSON.parse(raw.value);
    if (!isObject(parsed) || !Array.isArray(parsed.reviews) || !isObject(parsed.model)) {
      return { dataset: null, error: 'Isi data analisis ini tidak lengkap. Tarik ulang data untuk memulihkannya.' };
    }
    return { dataset: parsed, error: null };
  } catch {
    return { dataset: null, error: 'Isi data analisis ini rusak dan tidak dapat dibaca. Tarik ulang data untuk memulihkannya.' };
  }
}

export function persistDataset(workspaceId, dataset) {
  if (!workspaceId) return { ok: false, error: 'Workspace tidak dikenal.' };
  return writeRaw(`${DATASET_PREFIX}${workspaceId}`, JSON.stringify(dataset));
}

export function removeDataset(workspaceId) {
  if (!workspaceId) return;
  try {
    window.localStorage.removeItem(`${DATASET_PREFIX}${workspaceId}`);
  } catch {
    // Penghapusan metadata sudah cukup untuk menyembunyikan workspace; sisa data yatim tidak berbahaya.
  }
}
