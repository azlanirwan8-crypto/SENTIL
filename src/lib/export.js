import { sanitizeFilename } from './format.js';

export function exportWorkspace(workspace, dataset) {
  if (!workspace || !dataset) return false;
  const payload = {
    format: 'sentil/workspace-v1',
    exportedAt: new Date().toISOString(),
    note: 'Every review row that this workspace read, with its text verbatim and the analysis fields shown on screen, plus the corpus model and channel coverage. No sample was dropped or added. Derived columns used only inside the engine (topic triggers, listing terms, per-line language) stay in the database and are not part of this file.',
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
  anchor.download = `sentil-${sanitizeFilename(workspace.label)}-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
