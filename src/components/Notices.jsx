import { IconAlert, IconDownload, IconInfo } from './icons.jsx';

const TONES = {
  amber: { wrap: 'border-neu/25 bg-neu/[0.07]', icon: 'text-neu', title: 'text-neu' },
  coral: { wrap: 'border-neg/25 bg-neg/[0.07]', icon: 'text-neg', title: 'text-neg' },
  ink: { wrap: 'border-slate-800 bg-slate-900/70', icon: 'text-slate-400', title: 'text-slate-200' },
};

export function Notice({ tone = 'amber', title, children, action, live = false }) {
  const style = TONES[tone] || TONES.amber;
  const Icon = tone === 'ink' ? IconInfo : IconAlert;
  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-start ${style.wrap}`} role={live ? 'alert' : 'status'}>
      <Icon size={14} className={`mt-0.5 shrink-0 ${style.icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className={`text-[11px] font-bold ${style.title}`}>{title}</p>}
        <div className={`text-[11px] leading-relaxed text-slate-400 ${title ? 'mt-0.5' : ''}`}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StorageWarning({ message, onExport, canExport, title = 'Part of the stored data was skipped' }) {
  return (
    <Notice
      tone="amber"
      title={title}
      action={canExport ? (
        <button type="button" onClick={onExport} className="btn btn-secondary btn-xs">
          <IconDownload size={12} /> Export
        </button>
      ) : null}
    >
      {message}
    </Notice>
  );
}
