import { fetchDataset, fetchState, putWorkspace, removeWorkspace } from './api.js';

// Workspace dan snapshotnya hidup di database server. Yang tinggal di peramban hanya
// satu nilai kecil: workspace mana yang sedang dibuka.
const ACTIVE_KEY = 'si.active.v1';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

export function createWorkspaceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
    channels: isObject(entry.channels) ? entry.channels : {},
    snapshot: isObject(entry.snapshot) ? entry.snapshot : null,
  };
}

export function readActiveId() {
  try {
    return window.localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function persistActiveId(id) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, String(id));
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Tanpa penyimpanan peramban sekalipun aplikasi tetap berfungsi; ini hanya kenyamanan.
  }
}

export async function loadState() {
  try {
    const response = await fetchState();
    const seen = new Set();
    const workspaces = [];
    let dropped = 0;
    for (const entry of Array.isArray(response.workspaces) ? response.workspaces : []) {
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
      db: isObject(response.db) ? response.db : null,
      error: dropped ? `${dropped} workspace rows were incomplete and were skipped.` : null,
    };
  } catch (cause) {
    // Aksi state tidak dikenal = halaman lebih baru daripada server yang menjawab. Pesan
    // mentah dari penolakan itu bukan masalah penyimpanan, jadi jangan disamarkan begitu.
    if (cause?.code === 'action_invalid' || cause?.code === 'route_not_found') {
      return {
        workspaces: [],
        db: null,
        unreachable: true,
        errorTitle: 'This page and the server behind it are different versions',
        error: 'The page asked the server for the workspace list and the server did not recognise that request. Reload this page first — an open tab keeps the version it was loaded with. If it still appears after reloading, restart the local server (npm start) or redeploy. Nothing was changed and nothing was deleted.',
      };
    }
    return { workspaces: [], db: null, error: cause?.message || 'The analysis server could not be reached.', unreachable: true };
  }
}

export async function loadDataset(workspaceId) {
  if (!workspaceId) return { dataset: null, db: null, error: null };
  try {
    const response = await fetchDataset(workspaceId);
    const dataset = response.dataset;
    if (!isObject(dataset) || !Array.isArray(dataset.reviews) || !isObject(dataset.model)) {
      return { dataset: null, db: isObject(response.db) ? response.db : null, error: null };
    }
    return { dataset, db: isObject(response.db) ? response.db : null, error: null };
  } catch (cause) {
    return { dataset: null, db: null, error: cause?.message || 'The snapshot could not be read from the database.' };
  }
}

export async function saveWorkspace(workspace) {
  if (!workspace?.id) return { saved: false, error: 'The workspace has no identity yet.' };
  try {
    const response = await putWorkspace(workspace);
    return {
      saved: isObject(response.workspace),
      db: isObject(response.db) ? response.db : null,
      error: isObject(response.workspace) ? null : 'The database did not accept this workspace.',
    };
  } catch (cause) {
    return { saved: false, error: cause?.message || 'The database could not be reached.' };
  }
}

export async function deleteWorkspace(workspaceId) {
  if (!workspaceId) return { deleted: false, error: null };
  try {
    const response = await removeWorkspace(workspaceId);
    return {
      deleted: response.deleted === true,
      error: response.deleted === true ? null : 'The database did not confirm the deletion.',
    };
  } catch (cause) {
    return { deleted: false, error: cause?.message || 'The database could not be reached.' };
  }
}
