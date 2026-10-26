import { formatNumber, relativeTime } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';
import { MobileNav } from './Sidebar.jsx';
import { IconAlert, IconClock } from './icons.jsx';

export function WorkspaceHeader({ workspace, dataset, view, onView, syncing, syncStartedAt = null }) {
  const snapshot = dataset?.summary || null;
  const fetchedAt = dataset?.fetchedAt || null;
  // Jam berdenyut: "5 minutes ago" harus benar-benar menjadi "6 minutes ago" walaupun
  // tidak ada render lain yang lewat, dan penarikan yang sedang berjalan perlu menunjukkan
  // bahwa ia hidup, bukan sekadar label berkedip.
  const now = useNow(20000);
  const elapsed = syncing && syncStartedAt ? Math.max(0, Math.round((now - syncStartedAt) / 1000)) : null;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="max-w-[34ch] truncate text-[15px] font-extrabold tracking-tight text-slate-100">{workspace.label}</h1>
          <span className="text-[11px] text-slate-400">/ {workspace.entity}</span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          {dataset?.limits && dataset.limits.overall !== 'ok' && (
            <button
              type="button"
              onClick={() => onView('limits')}
              className={`pill transition hover:brightness-125 ${dataset.limits.overall === 'exhausted'
                ? 'border-neg/30 bg-neg/10 text-neg'
                : 'border-neu/30 bg-neu/10 text-neu'}`}
              title={dataset.limits.hint}
            >
              <IconAlert size={10} />
              source limits {dataset.limits.overall === 'exhausted' ? 'hit' : 'truncated'}
            </button>
          )}
          {syncing && (
            <span
              className="inline-flex items-center gap-1.5 rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-semibold text-accent"
              role="status"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" aria-hidden="true" />
              {elapsed === null ? 'refreshing' : `refreshing · ${elapsed}s`}
            </span>
          )}
          <span className="num">
            {snapshot ? `${formatNumber(snapshot.reviews)} reviews · ${formatNumber(snapshot.analyzed)} classified` : 'no snapshot yet'}
          </span>
          {fetchedAt && (
            <span className="inline-flex items-center gap-1 text-slate-400" title={`Snapshot pulled at ${new Date(fetchedAt).toISOString()}`}>
              <IconClock size={11} />
              as of {relativeTime(fetchedAt, now)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 lg:hidden">
        <MobileNav view={view} onView={onView} snapshot={snapshot} hasData={Boolean(dataset?.reviews?.length)} />
      </div>
    </div>
  );
}
