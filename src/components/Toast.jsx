import { useEffect } from 'react';
import { IconAlert, IconCheck, IconInfo, IconX } from './icons.jsx';

const TONES = {
  success: { icon: IconCheck, ring: 'border-teal/30', badge: 'bg-teal text-paper-50' },
  error: { icon: IconAlert, ring: 'border-coral/35', badge: 'bg-coral text-paper-50' },
  warning: { icon: IconAlert, ring: 'border-amber/35', badge: 'bg-amber text-paper-50' },
  info: { icon: IconInfo, ring: 'border-line-strong', badge: 'bg-ink text-paper-50' },
};

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (toast.sticky) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === 'error' ? 9000 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const tone = TONES[toast.tone] || TONES.info;
  const Icon = tone.icon;
  return (
    <div className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border ${tone.ring} bg-paper-50 p-3.5 shadow-lift animate-fade-up sm:w-[380px]`}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.badge}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-[13px] font-bold text-ink">{toast.title}</p>}
        <p className={`text-[12.5px] leading-relaxed text-ink-soft ${toast.title ? 'mt-0.5' : ''}`}>{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper-200 hover:text-ink"
        aria-label="Tutup notifikasi"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}
