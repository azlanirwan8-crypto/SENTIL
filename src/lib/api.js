export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function post(payload) {
  let response;
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('The analysis server could not be reached. Check the connection and try again.');
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }

  if (!response.ok) {
    // 504 datang dari platform, bukan dari kode kita: tidak ada JSON untuk dibaca, dan
    // "the response could not be read" bukan penjelasan bagi yang melihatnya.
    if (response.status === 504 || response.status === 503) {
      throw new ApiError(
        `The server reached its platform time limit for this request (${response.status}). Nothing was changed and no stored data was removed — try again, or run it from the scheduled pull.`,
        { status: response.status, code: 'server_timeout' },
      );
    }
    // Server mengirim tahap dan alasannya terpisah (tanpa isi jawaban database): tanpa itu,
    // "the server could not complete this request" tidak memberi tahu apa yang harus disetel.
    const detail = [body?.stage, body?.reason].filter(part => typeof part === 'string' && part.length).join(' · ');
    const message = body && typeof body.message === 'string'
      ? (detail ? `${body.message} (${detail})` : body.message)
      : `The request failed with status ${response.status}.`;
    throw new ApiError(message, { status: response.status, code: body && typeof body.error === 'string' ? body.error : 'request_failed' });
  }

  if (!body || typeof body !== 'object') {
    throw new ApiError('The server returned a response that could not be read.');
  }

  return body;
}

export function discoverStores(entity) {
  return post({ action: 'discover', entity });
}

export function syncWorkspace({ workspace, entity, playAppId, appleAppId, social = {}, force = false }) {
  return post({
    action: 'sync',
    workspace: workspace || null,
    entity,
    playAppId: playAppId || null,
    appleAppId: appleAppId || null,
    social,
    force: force === true,
  });
}

export function fetchState() {
  return post({ action: 'state' });
}

export function fetchComparison(workspaceIds) {
  return post({ action: 'compare', workspaceIds });
}

export function fetchDataset(workspaceId) {
  return post({ action: 'dataset', workspaceId });
}

export function removeWorkspace(workspaceId) {
  return post({ action: 'workspace-delete', workspaceId });
}

export function putWorkspace(workspace) {
  return post({ action: 'workspace-save', workspace });
}

export function fetchLimits({ entity, playAppId, appleAppId, social = {} }) {
  return post({ action: 'limits', entity, playAppId: playAppId || null, appleAppId: appleAppId || null, social });
}

export function resetLimits({ entity, playAppId, appleAppId, social = {} }) {
  return post({ action: 'limits-reset', entity, playAppId: playAppId || null, appleAppId: appleAppId || null, social });
}

export function fetchJob(workspaceId, jobId = null) {
  return post({ action: 'job', workspaceId, ...(jobId ? { jobId } : {}) });
}

export function recomputeWorkspace(workspaceId) {
  return post({ action: 'recompute', workspaceId });
}
