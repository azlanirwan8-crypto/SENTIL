import { useMemo, useState } from 'react';
import { formatNumber, formatNss, formatPercent, platformLabel } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconChart } from '../icons.jsx';
import { StoreMark } from '../Brand.jsx';
import { ChartFrame, Legend } from './ChartFrame.jsx';
import { ChartTooltip } from './ChartTooltip.jsx';
import { formatTick, niceScale } from './chart-utils.js';
import { useMeasure } from './useMeasure.js';
import { SENTIMENT_SERIES, SERIES_COLORS, storeColor } from './palette.js';

const HEIGHT = 268;
const MARGIN = { top: 20, right: 12, bottom: 42, left: 36 };

export function PlatformBars({ platforms }) {
  const [measureRef, measuredWidth] = useMeasure(280);
  const [hovered, setHovered] = useState(null);
  const data = Array.isArray(platforms) ? platforms.filter(item => item.total > 0) : [];
  const width = Math.max(measuredWidth, 280);
  const chartWidth = Math.max(width, data.length * 154);
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxSeries = Math.max(1, ...data.flatMap(platform => SENTIMENT_SERIES.map(series => platform[series.key] || 0)));
  const scale = useMemo(() => niceScale(maxSeries, 4), [maxSeries]);
  const groupBand = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(21, Math.max(8, groupBand / 7.5));
  const seriesGap = 4;
  const clusterWidth = barWidth * SENTIMENT_SERIES.length + seriesGap * (SENTIMENT_SERIES.length - 1);

  const legend = <Legend dense items={SENTIMENT_SERIES.map(item => ({ key: item.key, label: item.label, color: item.color }))} />;

  if (!data.length) {
    return (
      <ChartFrame eyebrow="04 · Kanal × sentimen" title="Komposisi label per platform" legend={legend} hint="Batang berkelompok menurut kanal sumber.">
        <EmptyState compact icon={IconChart} title="Belum ada label" body="Tidak ada ulasan berlabel yang dapat dibandingkan antar-kanal untuk analisis ini." />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame eyebrow="04 · Kanal × sentimen" title="Komposisi label per platform" legend={legend} hint="Batang berkelompok menurut kanal; satu ulasan memiliki satu label." className="h-full" bodyClassName="flex flex-col">
      <div ref={measureRef} className="relative w-full min-w-0">
        <div className="scrollbar-soft min-w-0 overflow-x-auto pb-1">
          <div className="relative" style={{ width: chartWidth }}>
            <svg width={chartWidth} height={HEIGHT} role="group" aria-label={`Komposisi sentimen untuk ${data.length} kanal.`}>
              <title>Komposisi label sentimen per platform</title>
              <desc>Batang positif, netral, negatif, dan tak terklasifikasi dikelompokkan per kanal ulasan.</desc>
              {scale.ticks.map(tick => {
                const y = MARGIN.top + plotHeight - (tick / scale.max) * plotHeight;
                return (
                  <g key={tick}>
                    <line x1={MARGIN.left} y1={y} x2={chartWidth - MARGIN.right} y2={y} stroke={SERIES_COLORS.line} strokeOpacity={tick === 0 ? 0.95 : 0.55} strokeDasharray={tick === 0 ? undefined : '2 4'} />
                    <text x={MARGIN.left - 8} y={y + 3.5} textAnchor="end" className="fill-ink-faint text-[9.5px] num">{formatTick(tick)}</text>
                  </g>
                );
              })}

              {data.map((platform, groupIndex) => {
                const bandX = MARGIN.left + groupIndex * groupBand;
                const startX = bandX + (groupBand - clusterWidth) / 2;
                const active = hovered === platform.id;
                const topValue = Math.max(...SENTIMENT_SERIES.map(series => platform[series.key] || 0));
                const topY = MARGIN.top + plotHeight - (topValue / scale.max) * plotHeight;
                return (
                  <g key={platform.id}>
                    {active && (
                      <rect x={bandX + 5} y={MARGIN.top - 8} width={groupBand - 10} height={plotHeight + 8} rx="8" fill={SERIES_COLORS.ink} opacity="0.04" />
                    )}
                    <g className="animate-bar-grow" style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${groupIndex * 70}ms` }}>
                      {SENTIMENT_SERIES.map((series, seriesIndex) => {
                        const value = platform[series.key] || 0;
                        const barHeight = (value / scale.max) * plotHeight;
                        const x = startX + seriesIndex * (barWidth + seriesGap);
                        return value > 0 ? (
                          <rect
                            key={series.key}
                            x={x}
                            y={MARGIN.top + plotHeight - barHeight}
                            width={barWidth}
                            height={Math.max(1.2, barHeight - 0.5)}
                            rx={Math.min(3, barWidth / 3)}
                            fill={series.color}
                            opacity={hovered == null || active ? 1 : 0.45}
                          />
                        ) : null;
                      })}
                    </g>
                    <rect
                      x={bandX}
                      y={MARGIN.top}
                      width={groupBand}
                      height={plotHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${platformLabel(platform.id)}: ${platform.total} ulasan; ${platform.positive} positif, ${platform.neutral} netral, ${platform.negative} negatif, ${platform.unclassified} tak terklasifikasi.`}
                      onMouseEnter={() => setHovered(platform.id)}
                      onMouseLeave={() => setHovered(current => (current === platform.id ? null : current))}
                      onFocus={() => setHovered(platform.id)}
                      onBlur={() => setHovered(current => (current === platform.id ? null : current))}
                      className="cursor-default outline-none focus-visible:fill-teal/10"
                    />
                    <text x={bandX + groupBand / 2} y={MARGIN.top + plotHeight + 17} textAnchor="middle" className={`text-[10px] font-semibold ${active ? 'fill-ink' : 'fill-ink-soft'}`}>
                      {platformLabel(platform.id)}
                    </text>
                    <text x={bandX + groupBand / 2} y={MARGIN.top + plotHeight + 31} textAnchor="middle" className="fill-ink-faint text-[8.5px] num">
                      {formatNumber(platform.total)} ulasan
                    </text>
                    {topValue > 0 && (
                      <text x={bandX + groupBand / 2} y={topY - 7} textAnchor="middle" className="fill-ink-faint text-[8.5px] num">
                        puncak {formatNumber(topValue)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {hovered != null && (() => {
          const platform = data.find(item => item.id === hovered);
          if (!platform) return null;
          const groupIndex = data.indexOf(platform);
          const activeAnalyzed = platform.positive + platform.negative + platform.neutral;
          const nss = activeAnalyzed ? ((platform.positive - platform.negative) / activeAnalyzed) * 100 : null;
          return (
            <ChartTooltip
              visible
              x={MARGIN.left + groupIndex * groupBand + groupBand / 2}
              y={MARGIN.top + 30}
              width={chartWidth}
              title={platformLabel(platform.id)}
              rows={[
                { label: 'Total', value: formatNumber(platform.total) },
                ...SENTIMENT_SERIES.map(series => ({ label: series.label, value: formatNumber(platform[series.key] || 0), color: series.color })),
                { label: 'NSS kanal', value: nss == null ? 'N/A' : formatNss(nss) },
              ]}
            />
          );
        })()}
      </div>

      <div className="mt-4 grid gap-2 border-t border-line/60 pt-3 sm:grid-cols-2">
        {data.map(platform => {
          const analyzed = platform.positive + platform.negative + platform.neutral;
          const nss = analyzed ? ((platform.positive - platform.negative) / analyzed) * 100 : null;
          return (
            <div key={platform.id} className="flex items-center gap-2.5 rounded-xl bg-paper-100/70 px-2.5 py-2">
              <StoreMark store={platform.id} size={25} tone="quiet" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10.5px] font-bold text-ink">{platformLabel(platform.id)}</p>
                <p className="text-[9px] text-ink-faint">{formatPercent(platform.total, data.reduce((sum, item) => sum + item.total, 0))} dari total</p>
              </div>
              <div className="text-right">
                <p className="num text-[12px] font-bold" style={{ color: storeColor(platform.id) }}>{nss == null ? 'N/A' : formatNss(nss)}</p>
                <p className="text-[8px] uppercase tracking-[0.12em] text-ink-faint">NSS kanal</p>
              </div>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
