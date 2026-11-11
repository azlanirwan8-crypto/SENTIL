const PREFIX = 'sentil.sentiment-audit.v1:';
const LABELS = new Set(['positive', 'neutral', 'negative']);

function storageOf(storage) {
  if (storage) return storage;
  if (typeof globalThis.localStorage === 'undefined') throw new Error('Browser storage is not available.');
  return globalThis.localStorage;
}

export function loadSentimentAnnotations(workspaceId, storage = null) {
  if (!workspaceId) return { annotations: {}, error: null };
  try {
    const raw = storageOf(storage).getItem(`${PREFIX}${workspaceId}`);
    if (!raw) return { annotations: {}, error: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { annotations: {}, error: 'Saved sentiment audit data is invalid and was not loaded.' };
    }
    const annotations = Object.fromEntries(
      Object.entries(parsed).filter(([id, label]) => typeof id === 'string' && LABELS.has(label)),
    );
    return { annotations, error: null };
  } catch {
    return { annotations: {}, error: 'Sentiment audit labels could not be read from this browser.' };
  }
}

export function saveSentimentAnnotations(workspaceId, annotations, storage = null) {
  if (!workspaceId) return { ok: false, error: 'A workspace is required to save audit labels.' };
  try {
    const cleaned = Object.fromEntries(
      Object.entries(annotations || {}).filter(([id, label]) => typeof id === 'string' && LABELS.has(label)),
    );
    storageOf(storage).setItem(`${PREFIX}${workspaceId}`, JSON.stringify(cleaned));
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Sentiment audit labels could not be saved in this browser.' };
  }
}
