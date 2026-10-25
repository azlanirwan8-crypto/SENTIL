import { sanitizeFilename } from './format.js';

export function exportWorkspace(workspace, dataset) {
  if (!workspace || !dataset) return false;
  const payload = {
    format: 'sentiment-intelligence/workspace-v1',
    exportedAt: new Date().toISOString(),
    note: 'Ekspor lengkap satu workspace: metadata, seluruh ulasan yang terbaca, hasil analisis per ulasan, model korpus, dan cakupan kanal. Tidak ada sampel yang dibuang atau ditambahkan.',
    workspace: {
      id: workspace.id,
      label: workspace.label,
      entity: workspace.entity,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      lastSyncedAt: workspace.lastSyncedAt,
      stores: workspace.stores,
    },
    dataset,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const stamp = (dataset.fetchedAt || new Date().toISOString()).slice(0, 10);
  anchor.download = `sentiment-intelligence-${sanitizeFilename(workspace.label)}-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
