export function EmptyState({ icon: Icon, title, body, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? 'min-h-[112px] py-4' : 'min-h-[150px] py-6'}`}>
      {Icon && (
        <span className="mb-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400">
          <Icon size={15} />
        </span>
      )}
      <p className="text-[13px] font-bold text-slate-200">{title}</p>
      {body && <p className="mt-1 max-w-[38ch] text-[11px] leading-relaxed text-slate-400 text-balance">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
