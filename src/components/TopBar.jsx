import { LogoMark, Wordmark } from './Brand.jsx';
import { IconChevronDown, IconLayers, IconPlus, IconRefresh, IconTrash } from './icons.jsx';

function Spinner({ size = 15 }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function TopBar({
  workspaces,
  activeId,
  activeWorkspace,
  syncing,
  onSwitch,
  onAdd,
  onRefresh,
  onDelete,
}) {
  const hasWorkspace = Boolean(activeWorkspace);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] max-w-[1440px] items-center gap-2.5 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={36} />
          <span className="hidden min-w-0 lg:block">
            <Wordmark />
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <div
            className="group relative min-w-0 flex-1 rounded-[14px] border border-line bg-paper-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,.55)] transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15 hover:border-line-strong sm:max-w-[300px]"
            title={hasWorkspace ? `${activeWorkspace.label} — ${activeWorkspace.entity}` : 'Belum ada analisis tersimpan'}
          >
            <div className="pointer-events-none flex h-[48px] items-center gap-2.5 px-3.5" aria-hidden="true">
              <IconLayers size={16} className="hidden shrink-0 text-ink-faint sm:block" />
              <span className="min-w-0 flex-1">
                <span className="block text-[8.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">Ruang analisis</span>
                <span className="mt-0.5 block truncate text-[13px] font-bold leading-tight text-ink">
                  {hasWorkspace ? activeWorkspace.label : 'Belum ada analisis'}
                </span>
              </span>
              <IconChevronDown size={15} className="shrink-0 text-ink-faint transition group-hover:text-ink" />
            </div>
            <select
              aria-label="Pilih ruang analisis"
              value={activeId || ''}
              onChange={event => onSwitch(event.target.value || null)}
              disabled={workspaces.length === 0}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[14px] text-transparent opacity-0 disabled:cursor-not-allowed"
            >
              {workspaces.length === 0 && <option value="">Belum ada analisis</option>}
              {workspaces.map(workspace => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.label} — {workspace.entity}
                </option>
              ))}
            </select>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onAdd}
              disabled={syncing}
              className="btn btn-primary px-3 sm:px-4"
              aria-label="Tambah analisis baru"
              title="Tambah analisis baru"
            >
              <IconPlus size={16} />
              <span className="hidden xl:inline">Tambah analisis</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={!hasWorkspace || syncing}
              className="btn btn-soft px-3 sm:px-4"
              aria-label="Perbarui data dengan force sync"
              title="Perbarui data (force sync, lewati cache satu jam)"
            >
              {syncing ? <Spinner /> : <IconRefresh size={16} />}
              <span className="hidden lg:inline">{syncing ? 'Menarik…' : 'Perbarui'}</span>
            </button>
            <span className="mx-0.5 hidden h-6 w-px bg-line/90 sm:block" aria-hidden="true" />
            <button
              type="button"
              onClick={onDelete}
              disabled={!hasWorkspace || syncing}
              className="icon-btn border-transparent text-ink-faint hover:border-coral/25 hover:bg-coral-soft/60 hover:text-coral-deep"
              aria-label="Hapus analisis ini"
              title="Hapus analisis ini"
            >
              <IconTrash size={16} />
            </button>
          </div>
        </div>
      </div>
      {syncing && (
        <div className="absolute inset-x-0 bottom-[-1px] h-[2px] overflow-hidden bg-line/40">
          <div className="progress-indeterminate h-full w-full" />
        </div>
      )}
    </header>
  );
}
