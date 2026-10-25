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
    throw new ApiError('Server analisis tidak dapat dihubungi. Periksa koneksi lalu coba lagi.');
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }

  if (!response.ok) {
    throw new ApiError(
      body && typeof body.message === 'string'
        ? body.message
        : `Permintaan gagal dengan status ${response.status}.`,
      { status: response.status, code: body && typeof body.error === 'string' ? body.error : 'request_failed' },
    );
  }

  if (!body || typeof body !== 'object') {
    throw new ApiError('Server mengembalikan respons yang tidak dapat dibaca.');
  }

  return body;
}

export function discoverStores(entity) {
  return post({ action: 'discover', entity });
}

export function syncWorkspace({ entity, playAppId, appleAppId, force = false }) {
  return post({
    action: 'sync',
    entity,
    playAppId: playAppId || null,
    appleAppId: appleAppId || null,
    force: force === true,
  });
}
