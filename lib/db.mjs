// Akses database Sentil lewat API PostgREST Supabase (HTTPS). Sengaja tidak memakai
// driver TCP: fungsi serverless tidak perlu pooler, allowlist IP, atau dependensi baru.
// Kunci hanya dibaca dari environment — tidak pernah dikirim ke peramban dan tidak
// pernah ditulis ke log.
const BATCH_ROWS = 1000;
const READ_ROWS = 1000;
const DEFAULT_TIMEOUT_MS = 20000;

export class DbError extends Error {
  constructor(message, { status = 0, code = 'db_error', detail = null } = {}) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function dbConfiguration(env = process.env) {
  const raw = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!raw) return { enabled: false, reason: 'SUPABASE_URL is not set in the server environment.' };
  if (!key) {
    return {
      enabled: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set in the server environment. Supabase → Project Settings → API Keys → Secret key (the legacy name of the same role is service_role); the publishable key is deliberately not accepted because this server writes with it.',
    };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { enabled: false, reason: 'SUPABASE_URL is not a valid address.' };
  }
  if (url.protocol !== 'https:') return { enabled: false, reason: 'SUPABASE_URL must be https.' };
  if (url.username || url.password) return { enabled: false, reason: 'SUPABASE_URL must not carry credentials.' };
  return { enabled: true, baseUrl: `${url.origin}${url.pathname.replace(/\/$/, '')}`, key };
}

const detailOf = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

