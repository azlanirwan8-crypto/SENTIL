import { DialogShell } from './Dialog.jsx';
import { IconTrash } from './icons.jsx';
import { t } from '../lib/i18n.js';

export function ConfirmDeleteDialog({ open, workspace, onClose, onConfirm }) {
  return (
    <DialogShell open={open} onClose={onClose} labelledBy="delete-title" describedBy="delete-desc" className="sm:max-w-[420px]">
      <div className="p-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neg/25 bg-neg/10 text-neg">
          <IconTrash size={15} />
        </span>
        <h2 id="delete-title" className="mt-3 text-[15px] font-extrabold tracking-tight text-slate-100">{t('Delete this analysis?')}</h2>
        <p id="delete-desc" className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          <span className="font-bold text-slate-200">{workspace?.label || t('This analysis')}</span> {t('along with its review copy and model is deleted from the server database. Public sources are untouched and this action cannot be undone.')}
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button>
          {/* Konfirmasi menutup layar seketika dan permintaan hapusnya berjalan di latar
              (src/App.jsx), jadi tidak ada keadaan menunggu di sini yang perlu dijaga tombolnya. */}
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <IconTrash size={12} />
            {t('Delete permanently')}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
