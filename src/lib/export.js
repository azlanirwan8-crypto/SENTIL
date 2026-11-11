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

const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function reviewsCsv(reviews) {
  const headers = [
    'date', 'source', 'author', 'title', 'text', 'rating', 'sentiment', 'human_label',
    'gemini_sentiment', 'gemini_confidence', 'gemini_reason', 'gemini_model', 'score', 'topics', 'source_url',
  ];
  const rows = Array.isArray(reviews) ? reviews : [];
  return [
    headers.map(csvCell).join(','),
    ...rows.map(review => [
      review.publishedAt || review.date,
      review.platform,
      review.author,
      review.title,
      review.text,
      review.rating,
      review.analysis?.sentiment,
      review.humanLabel,
      review.socialClassification?.label,
      review.socialClassification?.confidence,
      review.socialClassification?.reason,
      review.socialClassification?.model,
      review.analysis?.score,
      Array.isArray(review.analysis?.topicNames) ? review.analysis.topicNames.join('; ') : '',
      review.sourceUrl,
    ].map(csvCell).join(',')),
  ].join('\r\n');
}

export function exportReviewsCsv(workspace, reviews) {
  if (!workspace || !Array.isArray(reviews)) return false;
  const blob = new Blob([`\uFEFF${reviewsCsv(reviews)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sentil-reviews-${sanitizeFilename(workspace.label)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
