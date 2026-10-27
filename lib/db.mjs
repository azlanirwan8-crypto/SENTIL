// Akses database Sentil lewat API PostgREST Supabase (HTTPS). Sengaja tidak memakai
// driver TCP: fungsi serverless tidak perlu pooler, allowlist IP, atau dependensi baru.
// Kunci hanya dibaca dari environment — tidak pernah dikirim ke peramban dan tidak
// pernah ditulis ke log.
const BATCH_ROWS = 1000;
// Satu halaman baca membawa 2.000 payload, bukan 1.000: pada korpus 69.356 ulasan seluruh
// pekerjaan dibatasi satu tenggat 300 detik, dan 70 bolak-balik kecil adalah biaya terbesar di
// jalur itu. Enam jalur dipakai lagi karena tiap permintaan sekarang punya anggarannya sendiri
// (60 detik) dan dicoba ulang sekali — kegagalan yang dulu menjatuhkan seluruh penarikan itu
// bukan karena jalurnya banyak, melainkan karena anggarannya satu ukuran untuk semua.
const READ_ROWS = 2000;
const WRITE_CONCURRENCY = 4;
const READ_CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 20000;
// Halaman baca dan potongan tulis berisi 1.000 baris jsonb, jadi anggarannya sendiri: 20 detik
// cukup untuk satu baris kepala, tidak untuk 1.000 payload ulasan.
const BULK_TIMEOUT_MS = 60000;

export class DbError extends Error {
  constructor(message, { status = 0, code = 'db_error', detail = null, stage = null } = {}) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.stage = stage;
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

