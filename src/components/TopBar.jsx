import { LogoMark } from './Brand.jsx';
import { Progress } from './Progress.jsx';
import { IconChevronDown, IconPlus, IconRefresh, IconTrash } from './icons.jsx';
import { formatNumber } from '../lib/format.js';

function Spinner({ size = 13 }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function TopBar({ workspaces, activeId, activeWorkspace, syncing, onSwitch, onAdd, onRefresh, onDelete }) {
  const hasWorkspace = Boolean(activeWorkspace);
  const snapshot = activeWorkspace?.snapshot || null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="flex h-[52px] items-center gap-2 px-3 sm:px-4">
        <span className="lg:hidden">
          <LogoMark size={24} />
        </span>

        <div className="group relative h-8 min-w-0 max-w-[320px] flex-1 rounded-md border border-slate-800 bg-slate-900/70 transition focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/25 hover:border-slate-700">
          <div className="pointer-events-none flex h-full items-center gap-2 px-2.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/80" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold leading-tight text-slate-100">
                {hasWorkspace ? activeWorkspace.label : 'No analysis yet'}
              </span>
              {hasWorkspace && snapshot?.reviews != null && (
                <span className="num block text-[10px] leading-tight text-slate-400">
                  {formatNumber(snapshot.reviews)} reviews · {activeWorkspace.entity}
                </span>
              )}
            </span>
            <IconChevronDown size={14} className="shrink-0 text-slate-400 transition group-hover:text-slate-300" />
          </div>
          <select
            aria-label="Select workspace"
            value={activeId || ''}
            onChange={event => onSwitch(event.target.value || null)}
            disabled={workspaces.length === 0}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md text-transparent opacity-0 disabled:cursor-not-allowed"
          >
            {workspaces.length === 0 && <option value="">No analysis yet</option>}
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label} — {workspace.entity}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {syncing && (
            <span className="hidden items-center gap-1.5 rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
              pulling data
            </span>
          )}
          <button type="button" onClick={onAdd} disabled={syncing} className="btn btn-primary" title="Add a new analysis">
            <IconPlus size={14} />
            <span className="hidden sm:inline">Add analysis</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!hasWorkspace || syncing}
            className="btn btn-secondary"
            title="Refresh data (force sync, skips the one-hour cache)"
          >
            {syncing ? <Spinner /> : <IconRefresh size={14} />}
            <span className="hidden md:inline">{syncing ? 'Pulling…' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!hasWorkspace || syncing}
            className="icon-btn hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            aria-label="Delete this analysis"
            title="Delete this analysis"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
      {syncing && <Progress label="Reading sources" />}
    </header>
  );
}
