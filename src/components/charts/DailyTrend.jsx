import { useMemo, useState } from 'react';
import { formatDay, formatDecimal, formatNumber, formatNss } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconChart } from '../icons.jsx';
import { ChartFrame, Legend } from './ChartFrame.jsx';
import { ChartTooltip } from './ChartTooltip.jsx';
import { clamp, formatTick, niceScale } from './chart-utils.js';
import { useMeasure } from './useMeasure.js';
import { SERIES_COLORS } from './palette.js';

const SERIES = [
  { key: 'positive', label: 'Positif', color: SERIES_COLORS.positive },
  { key: 'neutral', label: 'Netral', color: SERIES_COLORS.neutral },
  { key: 'negative', label: 'Negatif', color: SERIES_COLORS.negative },
  { key: 'unclassified', label: 'Tak terklasifikasi', color: SERIES_COLORS.unclassified },
];

const MARGIN = { top: 16, right: 12, bottom: 34, left: 38 };
const HEIGHT = 286;

export function DailyTrend({ daily }) {
  const [measureRef, measuredWidth] = useMeasure(280);
  const [hovered, setHovered] = useState(null);
  const data = Array.isArray(daily) ? daily : [];

  const width = Math.max(measuredWidth, 280);
  // Deret harian yang panjang tetap digambar penuh (tanpa pembuangan hari), tetapi lebar
  // gulir dibatasi agar halaman tidak melebar ribuan piksel.
  const desiredWidth = Math.max(width, data.length * 22 + MARGIN.left + MARGIN.right);
  const chartWidth = Math.min(desiredWidth, Math.max(width, 2400));
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const scale = useMemo(() => niceScale(Math.max(1, ...data.map(day => day.total)), 4), [data]);
  const slot = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = clamp(slot * 0.58, 3, 24);
  const tickStep = Math.max(1, Math.ceil(data.length / 8));

  const legend = <Legend dense items={SERIES.map(item => ({ key: item.key, label: item.label, color: item.color }))} />;

  if (!data.length) {
    return (
      <ChartFrame eyebrow="01 · Tren harian" title="Aliran sinyal per hari" legend={legend} hint="Hanya hari yang memiliki ulasan.">
        <EmptyState compact icon={IconChart} title="Belum ada tanggal" body="Tanggal publikasi tidak tersedia pada ulasan yang terbaca, sehingga tren harian tidak dapat dibentuk." />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame eyebrow="01 · Tren harian" title="Aliran sinyal per hari" legend={legend} hint="Seluruh ulasan dijumlahkan menurut tanggal publikasi; arahkan kursor atau fokus ke batang." className="h-full">
      <div ref={measureRef} className="relative w-full min-w-0">
        <div className="scrollbar-soft min-w-0 overflow-x-auto pb-1">
          <div className="relative" style={{ width: chartWidth }}>
            <svg
              width={chartWidth}
              height={HEIGHT}
              role="group"
              aria-label={`Tren harian atas ${data.length} hari dan ${formatNumber(data.reduce((sum, day) => sum + day.total, 0))} ulasan.`}
              className="block max-w-none"
            >
              <title>Tren sentimen harian</title>
              <desc>Batang bertumpuk positif, netral, negatif, dan tak terklasifikasi untuk setiap tanggal yang memiliki ulasan.</desc>
              {scale.ticks.map(tick => {
                const y = MARGIN.top + plotHeight - (tick / scale.max) * plotHeight;
                return (
                  <g key={tick}>
                    <line x1={MARGIN.left} y1={y} x2={chartWidth - MARGIN.right} y2={y} stroke={SERIES_COLORS.line} strokeOpacity={tick === 0 ? 0.95 : 0.55} strokeDasharray={tick === 0 ? undefined : '2 4'} />
                    <text x={MARGIN.left - 9} y={y + 3.5} textAnchor="end" className="fill-ink-faint text-[9.5px] num">{formatTick(tick)}</text>
                  </g>
                );
              })}

              {data.map((day, index) => {
                const x = MARGIN.left + index * slot + (slot - barWidth) / 2;
                let cursor = MARGIN.top + plotHeight;
                const active = hovered === index;
                return (
                  <g key={day.date}>
                    {active && (
                      <rect x={MARGIN.left + index * slot} y={MARGIN.top - 5} width={slot} height={plotHeight + 5} fill={SERIES_COLORS.ink} opacity="0.045" rx="4" />
                    )}
                    <g
                      className="animate-bar-grow"
                      style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${Math.min(index * 18, 320)}ms` }}
                    >
                      {SERIES.map(series => {
                        const value = day[series.key] || 0;
                        if (!value) return null;
                        const height = (value / scale.max) * plotHeight;
                        cursor -= height;
                        return (
                          <rect
                            key={series.key}
                            x={x}
                            y={cursor}
                            width={barWidth}
                            height={Math.max(1.2, height - 0.6)}
                            rx={barWidth > 8 ? 1.8 : 0.8}
                            fill={series.color}
                            opacity={active ? 1 : 0.88}
                          />
                        );
                      })}
                    </g>
                    <rect
                      x={MARGIN.left + index * slot}
                      y={MARGIN.top}
                      width={slot}
                      height={plotHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${formatDay(day.date, { long: true })}: ${day.total} ulasan, ${day.positive} positif, ${day.negative} negatif, ${day.neutral} netral, ${day.unclassified} tak terklasifikasi.`}
                      onMouseEnter={() => setHovered(index)}
                      onMouseLeave={() => setHovered(current => (current === index ? null : current))}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(current => (current === index ? null : current))}
                      className="cursor-default outline-none focus-visible:fill-teal/10"
                    />
                    {(index % tickStep === 0 || index === data.length - 1) && (
                      <text
                        x={MARGIN.left + index * slot + slot / 2}
                        y={HEIGHT - 11}
                        textAnchor="middle"
                        className={`text-[9px] num ${active ? 'fill-ink font-bold' : 'fill-ink-faint'}`}
                      >
                        {formatDay(day.date)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {hovered != null && data[hovered] && (() => {
              const day = data[hovered];
              const analyzed = day.positive + day.negative + day.neutral;
              const nss = analyzed ? ((day.positive - day.negative) / analyzed) * 100 : null;
              return (
                <ChartTooltip
                  visible
                  x={MARGIN.left + hovered * slot + slot / 2}
                  y={MARGIN.top + plotHeight - (day.total / scale.max) * plotHeight}
                  width={chartWidth}
                  title={formatDay(day.date, { long: true })}
                  rows={[
                    { label: 'Total ulasan', value: formatNumber(day.total) },
                    ...SERIES.map(series => ({ label: series.label, value: formatNumber(day[series.key] || 0), color: series.color })),
                    { label: 'NSS hari', value: nss == null ? 'N/A' : formatNss(nss) },
                  ]}
                />
              );
            })()}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 text-[9.5px] text-ink-faint">
          <span>{formatNumber(data.length)} hari dengan ulasan</span>
          <span className="num">Total {formatNumber(data.reduce((sum, day) => sum + day.total, 0))} ulasan</span>
        </div>
      </div>
    </ChartFrame>
  );
}
