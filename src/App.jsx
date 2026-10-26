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
import { syncWorkspace } from './lib/api.js';
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
    setSyncing({ workspaceId: workspace.id, force });
    setSyncError(null);
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
    }
  }, [applyDataset, applyWorkspaces, pushToast]);

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
    content = <SyncScreen workspace={activeWorkspace} />;
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
          {activeWorkspace && <WorkspaceHeader workspace={activeWorkspace} dataset={dataset} view={view} onView={setView} syncing={activeSyncing} />}
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
