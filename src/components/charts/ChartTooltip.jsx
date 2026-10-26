import { useLayoutEffect, useRef, useState } from 'react';

const PAD = 8;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Panelnya solid dan dijepit di dalam area chart. Selama ini panelnya transparan dengan
// backdrop-blur, jadi warna bar menembus teksnya, dan clamp horizontal memakai lebar dugaan
// sehingga tooltip bisa keluar dari kartu.
//
// `viewStart`/`viewWidth` adalah jendela scroll yang sedang terlihat. Chart yang lebih lebar
// dari kartunya digulir, jadi tooltip dijepit ke jendela itu — bukan ke lebar konten — supaya
// tidak pernah keluar dari kartu dan tidak pernah menambah lebar gulir palsu.
export function ChartTooltip({ x, y, width, height, viewStart = 0, viewWidth = 0, title, rows, visible }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const next = { width: node.offsetWidth, height: node.offsetHeight };
    setBox(current => (current.width === next.width && current.height === next.height ? current : next));
  }, [title, rows]);

  if (!visible || !Array.isArray(rows) || !rows.length) return null;

  const half = Math.max(box.width / 2, 70);
  const viewSpan = viewWidth || width;
  const minLeft = Math.max(half + PAD, viewStart + half + PAD);
  const maxLeft = Math.min(width - half - PAD, Math.max(minLeft, viewStart + viewSpan - half - PAD));
  const left = clamp(x, minLeft, maxLeft);
  const above = y - PAD - box.height > 0;
  const top = above ? y - 10 : clamp(y + 14, PAD, Math.max(PAD, (height || y + 140) - box.height - PAD));

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-20 w-max min-w-[136px] max-w-[220px] rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 shadow-lg shadow-black/60"
      style={{ left, top, transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' }}
      role="presentation"
    >
      <p className="text-[11px] font-bold leading-snug text-slate-100">{title}</p>
      <div className="mt-1.5 space-y-0.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-[10px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              {row.color && <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: row.color }} />}
              {row.label}
            </span>
            <span className="num font-semibold text-slate-200">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
