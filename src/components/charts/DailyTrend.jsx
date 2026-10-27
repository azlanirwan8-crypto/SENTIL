import { useMemo, useRef, useState } from 'react';
import { formatDay, formatNumber, formatNss } from '../../lib/format.js';
import { t } from '../../lib/i18n.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { ChartFrame, Legend } from './ChartFrame.jsx';
import { ChartTooltip } from './ChartTooltip.jsx';
import { clamp, formatTick, niceScale } from './chart-utils.js';
import { useMeasure } from './useMeasure.js';
import { SENTIMENT_SERIES, SERIES_COLORS, BAR_OPACITY } from './palette.js';

const SERIES = [...SENTIMENT_SERIES].reverse();
const MARGIN = { top: 10, right: 8, bottom: 22, left: 28 };
const HEIGHT = 216;

export function DailyTrend({ daily }) {
  const [measureRef, measuredWidth] = useMeasure(240);
  const [hovered, setHovered] = useState(null);
  // Jepitan tooltip butuh offset gulir saat render, jadi offset dibaca langsung dari DOM:
  // menunggu event scroll membuat tooltip kadang menjepit ke posisi lama.
  const scrollRef = useRef(null);
  const [, bumpScroll] = useState(0);
  const data = Array.isArray(daily) ? daily : [];

  const width = Math.max(measuredWidth, 240);
  const desired = Math.max(width, data.length * 18 + MARGIN.left + MARGIN.right);
  const chartWidth = Math.min(desired, Math.max(width, 1800));
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const scale = useMemo(() => niceScale(Math.max(1, ...data.map(day => day.total)), 4), [data]);
  const slot = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = clamp(slot * 0.62, 2, 16);
  const tickStep = Math.max(1, Math.ceil(data.length / 6));
  const totalReviews = data.reduce((sum, day) => sum + day.total, 0);

  const legend = <Legend items={SENTIMENT_SERIES.map(item => ({ key: item.key, label: t(item.label), color: item.color }))} />;

  if (!data.length) {
    return (
      <ChartFrame label={t('Daily trend')} legend={legend}>
        <EmptyState compact icon={IconGrid} title={t('No publication date')} body={t('The daily trend needs a date column on the source reviews.')} />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame label={t('Daily trend')} meta={`${data.length} ${t('days')} · ${formatNumber(totalReviews)} ${t('reviews')}`} legend={legend} className="h-full">
      <div ref={measureRef} className="relative w-full min-w-0">
        <div ref={scrollRef} className="scroll-x min-w-0" onScroll={() => { if (hovered != null) bumpScroll(value => value + 1); }}>
          <div className="relative" style={{ width: chartWidth }}>
            <svg width={chartWidth} height={HEIGHT} role="group" aria-label={`${t('Daily trend over')} ${data.length} ${t('days')}, ${formatNumber(totalReviews)} ${t('reviews')}.`} className="block max-w-none">
              <title>{t('Daily sentiment trend')}</title>
              {scale.ticks.map(tick => {
                const y = MARGIN.top + plotHeight - (tick / scale.max) * plotHeight;
                return (
                  <g key={tick}>
                    <line x1={MARGIN.left} y1={y} x2={chartWidth - MARGIN.right} y2={y} stroke={tick === 0 ? SERIES_COLORS.line : SERIES_COLORS.lineSoft} />
                    <text x={MARGIN.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px] num">{formatTick(tick)}</text>
                  </g>
                );
              })}

              {data.map((day, index) => {
                const bandX = MARGIN.left + index * slot;
                const x = bandX + (slot - barWidth) / 2;
                let cursor = MARGIN.top + plotHeight;
                const active = hovered === index;
                return (
                  <g key={day.date}>
                    {active && <rect x={bandX} y={MARGIN.top - 4} width={slot} height={plotHeight + 4} fill={SERIES_COLORS.hoverBand} />}
                    <g className="animate-bar-grow" style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${Math.min(index * 10, 260)}ms` }}>
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
                            height={Math.max(1, height - 1)}
                            rx={barWidth > 6 ? 1.5 : 0.5}
                            fill={series.color}
                            opacity={active ? BAR_OPACITY.active : (hovered == null ? BAR_OPACITY.idle : BAR_OPACITY.dimmed)}
                          />
                        );
                      })}
                    </g>
                    <rect
                      x={bandX}
                      y={MARGIN.top}
                      width={slot}
                      height={plotHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${formatDay(day.date, { long: true })}: ${day.total} ${t('reviews')}, ${day.positive} ${t('positive')}, ${day.negative} ${t('negative')}, ${day.neutral} ${t('neutral')}, ${day.unclassified} ${t('unclassified')}.`}
                      onMouseEnter={() => setHovered(index)}
                      onMouseLeave={() => setHovered(current => (current === index ? null : current))}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(current => (current === index ? null : current))}
                      className="chart-hit"
                    />
                    {(index % tickStep === 0 || index === data.length - 1) && (
                      <text x={bandX + slot / 2} y={HEIGHT - 7} textAnchor="middle" className={`text-[10px] num ${active ? 'fill-slate-100' : 'fill-slate-400'}`}>
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
                  height={HEIGHT}
                  viewStart={scrollRef.current?.scrollLeft || 0}
                  viewWidth={measuredWidth}
                  title={formatDay(day.date, { long: true })}
                  rows={[
                    { label: t('Total'), value: formatNumber(day.total) },
                    ...SENTIMENT_SERIES.map(series => ({ label: t(series.label), value: formatNumber(day[series.key] || 0), color: series.color })),
                    { label: 'NSS', value: nss == null ? 'N/A' : formatNss(nss) },
                  ]}
                />
              );
            })()}
          </div>
        </div>
      </div>
    </ChartFrame>
  );
}
