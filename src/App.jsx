import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar.jsx';
import { TopBar } from './components/TopBar.jsx';
import { Welcome } from './components/Welcome.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { Overview } from './components/Overview.jsx';
import { ReviewsView } from './components/ReviewsView.jsx';
import { LimitMonitor } from './components/LimitMonitor.jsx';
import { ModelView } from './components/ModelView.jsx';
import { CompareView } from './components/CompareView.jsx';
import { WorkspaceDialog } from './components/WorkspaceDialog.jsx';
import { ConfirmDeleteDialog } from './components/ConfirmDialog.jsx';
import { BootScreen, SyncScreen, WorkspaceEmpty } from './components/WorkspaceStates.jsx';
import { Notice, StorageWarning } from './components/Notices.jsx';
import { ToastStack } from './components/Toast.jsx';
import { fetchJob, recomputeWorkspace, syncWorkspace } from './lib/api.js';
import { exportWorkspace } from './lib/export.js';
import { formatNumber, platformLabel } from './lib/format.js';
import { t, useLanguage } from './lib/i18n.js';
import {
  createWorkspaceId,
  deleteWorkspace,
  loadDataset,
  loadState,
  persistActiveId,
  readActiveId,
  saveWorkspace,
} from './lib/storage.js';

// Seberapa sering halaman menanyakan daftar project ke server. Aksi state murah (satu
// query daftar), dan di bawah ini yang dibayar per project hanyalah pembacaan dataset
// ketika capnya benar-benar bergeser.
const STATE_POLL_MS = 75_000;
// Penarikan tidak lagi ditunggu dalam satu permintaan. Halaman menanyakan status pekerjaan tiap
// beberapa detik, dan berhenti menunggu setelah anggaran ini — kalau lewat, yang ditampilkan
// tetap snapshot terakhir yang utuh, bukan separuh hasil.
const JOB_POLL_MS = 2_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Progres dibaca sambil menunggu, bukan sesudahnya. Penarikan berjalan di dalam satu permintaan
// dan baris riwayatnya ('running' → 'storing' → cap akhir) ditulis oleh permintaan yang sama, jadi
// peramban tinggal bertanya tiap dua detik sementara jawabannya belum sampai. Layar punya angka
// yang bergerak tanpa perlu menebak, dan tidak ada pekerjaan yang hidup di tempat yang tidak bisa
// dilihat orang.
function watchPullProgress(workspaceId, onProgress, { pollingMs = JOB_POLL_MS } = {}) {
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      await sleep(pollingMs);
      if (stopped) break;
      try {
        const state = await fetchJob(workspaceId);
        if (!stopped && state.progress) onProgress(state.progress, state.run || null);
      } catch {
        // Permintaan status yang gugur tidak boleh menghentikan penarikannya sendiri; pertanyaan
        // berikutnya datang dua detik kemudian.
      }
    }
  };
  void loop();
  return () => { stopped = true; };
}

function snapshotOf(data) {
  const summary = data.summary || {};
  return {
    reviews: summary.reviews ?? 0,
    withText: summary.withText ?? 0,
    analyzed: summary.analyzed ?? 0,
    positive: summary.positive ?? 0,
    negative: summary.negative ?? 0,
    neutral: summary.neutral ?? 0,
    unclassified: summary.unclassified ?? 0,
    nss: summary.nss ?? null,
    fetchedAt: data.fetchedAt || null,
    channels: Array.isArray(summary.channels) ? summary.channels : [],
  };
}

function mergeStores(existing, data) {
  const next = { ...(existing || {}) };
  for (const channel of data.channels || []) {
    if (!channel?.id || !channel.appId) continue;
    const app = channel.app || {};
    const previous = next[channel.id] || {};
    next[channel.id] = {
      ...previous,
      appId: channel.appId,
      title: app.title || previous.title || null,
      developer: app.developer || previous.developer || null,
      url: app.url || previous.url || null,
    };
  }
  return next;
}

