import { useMemo, useState } from 'react';
import { formatNumber, formatPercent, platformLabel } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconChart } from '../icons.jsx';
import { StoreMark } from '../Brand.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { useMeasure } from './useMeasure.js';
import { storeColor } from './palette.js';

const SIZE = 212;
const STROKE = 26;

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
  const [measureRef] = useMeasure(240);
  const [hovered, setHovered] = useState(null);
  const data = Array.isArray(platforms) ? platforms.filter(item => item.total > 0) : [];
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const center = SIZE / 2;
  const radius = center - STROKE / 2 - 10;

  const segments = useMemo(() => {
    if (!total) return [];
    let angle = -Math.PI / 2;
    const gap = data.length > 1 ? 0.035 : 0;
    return data.map(item => {
      const sweep = (item.total / total) * Math.PI * 2;
      const start = angle + gap / 2;
      const end = angle + sweep - gap / 2;
      angle += sweep;
      return { ...item, start, end, share: (item.total / total) * 100, color: storeColor(item.id) };
    });
  }, [data, total]);

  const active = hovered != null ? segments.find(segment => segment.id === hovered) : null;

  if (!total) {
    return (
      <ChartFrame eyebrow="02 · Sebaran kanal" title="Dari mana suara datang" hint="Jumlah ulasan per kanal sumber.">
        <EmptyState compact icon={IconChart} title="Belum ada kanal" body="Tidak ada ulasan terbaca pada kanal mana pun untuk analisis ini." />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame eyebrow="02 · Sebaran kanal" title="Dari mana suara datang" hint="Jumlah ulasan terbaca per kanal." className="h-full" bodyClassName="flex flex-col justify-between">
      <div ref={measureRef} className="flex flex-col items-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={segments.map(segment => `${platformLabel(segment.id)} ${formatNumber(segment.total)} ulasan (${formatPercent(segment.total, total)})`).join(', ')}>
            <title>Sebaran ulasan per kanal</title>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#E9E2D3" strokeWidth={STROKE} />
            {segments.map(segment => {
              const isActive = hovered === segment.id;
              if (segments.length === 1) {
                return (
                  <circle
                    key={segment.id}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={isActive ? STROKE + 6 : STROKE}
                    tabIndex={0}
                    onMouseEnter={() => setHovered(segment.id)}
                    onMouseLeave={() => setHovered(current => (current === segment.id ? null : current))}
                    onFocus={() => setHovered(segment.id)}
                    onBlur={() => setHovered(current => (current === segment.id ? null : current))}
                    className="cursor-default outline-none transition-all duration-200"
                  />
                );
              }
              return (
                <path
                  key={segment.id}
                  d={arcPath(center, center, radius, segment.start, segment.end)}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={isActive ? STROKE + 6 : STROKE}
                  strokeLinecap="round"
                  tabIndex={0}
                  onMouseEnter={() => setHovered(segment.id)}
                  onMouseLeave={() => setHovered(current => (current === segment.id ? null : current))}
                  onFocus={() => setHovered(segment.id)}
                  onBlur={() => setHovered(current => (current === segment.id ? null : current))}
                  className="cursor-default outline-none transition-all duration-200"
                  opacity={hovered == null || isActive ? 1 : 0.42}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-faint">{active ? 'Porsi kanal' : 'Terbaca'}</span>
            <span className="display-num mt-1 text-[38px] leading-none text-ink">{active ? formatPercent(active.total, total) : formatNumber(total)}</span>
            <span className="mt-1.5 max-w-[130px] truncate text-[10.5px] font-semibold text-ink-muted">{active ? platformLabel(active.id) : 'total ulasan'}</span>
          </div>
        </div>

        <div className="mt-4 w-full space-y-1.5">
          {segments.map(segment => (
            <div
              key={segment.id}
              onMouseEnter={() => setHovered(segment.id)}
              onMouseLeave={() => setHovered(current => (current === segment.id ? null : current))}
              className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition ${hovered === segment.id ? 'bg-paper-200/80' : 'bg-transparent'}`}
            >
              <StoreMark store={segment.id} size={26} tone="quiet" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11.5px] font-bold text-ink">{platformLabel(segment.id)}</span>
                  <span className="num text-[11px] font-semibold text-ink-soft">{formatNumber(segment.total)}</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line/60">
                  <span className="block h-full rounded-full" style={{ width: `${segment.share}%`, backgroundColor: segment.color }} />
                </div>
              </div>
              <span className="num w-11 text-right text-[9.5px] text-ink-faint">{formatPercent(segment.total, total)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 border-t border-line/60 pt-3 text-[10px] leading-relaxed text-ink-faint">
        Hanya ulasan yang benar-benar terbaca. Kanal yang gagal tidak diisi dengan angka perkiraan.
      </p>
    </ChartFrame>
  );
}
