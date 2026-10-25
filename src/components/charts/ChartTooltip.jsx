export function ChartTooltip({ x, y, width, title, rows, visible }) {
  if (!visible) return null;
  const left = Math.max(92, Math.min(x, Math.max(92, width - 92)));
  const placeBelow = y < 135;
  return (
    <div
      className="pointer-events-none absolute z-20 w-max min-w-[150px] max-w-[230px] rounded-xl border border-ink/10 bg-ink/95 px-3 py-2.5 text-paper-50 shadow-lift backdrop-blur-sm"
      style={{
        left,
        top: placeBelow ? y + 14 : y - 10,
        transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      role="presentation"
    >
      <p className="text-[11px] font-bold leading-snug text-paper-50">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-[10.5px]">
            <span className="flex items-center gap-1.5 text-paper-50/65">
              {row.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.color }} />}
              {row.label}
            </span>
            <span className="num font-semibold text-paper-50/95">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