export default function App() {
  // Bahasa dibaca di sini supaya seluruh pohon menggambar ulang saat pilihan berubah; t()
  // sendiri mengambil nilainya dari modul, jadi tidak ada prop bahasa yang perlu diteruskan.
  const language = useLanguage();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [datasetError, setDatasetError] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [booting, setBooting] = useState(true);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [storageIssue, setStorageIssue] = useState(null);
  const [view, setView] = useState('dashboard');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Project yang barisnya sedang dituliskan ke database, sebelum penarikan pertamanya dimulai.
  // Tanpa penanda ini layar sempat menampilkan "belum ada snapshot" di tengah dua permintaan —
  // padahal yang sedang terjadi hanyalah penyimpanan project baru.
  const [startingId, setStartingId] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [toasts, setToasts] = useState([]);

  const workspacesRef = useRef([]);
  const activeIdRef = useRef(null);
  const datasetRef = useRef(null);
  const syncingRef = useRef(false);
  const deletingRef = useRef(false);
  const startingIdRef = useRef(null);
  const toastSeq = useRef(0);

  const activeWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === activeId) || null,
    [workspaces, activeId],
  );
  const existingLabels = useMemo(() => workspaces.map(workspace => workspace.label), [workspaces]);
  const activeSyncing = Boolean(syncing && syncing.workspaceId === activeId);

  const pushToast = useCallback((message, tone = 'info', title = null) => {
    toastSeq.current += 1;
    const toast = { id: toastSeq.current, message, tone, title };
    setToasts(current => [...current.slice(-2), toast]);
  }, []);
  const dismissToast = useCallback(id => setToasts(current => current.filter(toast => toast.id !== id)), []);

  const applyWorkspaces = useCallback(next => {
    workspacesRef.current = next;
    setWorkspaces(next);
  }, []);

  const applyActive = useCallback(id => {
    activeIdRef.current = id;
    setActiveId(id);
    persistActiveId(id);
  }, []);

  const applyDataset = useCallback(data => {
    datasetRef.current = data;
    setDataset(data);
  }, []);

  // Judul tab dan atribut bahasa dokumen ikut pilihan. index.html hanya bisa menulis nilai
  // awal, karena berkas itu disajikan sebelum React berjalan.
  useEffect(() => {
    document.title = t('Sentil — Review sentiment analysis');
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await loadState();
      if (cancelled) return;
      setDbStatus(state.db);
      if (state.error) setStorageIssue({ message: state.error, title: state.errorTitle || null });
      applyWorkspaces(state.workspaces);
      const stored = readActiveId();
      const active = state.workspaces.find(workspace => workspace.id === stored) || state.workspaces[0] || null;
      applyActive(active?.id || null);
      if (active) {
        const loaded = await loadDataset(active.id);
        if (cancelled) return;
        if (loaded.db) setDbStatus(loaded.db);
        applyDataset(loaded.dataset);
        setDatasetError(loaded.error);
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyActive, applyDataset, applyWorkspaces]);

  // Penarikan terjadwal di server (cron /api/refresh) bisa menghasilkan snapshot baru tanpa
  // ada yang menekan tombol, jadi halaman ini bertanya ulang: berkala, dan segera ketika tab
  // kembali terlihat. Yang dibandingkan hanyalah cap waktu snapshot — selama server belum
  // punya snapshot yang lebih baru, tidak ada permintaan besar yang dikirim.
  useEffect(() => {
    let cancelled = false;
    async function checkServer() {
      // Daftar project tidak boleh ditimpa di tengah mutasi: polling yang mendarat antara
      // "project baru sudah di layar" dan "barisnya sudah diterima database" (atau antara
      // konfirmasi hapus dan jawaban server) akan mengembalikan yang baru dihapus dan
      // menghilangkan yang baru dibuat selama satu tarikan napas.
      if (cancelled || syncingRef.current || deletingRef.current || startingIdRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const state = await loadState();
      if (cancelled || state.unreachable) return;
      setDbStatus(state.db);
      applyWorkspaces(state.workspaces);
      const id = activeIdRef.current;
      if (!id) return;
      const remote = state.workspaces.find(workspace => workspace.id === id)?.snapshot?.fetchedAt || null;
      const local = datasetRef.current?.fetchedAt || null;
      if (!remote || remote === local) return;
      const loaded = await loadDataset(id);
      if (cancelled || activeIdRef.current !== id) return;
      if (loaded.db) setDbStatus(loaded.db);
      applyDataset(loaded.dataset);
      setDatasetError(loaded.error);
      pushToast(t('A newer snapshot was pulled on the server and is now on screen.'), 'info', t('Data refreshed'));
    }
    const timer = setInterval(checkServer, STATE_POLL_MS);
    const onVisible = () => { if (!document.hidden) checkServer(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyDataset, applyWorkspaces, pushToast]);

  const runSync = useCallback(async (workspace, { force = false } = {}) => {
    if (!workspace || syncingRef.current) return;
    const playAppId = workspace.stores?.play?.appId || null;
    const appleAppId = workspace.stores?.appstore?.appId || null;
    const social = workspace.channels || {};
    const socialOn = Object.values(social).some(entry => entry?.enabled);
    if (!playAppId && !appleAppId && !socialOn) {
      pushToast(t('No source is active yet. Enable at least one channel for this analysis.'), 'error');
      return;
    }
    syncingRef.current = true;
    setSyncing({ workspaceId: workspace.id, force, startedAt: Date.now() });
    setSyncProgress(null);
    setSyncError(null);
    const stopWatching = watchPullProgress(workspace.id, setSyncProgress);
    try {
      const data = await syncWorkspace({ workspace, entity: workspace.entity, playAppId, appleAppId, social, force });
      if (data.db) setDbStatus(data.db);
      const channels = Array.isArray(data.channels) ? data.channels : [];
      const allFailed = channels.length > 0 && channels.every(channel => channel.status === 'error');
      const anyFailed = channels.some(channel => channel.status === 'error');
      const anyPartial = channels.some(channel => channel.status === 'partial' || channel.truncated);
      const stored = data.stored || null;
      const previous = datasetRef.current;
      const preservePrevious = previous?.reviews?.length > 0 && (allFailed || (data.reviews.length === 0 && anyFailed));

      if (preservePrevious) {
        setSyncError(t('The last pull returned no reviews and at least one channel failed. The previous snapshot is still in use; no number was overwritten.'));
        pushToast(t('Pull incomplete. The previous snapshot was kept.'), 'warning', t('Old data not deleted'));
        if (stored && stored.ok === false) pushToast(stored.reason, 'warning', t('Not stored in the database'));
        return;
      }

      if (activeIdRef.current === workspace.id) {
        applyDataset(data);
        setDatasetError(null);
      }

      const now = new Date().toISOString();
      applyWorkspaces(workspacesRef.current.map(item => (item.id === workspace.id ? {
        ...item,
        entity: data.entity || item.entity,
        stores: mergeStores(item.stores, data),
        lastSyncedAt: data.fetchedAt || now,
        updatedAt: now,
        snapshot: snapshotOf(data),
      } : item)));

      if (allFailed) pushToast(t('Every channel failed to read. No number was invented.'), 'error', t('Pull failed'));
      else if (data.reviews.length === 0) pushToast(t('Sources responded, but no written review came back.'), 'warning', t('Zero reviews read'));
      else if (anyFailed || anyPartial) pushToast(`${formatNumber(data.reviews.length)} ${t('reviews read; some channels are still incomplete.')}`, 'warning', t('Partial result'));
      else pushToast(`${formatNumber(data.reviews.length)} ${t('reviews read; the corpus model was refreshed.')}`, 'success', t('Snapshot ready'));
      if (stored && stored.ok === true && stored.unchanged) {
        pushToast(t('The sources answered and nothing new came in since the stored snapshot, so no analysis was repeated and nothing was overwritten.'), 'info', t('No new reviews'));
      } else if (stored && stored.ok === true) {
        pushToast(`${formatNumber(stored.rows)} ${t('review rows saved as revision')} ${stored.revision}.`, 'success', t('Saved to the database'));
      } else if (stored && stored.ok === false) {
        pushToast(stored.reason, 'warning', t('Not stored in the database'));
      }
    } catch (error) {
      setSyncError(error.message || t('The pull failed.'));
      pushToast(error.message || t('The pull failed.'), 'error', t('Pull failed'));
    } finally {
      stopWatching();
      syncingRef.current = false;
      setSyncing(null);
      setSyncProgress(null);
    }
  }, [applyDataset, applyWorkspaces, pushToast]);

  // Build lama menyimpan analisis yang namanya masih meminjam kata dari ulasan. Tombol ini
  // menyusun ulang seluruh label dari baris yang sudah tersimpan — tanpa penarikan ulang.
  const runRecompute = useCallback(async workspace => {
    if (!workspace || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing({ workspaceId: workspace.id, force: false, startedAt: Date.now() });
    setSyncError(null);
    try {
      const result = await recomputeWorkspace(workspace.id);
      pushToast(result.message || `${formatNumber(result.rows || 0)} ${t('stored reviews were re-analysed.')}`, 'success', t('Analysis rebuilt'));
      const loaded = await loadDataset(workspace.id);
      if (loaded.dataset && activeIdRef.current === workspace.id) {
        applyDataset(loaded.dataset);
        setDatasetError(null);
      } else if (loaded.error) {
        pushToast(loaded.error, 'warning', t('Could not read the new snapshot'));
      }
    } catch (error) {
      setSyncError(error.message || t('Re-running the analysis failed.'));
      pushToast(error.message || t('Re-running the analysis failed.'), 'error', t('Re-run failed'));
    } finally {
      syncingRef.current = false;
      setSyncing(null);
    }
  }, [applyDataset, pushToast]);

  async function switchWorkspace(id) {
    if (!id || id === activeIdRef.current) return;
    const workspace = workspacesRef.current.find(item => item.id === id);
    if (!workspace) return;
    applyActive(id);
    applyDataset(null);
    setDatasetError(null);
    setSyncError(null);
    setView('dashboard');
    setLoadingDataset(true);
    const loaded = await loadDataset(id);
    // Kerangka loading dilepas lebih dulu: kalau orang berpindah project lagi sebelum bacaan
    // ini selesai, hasil bacaan yang basi tidak boleh meninggalkan layar loading di layar yang
    // baru.
    setLoadingDataset(false);
    if (activeIdRef.current !== id) return;
    if (loaded.db) setDbStatus(loaded.db);
    applyDataset(loaded.dataset);
    setDatasetError(loaded.error);
  }

  async function handleCreate(draft) {
    const now = new Date().toISOString();
    const workspace = {
      id: createWorkspaceId(),
      label: draft.label,
      entity: draft.entity,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: null,
      stores: draft.stores,
      channels: draft.channels || {},
      snapshot: null,
    };
    applyWorkspaces([workspace, ...workspacesRef.current]);
    applyActive(workspace.id);
    applyDataset(null);
    setDatasetError(null);
    setSyncError(null);
    setView('dashboard');
    setDialogOpen(false);
    // Baris project harus diterima database sebelum penarikan pertama (baris dataset punya kunci
    // luar ke project), jadi tulisannya menunggu. Selama tulisan itu menunggu, layar sudah
    // memindahkan orang ke project barunya — tanpa penanda ini yang muncul justru "belum ada
    // snapshot", yang bukan kebenaran: cuma jeda satu permintaan.
    startingIdRef.current = workspace.id;
    setStartingId(workspace.id);
    const saved = await saveWorkspace(workspace);
    if (saved.db) setDbStatus(saved.db);
    if (!saved.saved) pushToast(saved.error, 'warning', t('Not stored in the database'));
    runSync(workspace, { force: false });
    startingIdRef.current = null;
    setStartingId(null);
  }

  async function handleDelete() {
    const target = activeIdRef.current;
    if (!target || deletingRef.current) return;
    const kept = workspacesRef.current.filter(workspace => workspace.id !== target);
    const nextActive = kept[0]?.id || null;
    deletingRef.current = true;
    setDeleting(true);
    // Pembacaan project berikutnya dimulai bersamaan dengan permintaan hapus, bukan sesudahnya.
    // Yang membuat layar terasa lama saat menghapus bukan penghapusan barisnya — cascade database
    // hanya membuang beberapa baris kepala plus baris ulasan project itu — melainkan pembacaan
    // korpus project berikutnya, puluhan detik pada puluhan ribu ulasan. Permintaan ini murni
    // baca dan tidak menyentuh project yang sedang dihapus, jadi hasilnya siap dipakai begitu
    // server mengonfirmasi.
    const nextLoad = nextActive ? loadDataset(nextActive) : null;
    const result = await deleteWorkspace(target);
    deletingRef.current = false;
    setDeleting(false);
    if (!result.deleted) {
      // Konfirmasi tetap terbuka dan tombol kembali bisa dipakai: yang gagal adalah permintaan ke
      // server, jadi tidak ada yang boleh hilang dari layar.
      pushToast(result.error, 'error', t('Delete not confirmed'));
      return;
    }
    pushToast(t('This workspace and its stored reviews were deleted from the database.'), 'success', t('Analysis deleted'));
    applyWorkspaces(kept);
    setConfirmOpen(false);
    // Orang bisa berpindah project selama permintaan hapus berjalan; yang boleh dipindahkan
    // hanyalah yang masih duduk di project yang baru dihapus.
    if (activeIdRef.current !== target) return;
    applyActive(nextActive);
    applyDataset(null);
    setDatasetError(null);
    setSyncError(null);
    setView('dashboard');
    if (!nextLoad) return;
    setLoadingDataset(true);
    const loaded = await nextLoad;
    setLoadingDataset(false);
    if (activeIdRef.current !== nextActive) return;
    if (loaded.db) setDbStatus(loaded.db);
    applyDataset(loaded.dataset);
    setDatasetError(loaded.error);
  }

  function handleExport() {
    if (!activeWorkspace || !dataset) {
      pushToast(t('There is no snapshot to export yet.'), 'warning');
      return;
    }
    const ok = exportWorkspace(activeWorkspace, dataset);
    if (ok) pushToast(t('The full snapshot was exported as JSON.'), 'success', t('Export complete'));
    else pushToast(t('The export could not run in this browser.'), 'error');
  }

  const notices = [];
  if (dbStatus && dbStatus.enabled === false) {
    notices.push(
      <Notice key="db-off" tone="amber" title={t('The database is not configured on this server')} live>
        {dbStatus.reason} {t('Nothing is saved between visits until it is set up, so the analyses you see here live in this session only.')}
      </Notice>,
    );
  } else if (dbStatus && dbStatus.reachable === false) {
    notices.push(
      <Notice key="db-down" tone="coral" title={t('The database could not be reached')} live>
        {dbStatus.reason} {t('Pulls still read the live sources, but nothing new is stored until the database answers again.')}
      </Notice>,
    );
  }
  if (syncError) {
    notices.push(
      <Notice key="sync" tone="coral" title={t('Last pull failed')} live>
        {syncError}
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'error')) {
    const failed = dataset.channels.filter(channel => channel.status === 'error').map(channel => platformLabel(channel.id));
    notices.push(
      <Notice key="failed" tone="coral" title={`${failed.join(', ')} ${t('could not be read')}`}>
        {t('This analysis uses only the channels that succeeded. No stand-in numbers and no old data were mixed into the new snapshot.')}
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'partial' || (channel.truncated && channel.status !== 'error'))) {
    notices.push(
      <Notice key="partial" tone="amber" title={t('Some channels were not read to the end')}>
        {t('A time or page limit was reached. The figures shown come only from the rows that were actually read; press Refresh to try again.')}
      </Notice>,
    );
  }
  if (dataset?.model?.status === 'insufficient') {
    notices.push(
      <Notice key="model" tone="amber" title={t('The model cannot learn a distinguishing term yet')}>
        {t('The corpus needs both low-rated and high-rated reviews. The volume that was read is still shown as it is.')}
      </Notice>,
    );
  }
  if (dataset && !dataset.model?.taxonomy) {
    notices.push(
      <Notice
        key="stale"
        tone="amber"
        title={t('This snapshot was analysed by the previous engine')}
        action={(
          <button type="button" onClick={() => runRecompute(activeWorkspace)} disabled={Boolean(syncing)} className="btn btn-secondary btn-xs">
            {t('Re-run analysis')}
          </button>
        )}
      >
        {t('Topic names in it can still contain ordinary words lifted from review text. Re-running rebuilds every label from the domain dictionary using the reviews already stored here — nothing is pulled again and no review text is altered.')}
      </Notice>,
    );
  }

  let content = null;
  if (booting) {
    content = <BootScreen />;
  } else if (view === 'compare') {
    // Lintas project: tidak butuh workspace aktif, karena matriksnya membaca beberapa
    // snapshot sekaligus dari sisi server.
    content = <CompareView workspaces={workspaces} onToast={pushToast} />;
  } else if (!activeWorkspace) {
    content = <Welcome onAdd={() => setDialogOpen(true)} />;
  } else if (view === 'limits') {
    content = <LimitMonitor dataset={dataset} workspace={activeWorkspace} onToast={pushToast} />;
  } else if (loadingDataset) {
    content = <BootScreen label={t('Reading the stored snapshot')} />;
  } else if (!dataset && (activeSyncing || startingId === activeWorkspace.id)) {
    content = <SyncScreen workspace={activeWorkspace} progress={syncProgress} />;
  } else if (!dataset || dataset.reviews.length === 0) {
    content = (
      <WorkspaceEmpty
        workspace={activeWorkspace}
        dataset={dataset}
        datasetError={datasetError}
        syncError={syncError}
        syncing={activeSyncing}
        onRefresh={() => runSync(activeWorkspace, { force: true })}
      />
    );
  } else if (view === 'reviews') {
    content = <ReviewsView dataset={dataset} />;
  } else if (view === 'method') {
    content = <ModelView dataset={dataset} workspace={activeWorkspace} db={dbStatus} onExport={handleExport} />;
  } else {
    content = <Overview dataset={dataset} workspace={activeWorkspace} />;
  }

  const hasData = Boolean(activeWorkspace && dataset && dataset.reviews.length > 0);
  const snapshot = dataset?.summary || activeWorkspace?.snapshot || null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        view={view}
        onView={setView}
        snapshot={snapshot}
        workspaceCount={workspaces.length}
        hasData={hasData}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          workspaces={workspaces}
          activeId={activeId}
          activeWorkspace={activeWorkspace}
          syncing={Boolean(syncing)}
          syncProgress={syncProgress}
          onSwitch={switchWorkspace}
          onAdd={() => setDialogOpen(true)}
          onRefresh={() => runSync(activeWorkspace, { force: true })}
          onDelete={() => setConfirmOpen(true)}
        />

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 outline-none">
          {storageIssue && (
            <div className="pb-3">
              <StorageWarning
                message={storageIssue.message}
                title={storageIssue.title || undefined}
                canExport={Boolean(activeWorkspace && dataset)}
                onExport={handleExport}
              />
            </div>
          )}
          {activeWorkspace && <WorkspaceHeader workspace={activeWorkspace} dataset={dataset} view={view} onView={setView} syncing={activeSyncing} syncStartedAt={syncing?.startedAt || null} />}
          {notices.length > 0 && <div className="pb-3">{notices}</div>}
          {activeWorkspace && (
            <div id={`panel-${view}`} tabIndex={-1} className="min-w-0 outline-none">
              <div className="space-y-3">{content}</div>
            </div>
          )}
          {!activeWorkspace && content}
        </main>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <WorkspaceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        existingLabels={existingLabels}
        onSave={handleCreate}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        workspace={activeWorkspace}
        busy={deleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
