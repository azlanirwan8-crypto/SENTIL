import { useCallback, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar.jsx';
import { Welcome } from './components/Welcome.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { Overview } from './components/Overview.jsx';
import { ReviewsView } from './components/ReviewsView.jsx';
import { ModelView } from './components/ModelView.jsx';
import { WorkspaceDialog } from './components/WorkspaceDialog.jsx';
import { ConfirmDeleteDialog } from './components/ConfirmDialog.jsx';
import { SyncScreen, WorkspaceEmpty } from './components/WorkspaceStates.jsx';
import { Notice, StorageWarning } from './components/Notices.jsx';
import { ToastStack } from './components/Toast.jsx';
import { syncWorkspace } from './lib/api.js';
import { exportWorkspace } from './lib/export.js';
import { formatNumber, platformLabel } from './lib/format.js';
import {
  createWorkspaceId,
  persistActiveId,
  persistDataset,
  persistWorkspaces,
  readActiveId,
  readDataset,
  readWorkspaces,
  removeDataset,
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
  const [boot] = useState(() => {
    const meta = readWorkspaces();
    const stored = readActiveId();
    const activeId = meta.workspaces.find(workspace => workspace.id === stored)?.id || meta.workspaces[0]?.id || null;
    const data = activeId ? readDataset(activeId) : { dataset: null, error: null };
    return {
      workspaces: meta.workspaces,
      metaError: meta.error,
      activeId,
      dataset: data.dataset,
      datasetError: data.error,
    };
  });

  const [workspaces, setWorkspaces] = useState(boot.workspaces);
  const [activeId, setActiveId] = useState(boot.activeId);
  const [dataset, setDataset] = useState(boot.dataset);
  const [datasetError, setDatasetError] = useState(boot.datasetError);
  const [storageIssue, setStorageIssue] = useState(boot.metaError);
  const [view, setView] = useState('dashboard');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [toasts, setToasts] = useState([]);

  const workspacesRef = useRef(boot.workspaces);
  const activeIdRef = useRef(boot.activeId);
  const datasetRef = useRef(boot.dataset);
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
    const saved = persistWorkspaces(next);
    if (!saved.ok) setStorageIssue(saved.error);
  }, []);

  const runSync = useCallback(async (workspace, { force = false } = {}) => {
    if (!workspace || syncingRef.current) return;
    const playAppId = workspace.stores?.play?.appId || null;
    const appleAppId = workspace.stores?.appstore?.appId || null;
    if (!playAppId && !appleAppId) {
      pushToast('Workspace ini belum memiliki identitas toko. Buat analisis baru dari hasil pencarian.', 'error');
      return;
    }
    syncingRef.current = true;
    setSyncing({ workspaceId: workspace.id, force });
    setSyncError(null);
    try {
      const data = await syncWorkspace({ entity: workspace.entity, playAppId, appleAppId, force });
      const channels = Array.isArray(data.channels) ? data.channels : [];
      const allFailed = channels.length > 0 && channels.every(channel => channel.status === 'error');
      const anyFailed = channels.some(channel => channel.status === 'error');
      const anyPartial = channels.some(channel => channel.status === 'partial' || channel.truncated);
      const previous = readDataset(workspace.id).dataset;
      const preservePrevious = previous?.reviews?.length > 0 && (allFailed || (data.reviews.length === 0 && anyFailed));

      if (preservePrevious) {
        setSyncError('Penarikan terakhir tidak mengembalikan ulasan dan ada kanal yang gagal. Snapshot sebelumnya tetap dipakai; tidak ada angka yang ditimpa.');
        pushToast('Penarikan tidak lengkap. Snapshot sebelumnya dipertahankan.', 'warning', 'Data lama tidak dihapus');
        return;
      }

      const saved = persistDataset(workspace.id, data);
      if (!saved.ok) setStorageIssue(saved.error);
      if (activeIdRef.current === workspace.id) {
        datasetRef.current = data;
        setDataset(data);
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

      if (allFailed) pushToast('Semua kanal gagal dibaca. Tidak ada angka yang dibuat-buat.', 'error', 'Penarikan gagal');
      else if (data.reviews.length === 0) pushToast('Sumber terhubung, tetapi tidak ada ulasan tertulis yang dikembalikan.', 'warning', 'Nol ulasan terbaca');
      else if (anyFailed || anyPartial) pushToast(`${formatNumber(data.reviews.length)} ulasan terbaca; sebagian kanal belum lengkap.`, 'warning', 'Hasil parsial');
      else pushToast(`${formatNumber(data.reviews.length)} ulasan terbaca; model korpus diperbarui.`, 'success', 'Snapshot siap');
    } catch (error) {
      setSyncError(error.message || 'Penarikan gagal.');
      pushToast(error.message || 'Penarikan gagal.', 'error', 'Gagal menarik data');
    } finally {
      syncingRef.current = false;
      setSyncing(null);
    }
  }, [applyWorkspaces, pushToast]);

  function switchWorkspace(id) {
    if (!id || id === activeIdRef.current) return;
    const workspace = workspacesRef.current.find(item => item.id === id);
    if (!workspace) return;
    activeIdRef.current = id;
    setActiveId(id);
    persistActiveId(id);
    const loaded = readDataset(id);
    datasetRef.current = loaded.dataset;
    setDataset(loaded.dataset);
    setDatasetError(loaded.error);
    setSyncError(null);
    setView('dashboard');
  }

  function handleCreate(draft) {
    const now = new Date().toISOString();
    const workspace = {
      id: createWorkspaceId(),
      label: draft.label,
      entity: draft.entity,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: null,
      stores: draft.stores,
      snapshot: null,
    };
    applyWorkspaces([workspace, ...workspacesRef.current]);
    activeIdRef.current = workspace.id;
    setActiveId(workspace.id);
    persistActiveId(workspace.id);
    datasetRef.current = null;
    setDataset(null);
    setDatasetError(null);
    setSyncError(null);
    setView('dashboard');
    setDialogOpen(false);
    runSync(workspace, { force: false });
  }

  function handleDelete() {
    const target = activeIdRef.current;
    if (!target) return;
    const next = workspacesRef.current.filter(workspace => workspace.id !== target);
    const nextActive = next[0]?.id || null;
    removeDataset(target);
    applyWorkspaces(next);
    activeIdRef.current = nextActive;
    setActiveId(nextActive);
    persistActiveId(nextActive);
    const loaded = nextActive ? readDataset(nextActive) : { dataset: null, error: null };
    datasetRef.current = loaded.dataset;
    setDataset(loaded.dataset);
    setDatasetError(loaded.error);
    setSyncError(null);
    setView('dashboard');
    setConfirmOpen(false);
    pushToast('Workspace dan salinan datanya dihapus dari peramban ini.', 'success', 'Analisis dihapus');
  }

  function handleExport() {
    if (!activeWorkspace || !dataset) {
      pushToast('Belum ada snapshot yang dapat diekspor.', 'warning');
      return;
    }
    const ok = exportWorkspace(activeWorkspace, dataset);
    if (ok) pushToast('Snapshot lengkap diekspor sebagai JSON.', 'success', 'Ekspor selesai');
    else pushToast('Ekspor gagal dijalankan di peramban ini.', 'error');
  }

  const notices = [];
  if (syncError) {
    notices.push(
      <Notice key="sync" tone="coral" title="Penarikan terakhir gagal" live>
        {syncError}
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'error')) {
    const failed = dataset.channels.filter(channel => channel.status === 'error').map(channel => platformLabel(channel.id));
    notices.push(
      <Notice key="failed" tone="coral" title={`${failed.join(', ')} tidak terbaca`}>
        Analisis ini hanya memakai kanal yang berhasil. Tidak ada angka pengganti atau data lama yang dicampur ke snapshot baru.
      </Notice>,
    );
  }
  if (dataset?.channels?.some(channel => channel.status === 'partial' || (channel.truncated && channel.status !== 'error'))) {
    notices.push(
      <Notice key="partial" tone="amber" title="Sebagian kanal belum selesai dibaca">
        Batas waktu atau halaman sumber tercapai. Angka yang tampil berasal dari bagian yang benar-benar terbaca; tekan Perbarui untuk mencoba lagi.
      </Notice>,
    );
  }
  if (dataset?.model?.status === 'insufficient') {
    notices.push(
      <Notice key="model" tone="amber" title="Model belum dapat belajar pembeda kata">
        Perlu ada ulasan berating rendah dan tinggi pada korpus yang sama. Volume yang terbaca tetap ditampilkan apa adanya.
      </Notice>,
    );
  }

  let content = null;
  if (!activeWorkspace) {
    content = <Welcome onAdd={() => setDialogOpen(true)} />;
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
    content = <ModelView dataset={dataset} workspace={activeWorkspace} onExport={handleExport} />;
  } else {
    content = <Overview dataset={dataset} workspace={activeWorkspace} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
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

      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 sm:px-6 lg:px-8">
        {storageIssue && (
          <div className="pt-5">
            <StorageWarning
              message={storageIssue}
              canExport={Boolean(activeWorkspace && dataset)}
              onExport={handleExport}
            />
          </div>
        )}
        {activeWorkspace && <WorkspaceHeader workspace={activeWorkspace} dataset={dataset} view={view} onView={setView} syncing={activeSyncing} />}
        {activeWorkspace && notices.length > 0 && <div className="mt-4 space-y-2.5">{notices}</div>}
        {activeWorkspace && (
          <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={-1} className="outline-none">
            {content}
          </div>
        )}
        {!activeWorkspace && content}
      </main>

      <footer className="border-t border-line/70 bg-paper-100/40">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-[10px] leading-relaxed text-ink-faint sm:px-6 lg:px-8">
          <span>Sentiment Intelligence · mesin korpus tanpa kamus · sumber ulasan publik Google Play &amp; App Store</span>
          <span>Tanpa API key · tanpa login · workspace tersimpan di peramban</span>
        </div>
      </footer>

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
