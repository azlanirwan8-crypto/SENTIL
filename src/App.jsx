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
const JOB_BUDGET_MS = 8 * 60_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Menyambungkan penarikan yang berjalan di latar belakang: tunggu status selesai, lalu baca
// kembali dataset yang baru disimpan. Yang dikembalikan berbentuk sama seperti jawaban penarikan
// biasa, jadi sisa halaman tidak perlu tahu ada dua jalur.
async function awaitPullJob(workspaceId, { pollingMs = JOB_POLL_MS, budgetMs = JOB_BUDGET_MS, jobId = null, onProgress = null } = {}) {
  const startedAt = Date.now();
  let run = null;
  while (Date.now() - startedAt < budgetMs) {
    await sleep(pollingMs);
    let state;
    try {
      // jobId dikirim supaya server tahu baris riwayat mana yang milik penarikan ini; tanpa itu
      // polling pertama bisa membaca cap penarikan sebelumnya dan melaporkannya sebagai selesai.
      state = await fetchJob(workspaceId, jobId);
    } catch (error) {
      return { ok: false, reason: error.message || 'The pull status could not be read.' };
    }
    if (state.run) run = state.run;
    if (state.progress && typeof onProgress === 'function') onProgress(state.progress, run);
    if (state.finished) break;
  }
  if (!run || run.status === 'running' || run.status === 'storing') {
    return { ok: false, stillRunning: true, reason: 'The pull is still running on the server. What is on screen is still the last complete snapshot — check again in a moment.' };
  }
  if (run.status === 'error') return { ok: false, reason: run.error || 'The pull failed on the server.' };
  if (run.status === 'abandoned') return { ok: false, reason: run.error || 'The server stopped this pull at its platform time limit. Nothing was written and the stored snapshot is unchanged.' };
  if (run.status === 'unchanged') return { ok: true, unchanged: true, run };
  const loaded = await loadDataset(workspaceId);
  if (loaded.error) return { ok: false, reason: loaded.error };
  if (!loaded.dataset) return { ok: false, reason: 'The finished pull could not be read back from the database.' };
  return { ok: true, data: loaded.dataset, db: loaded.db, run };
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
  const [syncing, setSyncing] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [toasts, setToasts] = useState([]);

  const workspacesRef = useRef([]);
  const activeIdRef = useRef(null);
  const datasetRef = useRef(null);
  const syncingRef = useRef(false);
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
      if (cancelled || syncingRef.current || (typeof document !== 'undefined' && document.hidden)) return;
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
      pushToast('A newer snapshot was pulled on the server and is now on screen.', 'info', 'Data refreshed');
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
      pushToast('No source is active yet. Enable at least one channel for this analysis.', 'error');
      return;
    }
    syncingRef.current = true;
    setSyncing({ workspaceId: workspace.id, force, startedAt: Date.now() });
    setSyncProgress(null);
    setSyncError(null);
    try {
      let data = await syncWorkspace({ workspace, entity: workspace.entity, playAppId, appleAppId, social, force });
      if (data.accepted) {
        // Jawaban pertama hanya berisi "pekerjaan diterima". Data datang setelah pekerjaan di
        // server selesai, dibaca ulang dari database lewat status pekerjaan.
        pushToast('The pull is running on the server. Keep browsing; this screen updates when it finishes.', 'info', 'Pull moved to the background');
        const awaited = await awaitPullJob(workspace.id, { pollingMs: data.pollingMs, jobId: data.jobId, onProgress: setSyncProgress });
        if (!awaited.ok) {
          setSyncError(awaited.reason);
          pushToast(awaited.reason, awaited.stillRunning ? 'warning' : 'error', awaited.stillRunning ? 'Still running' : 'Pull did not complete');
          return;
        }
        if (awaited.unchanged) {
          const checkedAt = new Date().toISOString();
          pushToast('The sources answered and nothing new came in since the stored snapshot, so no analysis was repeated and nothing was overwritten.', 'info', 'No new reviews');
          applyWorkspaces(workspacesRef.current.map(item => (item.id === workspace.id ? { ...item, lastSyncedAt: checkedAt, updatedAt: checkedAt } : item)));
          return;
        }
        data = {
          ...awaited.data,
          db: awaited.db,
          stored: {
            ok: true,
            revision: awaited.data.stored?.revision ?? null,
            rows: awaited.data.stored?.reviewCount ?? awaited.data.reviews.length,
            elapsedMs: awaited.run?.elapsedMs ?? null,
          },
        };
      }
      if (data.db) setDbStatus(data.db);
      const channels = Array.isArray(data.channels) ? data.channels : [];
      const allFailed = channels.length > 0 && channels.every(channel => channel.status === 'error');
      const anyFailed = channels.some(channel => channel.status === 'error');
      const anyPartial = channels.some(channel => channel.status === 'partial' || channel.truncated);
      const stored = data.stored || null;
      const previous = datasetRef.current;
      const preservePrevious = previous?.reviews?.length > 0 && (allFailed || (data.reviews.length === 0 && anyFailed));

      if (preservePrevious) {
        setSyncError('The last pull returned no reviews and at least one channel failed. The previous snapshot is still in use; no number was overwritten.');
        pushToast('Pull incomplete. The previous snapshot was kept.', 'warning', 'Old data not deleted');
        if (stored && stored.ok === false) pushToast(stored.reason, 'warning', 'Not stored in the database');
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

      if (allFailed) pushToast('Every channel failed to read. No number was invented.', 'error', 'Pull failed');
      else if (data.reviews.length === 0) pushToast('Sources responded, but no written review came back.', 'warning', 'Zero reviews read');
      else if (anyFailed || anyPartial) pushToast(`${formatNumber(data.reviews.length)} reviews read; some channels are still incomplete.`, 'warning', 'Partial result');
      else pushToast(`${formatNumber(data.reviews.length)} reviews read; the corpus model was refreshed.`, 'success', 'Snapshot ready');
      if (stored && stored.ok === true) {
        pushToast(`${formatNumber(stored.rows)} review rows saved as revision ${stored.revision}.`, 'success', 'Saved to the database');
      } else if (stored && stored.ok === false) {
        pushToast(stored.reason, 'warning', 'Not stored in the database');
      }
    } catch (error) {
      setSyncError(error.message || 'The pull failed.');
      pushToast(error.message || 'The pull failed.', 'error', 'Pull failed');
    } finally {
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
      pushToast(result.message || `${formatNumber(result.rows || 0)} stored reviews were re-analysed.`, 'success', 'Analysis rebuilt');
      const loaded = await loadDataset(workspace.id);
      if (loaded.dataset && activeIdRef.current === workspace.id) {
        applyDataset(loaded.dataset);
        setDatasetError(null);
      } else if (loaded.error) {
        pushToast(loaded.error, 'warning', 'Could not read the new snapshot');
      }
    } catch (error) {
      setSyncError(error.message || 'Re-running the analysis failed.');
      pushToast(error.message || 'Re-running the analysis failed.', 'error', 'Re-run failed');
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
    if (activeIdRef.current !== id) return;
    if (loaded.db) setDbStatus(loaded.db);
    applyDataset(loaded.dataset);
    setDatasetError(loaded.error);
    setLoadingDataset(false);
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
    const saved = await saveWorkspace(workspace);
    if (saved.db) setDbStatus(saved.db);
    if (!saved.saved) pushToast(saved.error, 'warning', 'Not stored in the database');
    runSync(workspace, { force: false });
  }

  async function handleDelete() {
    const target = activeIdRef.current;
    if (!target) return;
    const result = await deleteWorkspace(target);
    if (!result.deleted) {
      pushToast(result.error, 'error', 'Delete not confirmed');
      setConfirmOpen(false);
      return;
    }
    const next = workspacesRef.current.filter(workspace => workspace.id !== target);
    const nextActive = next[0]?.id || null;
    applyWorkspaces(next);
    applyActive(nextActive);
    applyDataset(null);
    setDatasetError(null);
    setSyncError(null);
    setView('dashboard');
    setConfirmOpen(false);
    if (nextActive) {
      const loaded = await loadDataset(nextActive);
      if (activeIdRef.current !== nextActive) return;
      if (loaded.db) setDbStatus(loaded.db);
      applyDataset(loaded.dataset);
      setDatasetError(loaded.error);
    }
    pushToast('This workspace and its stored reviews were deleted from the database.', 'success', 'Analysis deleted');
  }

  function handleExport() {
    if (!activeWorkspace || !dataset) {
      pushToast('There is no snapshot to export yet.', 'warning');
      return;
    }
    const ok = exportWorkspace(activeWorkspace, dataset);
    if (ok) pushToast('The full snapshot was exported as JSON.', 'success', 'Export complete');
    else pushToast('The export could not run in this browser.', 'error');
  }

  const notices = [];
  if (dbStatus && dbStatus.enabled === false) {
    notices.push(
      <Notice key="db-off" tone="amber" title="The database is not configured on this server" live>
        {dbStatus.reason} Nothing is saved between visits until it is set up, so the analyses you see here live in this session only.
      </Notice>,
    );
  } else if (dbStatus && dbStatus.reachable === false) {
    notices.push(
      <Notice key="db-down" tone="coral" title="The database could not be reached" live>
        {dbStatus.reason} Pulls still read the live sources, but nothing new is stored until the database answers again.
      </Notice>,
    );
  }
  if (syncError) {
    notices.push(
      <Notice key="sync" tone="coral" title="Last pull failed" live>
        {syncError}
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'error')) {
    const failed = dataset.channels.filter(channel => channel.status === 'error').map(channel => platformLabel(channel.id));
    notices.push(
      <Notice key="failed" tone="coral" title={`${failed.join(', ')} could not be read`}>
        This analysis uses only the channels that succeeded. No stand-in numbers and no old data were mixed into the new snapshot.
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'partial' || (channel.truncated && channel.status !== 'error'))) {
    notices.push(
      <Notice key="partial" tone="amber" title="Some channels were not read to the end">
        A time or page limit was reached. The figures shown come only from the rows that were actually read; press Refresh to try again.
      </Notice>,
    );
  }
  if (dataset?.model?.status === 'insufficient') {
    notices.push(
      <Notice key="model" tone="amber" title="The model cannot learn a distinguishing term yet">
        The corpus needs both low-rated and high-rated reviews. The volume that was read is still shown as it is.
      </Notice>,
    );
  }
  if (dataset && !dataset.model?.taxonomy) {
    notices.push(
      <Notice
        key="stale"
        tone="amber"
        title="This snapshot was analysed by the previous engine"
        action={(
          <button type="button" onClick={() => runRecompute(activeWorkspace)} disabled={Boolean(syncing)} className="btn btn-secondary btn-xs">
            Re-run analysis
          </button>
        )}
      >
        Topic names in it can still contain ordinary words lifted from review text. Re-running rebuilds every label from
        the domain dictionary using the reviews already stored here — nothing is pulled again and no review text is altered.
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
    content = <BootScreen label="Reading the stored snapshot" />;
  } else if (!dataset && activeSyncing) {
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
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
