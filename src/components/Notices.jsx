import { IconAlert, IconDownload, IconInfo } from './icons.jsx';

const TONES = {
  amber: {
    wrapper: 'border-amber/25 bg-amber-soft/45',
    icon: 'bg-amber text-paper-50',
    title: 'text-amber-deep',
    body: 'text-ink-soft',
  },
  coral: {
    wrapper: 'border-coral/25 bg-coral-soft/45',
    icon: 'bg-coral text-paper-50',
    title: 'text-coral-deep',
    body: 'text-ink-soft',
  },
  ink: {
    wrapper: 'border-line/80 bg-paper-100/80',
    icon: 'bg-ink text-paper-50',
    title: 'text-ink',
    body: 'text-ink-muted',
  },
};

export function Notice({ tone = 'amber', title, children, action, live = false }) {
  const style = TONES[tone] || TONES.amber;
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start ${style.wrapper}`}
      role={live ? 'alert' : 'status'}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.icon}`}>
        {tone === 'ink' ? <IconInfo size={14} /> : <IconAlert size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className={`text-[12px] font-bold ${style.title}`}>{title}</p>}
        <div className={`text-[11.5px] leading-relaxed ${style.body} ${title ? 'mt-0.5' : ''}`}>{children}</div>
      </div>
      {action && <div className="shrink-0 sm:pt-0.5">{action}</div>}
    </div>
  );
}

export function StorageWarning({ message, onExport, canExport }) {
  return (
    <Notice
      tone="amber"
      title="Penyimpanan lokal bermasalah"
      action={canExport ? (
        <button type="button" onClick={onExport} className="btn btn-sm btn-outline">
          <IconDownload size={14} /> Ekspor JSON
        </button>
      ) : null}
    >
      {message}
    </Notice>
  );
}