  async function request(path, { method = 'GET', query = null, body = null, prefer = null, timeoutMs = DEFAULT_TIMEOUT_MS, retry = 0, stage = null } = {}) {
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
    const label = stage || path;
    const attempts = 1 + retry;
    let lastFailure = null;
    // Permintaan yang gugur karena waktu atau karena gerbang sumber dicoba sekali lagi: halaman
    // baca bersifat idempoten, dan potongan tulis dikirim sebagai upsert pada kunci
    // (workspace, revisi, ordinal) jadi percobaan ulang tidak pernah menduplikasi baris.
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
        lastFailure = new DbError(`The database request "${label}" could not be completed (${signal}, attempt ${attempt} of ${attempts}, ${Math.round(timeoutMs / 1000)}s budget).`, { code: 'db_unreachable', stage: label });
        if (attempt < attempts) continue;
        throw lastFailure;
      }
      const text = await response.text();
      if (!response.ok) {
        // Hanya kesalahan sesaat yang diulang. 4xx adalah salah permintaan kita sendiri —
        // bentuk, kunci, atau hak akses — dan mengulangnya tidak memperbaiki apa pun.
        if (attempt < attempts && (response.status === 429 || response.status >= 500)) {
          lastFailure = new DbError(`The database rejected "${label}" (${response.status}, attempt ${attempt} of ${attempts}).`, { status: response.status, code: 'db_request_failed', detail: detailOf(text), stage: label });
          continue;
        }
        throw new DbError(`The database rejected the request "${label}" (${response.status}).`, { status: response.status, code: 'db_request_failed', detail: detailOf(text), stage: label });
      }
      if (!text || response.status === 204) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new DbError(`The database answer for "${label}" is not valid JSON.`, { status: response.status, code: 'db_parse_error', stage: label });
      }
    }
    throw lastFailure || new DbError(`The database request "${label}" failed.`, { code: 'db_unreachable', stage: label });
  }

  // Fungsi simpanan (RPC) dipakai gerbang kuota: mengambil satu jatah dan membacanya
  // kembali harus terjadi dalam satu statement, kalau tidak dua permintaan serentak
  // bisa sama-sama menganggap dirinya yang pertama.
  async function rpc(name, params) {
    return request(`rpc/${name}`, { method: 'POST', body: params || {} });
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
    // Jumlah halaman dihitung dari review_count yang tersimpan, jadi tidak ada permintaan tebak
    // -tebakan. Beberapa jalur membaca serentak; hasilnya disatukan menurut offset. Kalau semua
    // halaman terduga ternyata penuh, offset berikutnya diminta sampai sebuah halaman pendek
    // menutup daftar — jadi hasilnya tetap persis sama dengan pembacaan berurutan.
    const base = {
      select: 'payload',
      workspace_id: `eq.${workspaceId}`,
      revision: `eq.${row.revision}`,
      order: 'ordinal.asc',
      limit: READ_ROWS,
    };
    const seedPages = Number.isInteger(row.review_count) && row.review_count > 0
      ? Math.ceil(row.review_count / READ_ROWS)
      : 1;
    const reviews = [];
    let page = 0;
    let finished = false;
    while (!finished) {
      const remaining = seedPages - page;
      // Batch terakhir dari perkiraan tidak perlu selebar READ_CONCURRENCY: kalau review_count
      // akurat, tebakannya sudah pas dan tidak ada permintaan sia-sia.
      const width = remaining > 0 ? Math.min(READ_CONCURRENCY, remaining) : READ_CONCURRENCY;
      const starts = Array.from({ length: width }, (_, index) => (page + index) * READ_ROWS);
      const answered = await Promise.all(starts.map(offset => request('sentil_review', {
        query: { ...base, offset },
        timeoutMs: BULK_TIMEOUT_MS,
        retry: 1,
        stage: `read reviews at ${offset}`,
      })));
      const lists = answered.map(pageRows => (Array.isArray(pageRows) ? pageRows : []));
      const short = lists.findIndex(rows => rows.length < READ_ROWS);
      for (let index = 0; index < lists.length; index += 1) {
        for (const entry of lists[index]) reviews.push(entry.payload);
        if (index === short) { finished = true; break; }
      }
      page += short >= 0 ? short + 1 : width;
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

  // Baris terakhir riwayat penarikan adalah status pekerjaan: penarikan yang sedang berjalan
  // menulis 'running', lalu penyimpanan menulis ok/empty/unchanged/error. Peramban menyambungkan
  // penarikan latar belakang dengan membaca baris ini, jadi tidak perlu tabel antrean baru.
  async function latestRun(workspaceId) {
    if (!workspaceId) return null;
    const rows = await request('sentil_sync_run', {
      query: { select: '*', workspace_id: `eq.${workspaceId}`, order: 'id.desc', limit: 1 },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      id: row.id ?? null,
      status: row.status || null,
      reviews: Number.isInteger(row.reviews) ? row.reviews : null,
      channels: row.channels || null,
      error: row.error || null,
      elapsedMs: Number.isInteger(row.elapsed_ms) ? row.elapsed_ms : null,
      createdAt: row.created_at || null,
    };
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
      timeoutMs: BULK_TIMEOUT_MS,
      retry: 1,
      stage: 'clear unfinished revisions',
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
    const parts = chunk(rows, BATCH_ROWS);
    // Chunk dikirim lewat beberapa jalur sekaligus. Pembaca tidak pernah melihat revisi ini
    // sebelum pointer dipindah, jadi urutan kirim tidak mengubah satu angka pun. Kirimnya
    // berupa upsert pada kunci primer, jadi satu potongan yang dicoba ulang karena jaringan
    // menambah nol baris.
    let cursor = 0;
    async function writer() {
      while (cursor < parts.length) {
        const index = cursor;
        cursor += 1;
        await request('sentil_review', {
          method: 'POST',
          query: { on_conflict: 'workspace_id,revision,ordinal' },
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: parts[index],
          timeoutMs: BULK_TIMEOUT_MS,
          retry: 1,
          stage: `write chunk ${index + 1}/${parts.length}`,
        });
      }
    }
    await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, parts.length) }, writer));
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
      timeoutMs: BULK_TIMEOUT_MS,
      retry: 1,
      stage: 'drop previous revision',
    });
    return { revision: nextRevision, stored: reviews.length, elapsedMs: now() - startedAt };
  }

  async function revisionState(workspaceId) {
    const head = await request('sentil_dataset', { query: { select: 'revision', workspace_id: `eq.${workspaceId}`, limit: 1 } });
    const row = Array.isArray(head) ? head[0] : null;
    const pointer = Number.isInteger(row?.revision) ? row.revision : 0;
    return { pointer, next: pointer + 1 };
  }

  // Penanda inkremental: tanggal ulasan paling tua-baru yang sudah tersimpan per kanal toko.
  // Hanya dipakai kalau snapshot sebelumnya mengaku lengkap untuk kanal itu — kalau penarikan
  // terdahulu terpotong, celahnya harus ditutup dengan penarikan penuh, bukan diabaikan.
  async function reviewCursor(workspaceId) {
    if (!workspaceId) return null;
    const head = await request('sentil_dataset', {
      query: { select: 'revision,fetched_at,channels', workspace_id: `eq.${workspaceId}`, limit: 1 },
    });
    const row = Array.isArray(head) ? head[0] : null;
    if (!row || !Number.isInteger(row.revision)) return null;
    const channels = Array.isArray(row.channels) ? row.channels : [];
    const platforms = {};
    for (const platform of ['play', 'appstore']) {
      const meta = channels.find(channel => channel?.id === platform);
      if (!meta || meta.status === 'error' || meta.truncated !== false) continue;
      const page = await request('sentil_review', {
        query: {
          select: 'published_at',
          workspace_id: `eq.${workspaceId}`,
          revision: `eq.${row.revision}`,
          platform: `eq.${platform}`,
          order: 'published_at.desc.nullslast',
          limit: 1,
        },
      });
      const value = Array.isArray(page) && page.length ? page[0].published_at : null;
      if (value) platforms[platform] = value;
    }
    return { revision: row.revision, fetchedAt: row.fetched_at || null, platforms };
  }

  return {
    enabled: config.enabled,
    reason: config.enabled ? null : config.reason,
    status,
    rpc,
    listWorkspaces,
    loadDataset,
    loadDatasetHeads,
    reviewCursor,
    revisionState,
    saveWorkspace,
    deleteWorkspace,
    saveSnapshot,
    logRun,
    latestRun,
  };
}

export const database = createDatabase();
