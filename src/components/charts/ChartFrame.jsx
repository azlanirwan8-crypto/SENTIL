export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {items.map(item => (
        <span key={item.key || item.label} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartFrame({ label, meta, legend, children, className = '', bodyClassName = '' }) {
  const id = `chart-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return (
    <section className={`card flex min-w-0 flex-col ${className}`} aria-labelledby={id}>
      <header className="flex min-h-[36px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-800/70 px-4 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 id={id} className="label truncate">{label}</h3>
          {meta && <span className="num truncate text-[10px] text-slate-400">{meta}</span>}
        </div>
        {legend && <div className="shrink-0">{legend}</div>}
      </header>
      <div className={`min-h-0 flex-1 p-3.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
