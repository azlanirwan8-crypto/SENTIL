export function Legend({ items, dense = false }) {
  return (
    <div className={`flex flex-wrap items-center ${dense ? 'gap-x-3 gap-y-1.5' : 'gap-x-4 gap-y-2'}`}>
      {items.map(item => (
        <span key={item.key || item.label} className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-ink-muted">
          <span
            className={`${item.shape === 'line' ? 'h-[2px] w-3.5 rounded-full' : 'h-2 w-2 rounded-full'}`}
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartFrame({ eyebrow, title, hint, legend, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`surface flex min-w-0 flex-col ${className}`} aria-labelledby={`chart-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-0 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h3 id={`chart-${title.replace(/\s+/g, '-').toLowerCase()}`} className="mt-1.5 text-[21px] leading-tight text-ink sm:text-[23px]">{title}</h3>
          {hint && <p className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">{hint}</p>}
        </div>
        {legend && <div className="shrink-0 pt-0.5">{legend}</div>}
      </header>
      <div className={`min-h-0 min-w-0 flex-1 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
