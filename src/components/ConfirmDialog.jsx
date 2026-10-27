import { DialogShell } from './Dialog.jsx';
import { IconTrash } from './icons.jsx';
import { t } from '../lib/i18n.js';

export function ConfirmDeleteDialog({ open, workspace, onClose, onConfirm, busy = false }) {
  return (
    <DialogShell open={open} onClose={onClose} labelledBy="delete-title" describedBy="delete-desc" className="sm:max-w-[420px]" dismissible={!busy}>
      <div className="p-4" aria-busy={busy}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neg/25 bg-neg/10 text-neg">
          <IconTrash size={15} />
        </span>
        <h2 id="delete-title" className="mt-3 text-[15px] font-extrabold tracking-tight text-slate-100">{t('Delete this analysis?')}</h2>
        <p id="delete-desc" className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
          <span className="font-bold text-slate-200">{workspace?.label || t('This analysis')}</span> {t('along with its review copy and model is deleted from the server database. Public sources are untouched and this action cannot be undone.')}
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('Cancel')}</button>
          {/* Penghapusan ditunggu di dalam dialog ini: tanpa keadaan sibuk, tombol tetap bisa
              dipakai sementara permintaan cascade masih jalan, dan layar hanya terlihat macet. */}
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy
              ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden="true" />
              : <IconTrash size={12} />}
            {busy ? t('Deleting…') : t('Delete permanently')}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
