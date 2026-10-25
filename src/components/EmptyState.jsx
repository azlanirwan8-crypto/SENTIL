export function EmptyState({ icon: Icon, title, body, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'min-h-[180px] px-6 py-8' : 'min-h-[260px] px-6 py-12'}`}>
      {Icon && (
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line/80 bg-paper-100 text-ink-muted">
          <Icon size={20} />
        </span>
      )}
      <p className="font-display text-[19px] font-semibold leading-snug text-ink">{title}</p>
      {body && <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted text-pretty">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
