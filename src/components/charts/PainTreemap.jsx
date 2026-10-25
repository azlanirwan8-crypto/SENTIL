import { useMemo, useState } from 'react';
import { layoutTreemap } from '../../lib/treemap.js';
import { formatDecimal, formatNumber, formatPercent, isNumber, toNumber } from '../../lib/format.js';
import { EmptyState } from '../EmptyState.jsx';
import { IconChart } from '../icons.jsx';
import { ChartFrame } from './ChartFrame.jsx';
import { ChartTooltip } from './ChartTooltip.jsx';
import { useMeasure } from './useMeasure.js';
import { CLUSTER_COLORS } from './palette.js';

const HEIGHT = 336;

export function PainTreemap({ clusters }) {
  const [measureRef, width] = useMeasure(280);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const data = Array.isArray(clusters) ? clusters.filter(cluster => Number(cluster.count) > 0) : [];

  const layout = useMemo(() => {
    if (width <= 0 || !data.length) return [];
    return layoutTreemap(
      data.map((cluster, index) => ({
        value: Number(cluster.count) || Number(cluster.frequency) || 1,
        cluster,
        color: CLUSTER_COLORS[index % CLUSTER_COLORS.length],
        index,
      })),
      width,
      HEIGHT,
      4,
    );
  }, [data, width]);

  const selectedCluster = data.find(cluster => cluster.id === selected) || null;
  const hoveredRect = layout.find(rect => rect.entry.cluster.id === hovered);

  const headerAside = data.length ? (
    <span className="chip">{formatNumber(data.length)} klaster</span>
  ) : null;

  if (!data.length) {
    return (
      <ChartFrame eyebrow="03 · Peta keluhan" title="Kelompok istilah dari ulasan rendah" legend={headerAside} hint="Dibentuk dari ko-okurensi istilah pada ulasan 1–2 bintang, tanpa kategori buatan.">
        <EmptyState
          compact
          icon={IconChart}
          title="Belum ada klaster"
          body="Tidak ada cukup istilah berulang pada ulasan 1–2 bintang untuk membentuk kelompok. Ini bukan nol keluhan; hanya ambang statistik belum terpenuhi."
        />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      eyebrow="03 · Peta keluhan"
      title="Kelompok istilah dari ulasan rendah"
      legend={headerAside}
      hint="Dari ulasan 1–2 bintang. Satu ulasan dapat masuk lebih dari satu klaster; luas menunjukkan jumlah ulasan yang memuat istilah klaster."
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div ref={measureRef} className="relative w-full">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="group" aria-label={`Treemap ${data.length} klaster istilah dari ulasan rating rendah.`} className="block">
            <title>Peta kelompok istilah</title>
            <desc>Setiap blok adalah kelompok istilah yang sering muncul bersama pada ulasan 1–2 bintang.</desc>
            {layout.map(rect => {
              const { cluster, color, index } = rect.entry;
              const active = hovered === cluster.id;
              const isSelected = selected === cluster.id;
              const showFull = rect.w >= 82 && rect.h >= 58;
              const showShort = !showFull && rect.w >= 34 && rect.h >= 22;
              return (
                <g
                  key={cluster.id}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${cluster.name}: ${cluster.count} ulasan, ${formatPercent(cluster.share, 100)} dari ulasan rendah berteks. Pilih untuk melihat istilah.`}
                  onMouseEnter={() => setHovered(cluster.id)}
                  onMouseLeave={() => setHovered(current => (current === cluster.id ? null : current))}
                  onFocus={() => setHovered(cluster.id)}
                  onBlur={() => setHovered(current => (current === cluster.id ? null : current))}
                  onClick={() => setSelected(current => (current === cluster.id ? null : cluster.id))}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(current => (current === cluster.id ? null : cluster.id));
                    }
                  }}
                  className="cursor-pointer outline-none"
                  opacity={hovered == null || active || isSelected ? 1 : 0.48}
                  style={{ transition: 'opacity .18s ease' }}
                >
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={Math.max(0, rect.w)}
                    height={Math.max(0, rect.h)}
                    rx={Math.min(8, rect.w / 5, rect.h / 5)}
                    fill={color.fill}
                  />
                  {(active || isSelected) && (
                    <rect
                      x={rect.x + 1.25}
                      y={rect.y + 1.25}
                      width={Math.max(0, rect.w - 2.5)}
                      height={Math.max(0, rect.h - 2.5)}
                      rx={Math.min(7, rect.w / 5, rect.h / 5)}
                      fill="none"
                      stroke="#FCFAF4"
                      strokeOpacity={0.72}
                      strokeWidth={1.25}
                    />
                  )}
                  {showFull && (
                    <foreignObject x={rect.x} y={rect.y} width={Math.max(0, rect.w)} height={Math.max(0, rect.h)} className="pointer-events-none">
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        className="flex h-full w-full flex-col justify-between overflow-hidden p-2.5"
                        style={{ color: color.text }}
                      >
                        <span className="text-[8px] font-bold uppercase tracking-[0.14em] opacity-60">K{String(index + 1).padStart(2, '0')}</span>
                        <div className="min-w-0">
                          <p className="font-display text-[15px] font-semibold leading-[1.05] text-balance">{cluster.name}</p>
                          <p className="mt-1 truncate text-[8.5px] font-semibold opacity-75">{formatNumber(cluster.count)} ulasan</p>
                        </div>
                      </div>
                    </foreignObject>
                  )}
                  {showShort && (
                    <text
                      x={rect.x + rect.w / 2}
                      y={rect.y + rect.h / 2 + 3}
                      textAnchor="middle"
                      fill={color.text}
                      className="pointer-events-none num text-[9px] font-bold"
                    >
                      {formatNumber(cluster.count)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hoveredRect && (
          <ChartTooltip
            visible
            x={hoveredRect.x + hoveredRect.w / 2}
            y={hoveredRect.y + Math.min(52, hoveredRect.h / 2)}
            width={width}
            title={hoveredRect.entry.cluster.name}
            rows={[
              { label: 'Ulasan terkait', value: formatNumber(hoveredRect.entry.cluster.count) },
              { label: 'Porsi ulasan rendah', value: formatPercent(hoveredRect.entry.cluster.share, 100) },
              { label: 'Frekuensi istilah', value: formatNumber(hoveredRect.entry.cluster.frequency) },
              ...hoveredRect.entry.cluster.terms.slice(0, 3).map(term => ({ label: `Istilah · ${term}`, value: '' })),
            ]}
          />
        )}
      </div>

      <div className="mt-3 min-h-[74px] rounded-xl border border-line/70 bg-paper-100/60 p-3.5">
        {selectedCluster ? (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-coral">Klaster terpilih</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[10px] font-semibold text-ink-faint hover:text-ink"
              >
                Tutup
              </button>
            </div>
            <p className="mt-1 text-[13px] font-bold leading-snug text-ink">{selectedCluster.name}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedCluster.terms.map(term => (
                <span key={term} className="rounded-full border border-line/80 bg-paper-50 px-2 py-0.5 text-[9.5px] font-semibold text-ink-soft">{term}</span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
              {formatNumber(selectedCluster.count)} ulasan memuat istilah ini; {formatPercent(selectedCluster.share, 100)} dari ulasan 1–2 bintang berteks. Ambang kemiripan {isNumber(selectedCluster.threshold) ? `${formatDecimal(toNumber(selectedCluster.threshold) * 100, 0)}%` : 'N/A'}.
            </p>
          </div>
        ) : (
          <p className="flex min-h-[46px] items-center text-[10.5px] leading-relaxed text-ink-faint">
            Pilih blok untuk melihat istilah penyusunnya. Nama klaster diambil dari istilah paling sering, bukan kategori yang ditulis manusia.
          </p>
        )}
      </div>
    </ChartFrame>
  );
}
