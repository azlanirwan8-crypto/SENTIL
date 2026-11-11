const PREFIX = 'sentil.social-classifications.v1:';
const LABELS = new Set(['positive', 'neutral', 'negative', 'unclassified']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const REASONS = new Set(['clear_opinion', 'mixed_sentiment', 'sarcasm_or_context', 'no_sentiment_signal']);

function storageOf(storage) {
  if (storage) return storage;
  if (typeof globalThis.localStorage === 'undefined') throw new Error('Browser storage is not available.');
  return globalThis.localStorage;
}

function validResult(value) {
  return value && typeof value === 'object'
    && LABELS.has(value.label)
    && CONFIDENCE.has(value.confidence)
    && REASONS.has(value.reason)
    && typeof value.model === 'string'
    && typeof value.at === 'string';
}

export function loadSocialClassifications(workspaceId, storage = null) {
  if (!workspaceId) return { classifications: {}, error: null };
  try {
    const raw = storageOf(storage).getItem(`${PREFIX}${workspaceId}`);
    if (!raw) return { classifications: {}, error: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { classifications: {}, error: 'Saved Gemini classification data is invalid and was not loaded.' };
    }
    return {
      classifications: Object.fromEntries(Object.entries(parsed).filter(([id, value]) => typeof id === 'string' && validResult(value))),
      error: null,
    };
  } catch {
    return { classifications: {}, error: 'Gemini classifications could not be read from this browser.' };
  }
}

export function saveSocialClassifications(workspaceId, classifications, storage = null) {
  if (!workspaceId) return { ok: false, error: 'A workspace is required to save Gemini classifications.' };
  try {
    const cleaned = Object.fromEntries(
      Object.entries(classifications || {}).filter(([id, value]) => typeof id === 'string' && validResult(value)),
    );
    storageOf(storage).setItem(`${PREFIX}${workspaceId}`, JSON.stringify(cleaned));
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Gemini classifications could not be saved in this browser.' };
  }
}
