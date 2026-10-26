// Penyimpanan hasil penarikan ke database, dipakai bersama oleh satu pintu API dan oleh
// penarik terjadwal. Dua pemanggil, satu aturan: kegagalan tulis tidak pernah membuat
// penarikan dianggap gagal — barisnya benar-benar terbaca dari sumber, jadi hasilnya tetap
// dikembalikan sementara status penyimpanan dilaporkan apa adanya.
const snapshotOf = summary => {
  if (!summary || typeof summary !== 'object') return null;
  return {
    reviews: summary.reviews ?? 0,
    withText: summary.withText ?? 0,
    analyzed: summary.analyzed ?? 0,
    positive: summary.positive ?? 0,
    negative: summary.negative ?? 0,
    neutral: summary.neutral ?? 0,
    unclassified: summary.unclassified ?? 0,
    nss: summary.nss ?? null,
    fetchedAt: summary.fetchedAt ?? null,
    channels: Array.isArray(summary.channels) ? summary.channels : [],
  };
};

export async function storeResult(db, workspace, result) {
  if (!db.enabled) return { ok: false, reason: db.reason || 'Database is not configured on this server.' };
  if (!workspace) return { ok: false, reason: 'This request carried no valid workspace identity, so nothing was stored.' };
  try {
    const head = {
      ...workspace,
      snapshot: { ...snapshotOf(result.summary), fetchedAt: result.fetchedAt },
      lastSyncedAt: result.fetchedAt,
      updatedAt: result.fetchedAt,
    };
    // Penarikan yang tidak menemukan baris baru tidak menulis ulang puluhan ribu baris. Yang
    // disentuh hanya cap waktu workspace, jadi dasbor tahu data baru saja diperiksa.
    if (result.unchanged) {
      const started = Date.now();
      const previous = snapshotOf(workspace.snapshot) || {};
      await db.saveWorkspace({
        ...head,
        // Cap waktu analisis TIDAK diubah: datanya memang sama. Yang berubah hanya cap pemeriksaan
        // (lastSyncedAt), supaya penarik terjadwal tidak menganggap snapshot ini belum pernah dicek.
        snapshot: { ...previous, fetchedAt: previous.fetchedAt || workspace.lastSyncedAt || null, checkedAt: result.fetchedAt },
      });
      await db.logRun({
        workspaceId: workspace.id,
        entity: result.entity,
        status: 'unchanged',
        reviews: result.incremental?.carried ?? previous.reviews ?? null,
        channels: (Array.isArray(result.channels) ? result.channels : []).map(channel => ({ id: channel.id, status: channel.status, fetched: channel.fetched })),
        error: null,
        elapsedMs: Date.now() - started,
      });
      return { ok: true, unchanged: true, rows: result.incremental?.carried ?? null, elapsedMs: Date.now() - started };
    }
    const saved = await db.saveSnapshot({ workspace: head, dataset: result });
    const channels = Array.isArray(result.channels) ? result.channels : [];
    await db.logRun({
      workspaceId: workspace.id,
      entity: result.entity,
      status: channels.length && channels.every(channel => channel.status === 'error')
        ? 'error'
        : channels.length && result.reviews.length === 0 ? 'empty' : 'ok',
      reviews: result.reviews.length,
      channels: channels.map(channel => ({ id: channel.id, status: channel.status, fetched: channel.fetched })),
      error: null,
      elapsedMs: saved.elapsedMs,
    });
    return { ok: true, revision: saved.revision, rows: saved.stored, elapsedMs: saved.elapsedMs };
  } catch (error) {
    return { ok: false, reason: error?.message || 'The database rejected the write.' };
  }
}
