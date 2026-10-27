import { useMemo, useRef, useState } from 'react';
import { formatNumber, formatNss, formatPercent, platformLabel } from '../../lib/format.js';
import { t } from '../../lib/i18n.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconGrid } from '../icons.jsx';
import { StoreMark } from '../Brand.jsx';
import { ChartFrame, Legend } from './ChartFrame.jsx';
import { ChartTooltip } from './ChartTooltip.jsx';
import { formatTick, niceScale } from './chart-utils.js';
import { useMeasure } from './useMeasure.js';
import { SENTIMENT_SERIES, SERIES_COLORS, BAR_OPACITY, storeColor } from './palette.js';

const HEIGHT = 208;
const MARGIN = { top: 14, right: 8, bottom: 34, left: 28 };

function platformNss(platform) {
  const analyzed = platform.positive + platform.negative + platform.neutral;
  return analyzed ? ((platform.positive - platform.negative) / analyzed) * 100 : null;
}

export function PlatformBars({ platforms }) {
  const [measureRef, measuredWidth] = useMeasure(240);
  const [hovered, setHovered] = useState(null);
  // Jepitan tooltip butuh offset gulir saat render, jadi offset dibaca langsung dari DOM.
  const scrollRef = useRef(null);
  const [, bumpScroll] = useState(0);
  const data = Array.isArray(platforms) ? platforms.filter(item => item.total > 0) : [];
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const width = Math.max(measuredWidth, 240);
  const chartWidth = Math.max(width, data.length * 132);
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxSeries = Math.max(1, ...data.flatMap(platform => SENTIMENT_SERIES.map(series => platform[series.key] || 0)));
  const scale = useMemo(() => niceScale(maxSeries, 4), [maxSeries]);
  const band = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(16, Math.max(6, band / 8));
  const gap = 3;
  const clusterWidth = barWidth * SENTIMENT_SERIES.length + gap * (SENTIMENT_SERIES.length - 1);

  const legend = <Legend items={SENTIMENT_SERIES.map(item => ({ key: item.key, label: t(item.label), color: item.color }))} />;

  if (!data.length) {
    return (
      <ChartFrame label={t('Channel × sentiment')} legend={legend}>
        <EmptyState compact icon={IconGrid} title={t('No label per channel yet')} body={t('This chart needs a labelled review on at least one channel.')} />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame label={t('Channel × sentiment')} meta={`${data.length} ${t('channels')}`} legend={legend} className="h-full">
      <div ref={measureRef} className="relative w-full min-w-0">
        <div ref={scrollRef} className="scroll-x min-w-0" onScroll={() => { if (hovered != null) bumpScroll(value => value + 1); }}>
          <div className="relative" style={{ width: chartWidth }}>
            <svg width={chartWidth} height={HEIGHT} role="group" aria-label={`${t('Label composition for')} ${data.length} ${t('channels')}.`}>
              <title>{t('Sentiment label composition per platform')}</title>
              {scale.ticks.map(tick => {
                const y = MARGIN.top + plotHeight - (tick / scale.max) * plotHeight;
                return (
                  <g key={tick}>
                    <line x1={MARGIN.left} y1={y} x2={chartWidth - MARGIN.right} y2={y} stroke={tick === 0 ? SERIES_COLORS.line : SERIES_COLORS.lineSoft} />
                    <text x={MARGIN.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px] num">{formatTick(tick)}</text>
                  </g>
                );
              })}

              {data.map((platform, index) => {
                const bandX = MARGIN.left + index * band;
                const startX = bandX + (band - clusterWidth) / 2;
                const active = hovered === platform.id;
                return (
                  <g key={platform.id}>
                    {active && <rect x={bandX + 4} y={MARGIN.top - 6} width={band - 8} height={plotHeight + 6} rx="4" fill="#FFFFFF" opacity="0.045" />}
                    <g className="animate-bar-grow" style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${index * 60}ms` }}>
                      {SENTIMENT_SERIES.map((series, seriesIndex) => {
                        const value = platform[series.key] || 0;
                        if (!value) return null;
                        const barHeight = (value / scale.max) * plotHeight;
                        return (
                          <rect
                            key={series.key}
                            x={startX + seriesIndex * (barWidth + gap)}
                            y={MARGIN.top + plotHeight - barHeight}
                            width={barWidth}
                            height={Math.max(1, barHeight - 0.5)}
                            rx="1.5"
                            fill={series.color}
                            opacity={active ? BAR_OPACITY.active : (hovered == null ? BAR_OPACITY.idle : BAR_OPACITY.dimmed)}
                          />
                        );
                      })}
                    </g>
                    <rect
                      x={bandX}
                      y={MARGIN.top}
                      width={band}
                      height={plotHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${platformLabel(platform.id)}: ${platform.total} ${t('reviews')}; ${platform.positive} ${t('positive')}, ${platform.neutral} ${t('neutral')}, ${platform.negative} ${t('negative')}, ${platform.unclassified} ${t('unclassified')}.`}
                      onMouseEnter={() => setHovered(platform.id)}
                      onMouseLeave={() => setHovered(current => (current === platform.id ? null : current))}
                      onFocus={() => setHovered(platform.id)}
                      onBlur={() => setHovered(current => (current === platform.id ? null : current))}
                      className="chart-hit"
                    />
                    <text x={bandX + band / 2} y={MARGIN.top + plotHeight + 15} textAnchor="middle" className={`text-[10px] font-semibold ${active ? 'fill-slate-100' : 'fill-slate-400'}`}>
                      {platformLabel(platform.id)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {hovered != null && (() => {
              const platform = data.find(item => item.id === hovered);
              if (!platform) return null;
              const nss = platformNss(platform);
              const tallest = Math.max(0, ...SENTIMENT_SERIES.map(series => platform[series.key] || 0));
              return (
                <ChartTooltip
                  visible
                  x={MARGIN.left + data.indexOf(platform) * band + band / 2}
                  y={MARGIN.top + plotHeight - (tallest / scale.max) * plotHeight}
                  width={chartWidth}
                  height={HEIGHT}
                  viewStart={scrollRef.current?.scrollLeft || 0}
                  viewWidth={measuredWidth}
                  title={platformLabel(platform.id)}
                  rows={[
                    { label: t('Total'), value: formatNumber(platform.total) },
                    ...SENTIMENT_SERIES.map(series => ({ label: t(series.label), value: formatNumber(platform[series.key] || 0), color: series.color })),
                    { label: 'NSS', value: nss == null ? 'N/A' : formatNss(nss) },
                  ]}
                />
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1.5">
        {data.map(platform => {
          const nss = platformNss(platform);
          return (
            <span key={platform.id} className="chip">
              <StoreMark store={platform.id} size={13} tone="quiet" />
              {platformLabel(platform.id)}
              <span className="num font-bold" style={{ color: storeColor(platform.id) }}>{nss == null ? 'N/A' : formatNss(nss)}</span>
              <span className="num text-slate-400">{formatPercent(platform.total, total)}</span>
            </span>
          );
        })}
      </div>
    </ChartFrame>
  );
}