export function createDatabase({ env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now } = {}) {
  const config = dbConfiguration(env);

  async function request(path, { method = 'GET', query = null, body = null, prefer = null } = {}) {
    if (!config.enabled) throw new DbError(config.reason, { code: 'db_not_configured' });
    const url = new URL(`${config.baseUrl}/rest/v1/${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      accept: 'application/json',
    };
    if (body !== null) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const signal = cause?.cause?.code || cause?.code || cause?.name || 'network_error';
      throw new DbError(`The database could not be reached (${signal}).`, { code: 'db_unreachable' });
    }
    const text = await response.text();
    if (!response.ok) {
      throw new DbError(`The database rejected the request (${response.status}).`, { status: response.status, code: 'db_request_failed', detail: detailOf(text) });
    }
    if (!text || response.status === 204) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new DbError('The database response is not valid JSON.', { status: response.status, code: 'db_parse_error' });
    }
  }

  async function status() {
    if (!config.enabled) return { enabled: false, reachable: false, reason: config.reason };
    try {
      const rows = await request('sentil_workspace', { query: { select: 'id', limit: 1 } });
      return { enabled: true, reachable: Array.isArray(rows), reason: Array.isArray(rows) ? null : 'The table answer is not a list.' };
    } catch (cause) {
      return { enabled: true, reachable: false, reason: cause?.message || 'The database could not be reached.' };
    }
  }

  async function listWorkspaces() {
    const rows = await request('sentil_workspace', { query: { select: '*', order: 'updated_at.desc.nullslast' } });
    return (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.id,
      label: row.label,
      entity: row.entity,
      stores: row.stores || {},
      channels: row.channels || {},
      snapshot: row.snapshot || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastSyncedAt: row.last_synced_at || null,
    }));
  }

  async function loadDataset(workspaceId) {
    const head = await request('sentil_dataset', { query: { select: '*', workspace_id: `eq.${workspaceId}`, limit: 1 } });
    const row = Array.isArray(head) ? head[0] : null;
    if (!row) return null;
    const reviews = [];
    for (let offset = 0; ; offset += READ_ROWS) {
      const page = await request('sentil_review', {
        query: {
          select: 'payload',
          workspace_id: `eq.${workspaceId}`,
          revision: `eq.${row.revision}`,
          order: 'ordinal.asc',
          offset,
          limit: READ_ROWS,
        },
      });
      if (!Array.isArray(page) || !page.length) break;
      for (const entry of page) reviews.push(entry.payload);
      if (page.length < READ_ROWS) break;
    }
    return {
      entity: row.entity || null,
      fetchedAt: row.fetched_at || null,
      engine: row.engine || null,
      summary: row.summary || {},
      model: row.model || {},
      channels: row.channels || [],
      limits: row.limits || null,
      cache: row.cache || null,
      reviews,
      stored: { revision: row.revision, reviewCount: row.review_count, assembled: reviews.length },
    };
  }

  // Matriks perbandingan tidak butuh baris ulasan sama sekali — hanya ringkasan dan model yang
  // sudah tersimpan. Membaca lima project penuh bisa berarti 150.000 baris lewat jaringan.
  async function loadDatasetHeads(workspaceIds) {
    const ids = (Array.isArray(workspaceIds) ? workspaceIds : []).filter(id => typeof id === 'string' && id.length);
    if (!ids.length) return [];
    const rows = await request('sentil_dataset', {
      query: {
        select: 'workspace_id,revision,entity,fetched_at,engine,summary,model,channels,review_count,updated_at',
        workspace_id: `in.(${ids.map(id => `"${id}"`).join(',')})`,
      },
      // Satu baris per project, jadi batas baris default PostgREST tidak boleh memotong.
      limit: ids.length,
    });
    return (Array.isArray(rows) ? rows : []).map(row => ({
      workspaceId: row.workspace_id,
      entity: row.entity || null,
      fetchedAt: row.fetched_at || null,
      engine: row.engine || null,
      summary: row.summary || {},
      model: row.model || {},
      channels: row.channels || [],
      limits: null,
      cache: null,
      reviews: null,
      stored: { revision: row.revision, reviewCount: row.review_count, assembled: 0 },
    }));
  }

  async function saveWorkspace(workspace) {
    await request('sentil_workspace', {
      method: 'POST',
      query: { on_conflict: 'id' },
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{
        id: workspace.id,
        label: workspace.label,
        entity: workspace.entity,
        stores: workspace.stores || {},
        channels: workspace.channels || {},
        snapshot: workspace.snapshot ?? null,
        created_at: workspace.createdAt || null,
        updated_at: workspace.updatedAt || null,
        last_synced_at: workspace.lastSyncedAt || null,
      }],
    });
    return workspace.id;
  }

  async function deleteWorkspace(workspaceId) {
    // Cascade menghapus dataset dan baris ulasan milik workspace ini.
    await request('sentil_workspace', { method: 'DELETE', query: { id: `eq.${workspaceId}` }, prefer: 'return=minimal' });
    return true;
  }

  async function logRun(run) {
    await request('sentil_sync_run', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{
        workspace_id: run.workspaceId ?? null,
        entity: run.entity ?? null,
        status: run.status ?? null,
        reviews: run.reviews ?? null,
        channels: run.channels ?? null,
        error: run.error ?? null,
        elapsed_ms: run.elapsedMs ?? null,
      }],
    });
  }

  // Urutan tulis: baris revisi baru lengkap dulu, baru pointer dataset dipindah, lalu
  // revisi lama dibuang. Pembaca tidak pernah melihat ulasan setengah tertulis.
  async function saveSnapshot({ workspace, dataset, revision = null }) {
    const startedAt = now();
    if (!workspace?.id) throw new DbError('Unknown workspace.', { code: 'db_workspace_missing' });
    await saveWorkspace(workspace);
    const reviews = Array.isArray(dataset.reviews) ? dataset.reviews : [];
    const state = await revisionState(workspace.id);
    const nextRevision = Number.isInteger(revision) ? revision : state.next;
    // Baris di atas pointer hanya bisa sisa penulisan yang mati di tengah jalan. Kalau tidak
    // disapu lebih dulu, penyisipan revisi yang sama menabrak kunci utamanya dan penyimpanan
    // gagal terus sampai seseorang menghapus manual — jadi penyapuannya bagian dari tulisannya.
    await request('sentil_review', {
      method: 'DELETE',
      query: { workspace_id: `eq.${workspace.id}`, revision: `gt.${state.pointer}` },
      prefer: 'return=minimal',
    });
    const rows = reviews.map((review, ordinal) => ({
      workspace_id: workspace.id,
      revision: nextRevision,
      ordinal,
      review_id: typeof review?.id === 'string' ? review.id : null,
      platform: review?.platform || null,
      rating: Number.isInteger(review?.rating) ? review.rating : null,
      published_at: review?.publishedAt || null,
      payload: review,
    }));
    for (const part of chunk(rows, BATCH_ROWS)) {
      await request('sentil_review', { method: 'POST', prefer: 'return=minimal', body: part });
    }
    await request('sentil_dataset', {
      method: 'POST',
      query: { on_conflict: 'workspace_id' },
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{
        workspace_id: workspace.id,
        revision: nextRevision,
        entity: dataset.entity ?? workspace.entity ?? null,
        engine: dataset.engine ?? null,
        summary: dataset.summary ?? null,
        model: dataset.model ?? null,
        channels: dataset.channels ?? null,
        limits: dataset.limits ?? null,
        cache: dataset.cache ?? null,
        fetched_at: dataset.fetchedAt ?? null,
        review_count: reviews.length,
        updated_at: new Date(startedAt).toISOString(),
      }],
    });
    await request('sentil_review', {
      method: 'DELETE',
      query: { workspace_id: `eq.${workspace.id}`, revision: `lt.${nextRevision}` },
      prefer: 'return=minimal',
    });
    return { revision: nextRevision, stored: reviews.length, elapsedMs: now() - startedAt };
  }

  async function revisionState(workspaceId) {
    const head = await request('sentil_dataset', { query: { select: 'revision', workspace_id: `eq.${workspaceId}`, limit: 1 } });
    const row = Array.isArray(head) ? head[0] : null;
    const pointer = Number.isInteger(row?.revision) ? row.revision : 0;
    return { pointer, next: pointer + 1 };
  }

  return {
    enabled: config.enabled,
    reason: config.enabled ? null : config.reason,
    status,
    listWorkspaces,
    loadDataset,
    loadDatasetHeads,
    saveWorkspace,
    deleteWorkspace,
    saveSnapshot,
    logRun,
  };
}

export const database = createDatabase();
