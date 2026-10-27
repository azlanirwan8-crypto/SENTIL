import { useEffect } from 'react';
import { IconAlert, IconCheck, IconInfo, IconX } from './icons.jsx';
import { t } from '../lib/i18n.js';

const TONES = {
  success: { icon: IconCheck, accent: 'text-pos', ring: 'border-pos/25' },
  error: { icon: IconAlert, accent: 'text-neg', ring: 'border-neg/30' },
  warning: { icon: IconAlert, accent: 'text-neu', ring: 'border-neu/25' },
  info: { icon: IconInfo, accent: 'text-slate-400', ring: 'border-slate-700' },
};

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (toast.sticky) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === 'error' ? 9000 : 5500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const tone = TONES[toast.tone] || TONES.info;
  const Icon = tone.icon;
  // String yang sudah masuk state dibaca ulang lewat tabel dua arah, jadi toast yang masih
  // tampil ikut berganti bahasa alih-alih membeku dalam bahasa saat ia dibuat.
  return (
    <div className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border ${tone.ring} bg-slate-900/97 p-2.5 shadow-xl shadow-black/50 backdrop-blur animate-scale-in sm:w-[340px]`}>
      <Icon size={14} className={`mt-0.5 shrink-0 ${tone.accent}`} />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-[11px] font-bold text-slate-100">{t(toast.title)}</p>}
        <p className={`text-[11px] leading-relaxed text-slate-400 ${toast.title ? 'mt-0.5' : ''}`}>{t(toast.message)}</p>
      </div>
      <button type="button" onClick={() => onDismiss(toast.id)} className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-200" aria-label={t('Dismiss notification')}>
        <IconX size={13} />
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}
