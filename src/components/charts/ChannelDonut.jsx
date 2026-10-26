import { useMemo, useState } from 'react';
import { formatNumber, formatPercent, platformLabel } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { StoreMark } from '../Brand.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { SERIES_COLORS, storeColor } from './palette.js';

const SIZE = 148;
const STROKE = 17;

function polar(cx, cy, radius, angle) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function arcPath(cx, cy, radius, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, radius, startAngle);
  const [x2, y2] = polar(cx, cy, radius, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function ChannelDonut({ platforms }) {
  const [hovered, setHovered] = useState(null);
  const data = Array.isArray(platforms) ? platforms.filter(item => item.total > 0) : [];
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const center = SIZE / 2;
  const radius = center - STROKE / 2 - 6;

  const segments = useMemo(() => {
    if (!total) return [];
    let angle = -Math.PI / 2;
    const gap = data.length > 1 ? 0.05 : 0;
    return data.map(item => {
      const sweep = (item.total / total) * Math.PI * 2;
      const segment = { ...item, start: angle + gap / 2, end: angle + sweep - gap / 2, share: (item.total / total) * 100, color: storeColor(item.id) };
      angle += sweep;
      return segment;
    });
  }, [data, total]);

  const active = hovered != null ? segments.find(segment => segment.id === hovered) : null;

  if (!total) {
    return (
      <ChartFrame label="Channel split">
        <EmptyState compact icon={IconGrid} title="No channel read yet" body="This snapshot has no review on any channel." />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame label="Channel split" meta={`${data.length} channels`} className="h-full">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`Split across ${data.length} channels, ${formatNumber(total)} reviews in total.`}>
            <title>Review split per channel</title>
            <circle cx={center} cy={center} r={radius} fill="none" stroke={SERIES_COLORS.lineSoft} strokeWidth={STROKE} />
            {segments.map(segment => {
              const isActive = hovered === segment.id;
              const shared = {
                fill: 'none',
                stroke: segment.color,
                strokeWidth: isActive ? STROKE + 4 : STROKE,
                tabIndex: 0,
                role: 'img',
                'aria-label': `${platformLabel(segment.id)}: ${formatNumber(segment.total)} reviews (${formatPercent(segment.total, total, 1)})`,
                onMouseEnter: () => setHovered(segment.id),
                onMouseLeave: () => setHovered(current => (current === segment.id ? null : current)),
                onFocus: () => setHovered(segment.id),
                onBlur: () => setHovered(current => (current === segment.id ? null : current)),
                opacity: hovered == null || isActive ? 1 : 0.35,
              };
              return segments.length === 1
                ? <circle key={segment.id} cx={center} cy={center} r={radius} {...shared} className="chart-hit transition-all duration-150" />
                : <path key={segment.id} d={arcPath(center, center, radius, segment.start, segment.end)} strokeLinecap="round" {...shared} className="chart-hit transition-all duration-150" />;
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="metric text-xl">{active ? formatPercent(active.total, total, 0) : formatNumber(total)}</span>
            <span className="mt-0.5 max-w-[92px] truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {active ? platformLabel(active.id) : 'total'}
            </span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {segments.map(segment => (
            <li
              key={segment.id}
              onMouseEnter={() => setHovered(segment.id)}
              onMouseLeave={() => setHovered(current => (current === segment.id ? null : current))}
              className={`rounded border px-2 py-1.5 transition ${hovered === segment.id ? 'border-slate-700 bg-slate-800/60' : 'border-transparent bg-slate-900/40'}`}
            >
              <div className="flex items-center gap-2">
                <StoreMark store={segment.id} size={18} tone="quiet" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">{platformLabel(segment.id)}</span>
                <span className="num text-[11px] font-bold text-slate-100">{formatNumber(segment.total)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full rounded-full" style={{ width: `${segment.share}%`, backgroundColor: segment.color }} />
                </span>
                <span className="num w-10 text-right text-[10px] text-slate-400">{formatPercent(segment.total, total)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
