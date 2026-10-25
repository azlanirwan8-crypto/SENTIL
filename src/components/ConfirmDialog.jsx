import { DialogShell } from './Dialog.jsx';
import { IconTrash } from './icons.jsx';

export function ConfirmDeleteDialog({ open, workspace, onClose, onConfirm }) {
  return (
    <DialogShell open={open} onClose={onClose} labelledBy="delete-title" describedBy="delete-desc" className="sm:max-w-[460px]">
      <div className="p-6 sm:p-7">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-coral/25 bg-coral-soft/60 text-coral-deep">
          <IconTrash size={19} />
        </span>
        <h2 id="delete-title" className="mt-4 text-[26px] leading-tight text-ink">Hapus analisis ini?</h2>
        <p id="delete-desc" className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">{workspace?.label || 'Analisis ini'}</span> beserta salinan data ulasan dan modelnya akan dihapus dari peramban ini. Sumber publik di Google Play dan App Store tidak berubah.
        </p>
        <p className="mt-3 rounded-xl border border-line/70 bg-paper-100/70 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
          Tindakan ini tidak dapat dibatalkan. Ekspor JSON dari tab Metode &amp; data bila kamu masih memerlukannya.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>Hapus permanen</button>
        </div>
      </div>
    </DialogShell>
  );
}
