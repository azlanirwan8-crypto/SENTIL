import { useState } from 'react';

import { formatNumber, formatPercent } from '../lib/format.js';
import { EmptyState } from './EmptyState.jsx';
import { ChartFrame } from './charts/ChartFrame.jsx';
import { IconLayers } from './icons.jsx';

// Panel ini hanya membaca lapisan label yang sudah dihitung mesin. Kolom Label, Phrases, 1–2★,
// Share, 4–5★, Trend dan Severity seluruhnya pengukuran: namanya kata yang benar-benar ditulis
// reviewers dan jumlah ulasannya adalah union ulasan berbeda, bukan penjumlahan frasa. Hanya
// kolom Category yang boleh berisi interpretasi, dan panel ini wajib menyebut sumbernya di
// setiap baris (lihat `namingStatus` dan catatan kaki di bawah tabel).

function Header({ children, className = '' }) {
  return <th scope="col" className={`label py-1 pr-3 text-left font-semibold ${className}`}>{children}</th>;
}

// Arah dibaca dari momentum (paruh kedua per hari terhadap paruh pertama). 1 berarti laju yang
// sama, jadi arahnya hanya bisa naik atau turun — tidak ada pita "stabil" yang dikarang.
function Trend({ entry }) {
  if (!Number.isFinite(entry.momentum)) {
    const reason = entry.undated === null
      ? 'No usable review dates in this corpus'
      : 'No review of this label in the first half of the period, so there is no baseline to compare against';
    return <span className="num text-[11px] text-slate-600" title={reason} aria-label={reason}>—</span>;
  }
  const rising = entry.momentum > 1;
  const falling = entry.momentum < 1;
  return (
    <span
      className={`num text-[11px] font-semibold ${rising ? 'text-neg' : falling ? 'text-pos' : 'text-slate-400'}`}
      title={`${formatNumber(entry.late)} reviews in the second half vs ${formatNumber(entry.early)} in the first${entry.undated ? `, ${formatNumber(entry.undated)} undated` : ''}`}
      aria-label={rising ? 'rate rising' : falling ? 'rate falling' : 'rate unchanged'}
    >
      {rising ? '▲' : falling ? '▼' : '±'} {entry.momentum.toFixed(2)}×
    </span>
  );
}

export function PainLabels({ pain, filtered = false }) {
  const [open, setOpen] = useState(null);

  if (!pain || !Array.isArray(pain.items) || !pain.items.length) {
    return (
      <ChartFrame label="Complaint labels">
        <EmptyState
          compact
          icon={IconLayers}
          title="No complaint phrase yet"
          body="A label is built only from phrases that live in 1–2★ reviews and are absent from 4–5★ reviews. A corpus without both pools, or without repeated wording, cannot produce one."
        />
      </ChartFrame>
    );
  }

  if (!Array.isArray(pain.labels) || !pain.labelRules) {
    return (
      <ChartFrame label="Complaint labels" meta={`${formatNumber(pain.items.length)} phrases stored`}>
        <EmptyState
          compact
          icon={IconLayers}
          title="This snapshot predates the current label layer"
          body={`Labels here were built by ${pain.version || 'an older version'}, which named clusters differently and carried no direction. Pull this project again to rebuild them from the same phrases.`}
        />
      </ChartFrame>
    );
  }

  const labels = pain.labels;
  const metrics = pain.labelMetrics || {};
  const pool = pain.pools?.negative || 0;
  const ceiling = Math.max(1, ...labels.map(entry => entry.reviewCount));

  if (!labels.length) {
    return (
      <ChartFrame label="Complaint labels" meta={`${formatNumber(pain.items.length)} phrases · ${formatNumber(metrics.phrases || 0)} clustered`}>
        <EmptyState
          compact
          icon={IconLayers}
          title="No phrase survived the label test"
          body={`${formatNumber(pain.metrics?.matchedReviews || 0)} of ${formatNumber(pool)} 1–2★ reviews carry a stored phrase, but none of them share wording often enough to cluster. Nothing was invented to fill this panel.`}
        />
      </ChartFrame>
    );
  }

  const clusters = metrics.clusters || labels.length;
  const meta = `${labels.length === clusters ? `${formatNumber(clusters)} clusters` : `${labels.length} of ${formatNumber(clusters)} clusters`} · ${formatNumber(pool)} 1–2★ reviews${filtered ? ' · whole corpus' : ''}`;
  const singletons = metrics.singletons || 0;
  const named = metrics.namedFromTerm || 0;
  // Kategori punya dua sumber yang keduanya ditandai di barisnya: nama dari model bahasa
  // (interpretasi atas frasa yang sudah diukur) dan istilah halaman toko yang lolos uji
  // kepadatan. Satu baris dihitung satu kali — istilah toko yang namanya tertutup nama model
  // dilaporkan terpisah, tidak dijumlahkan ke baris yang sama.
  const naming = pain.naming || null;
  const aiNames = naming?.status === 'named' ? naming.names || {} : null;
  const aiRows = labels.filter(entry => aiNames?.[entry.id]?.category);
  const aiCount = aiRows.length;
  const storeRows = labels.filter(entry => entry.category && !aiNames?.[entry.id]?.category);
  const storeCount = storeRows.length;
  const maskedStoreCount = labels.filter(entry => entry.category && aiNames?.[entry.id]?.category).length;
  const orphanNames = aiNames ? Object.keys(aiNames).length - aiCount : 0;

  return (
    <ChartFrame
      label="Complaint labels"
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">click a label for its phrases</span>}
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Complaint labels found by the corpus engine: theme name, an optional category naming, supporting phrases, distinct 1–2 star reviews, share of the complaint pool, 4–5 star reviews using the same wording, direction of the daily rate, and severity.
          </caption>
          <thead>
            <tr className="border-b border-slate-800">
              <Header>Label</Header>
              <Header className="w-[132px]">Category</Header>
              <Header className="w-[54px] text-right">Phrases</Header>
              <Header className="w-[54px] text-right">1–2★</Header>
              <Header className="w-[48px] text-right">Share</Header>
              <Header className="w-[48px] text-right">4–5★</Header>
              <Header className="w-[74px] text-right">Trend</Header>
              <Header className="w-[58px] text-right">Severity</Header>
            </tr>
          </thead>
          <tbody>
            {labels.map((entry, index) => {
              const active = open === entry.id;
              const width = Math.max(2, (entry.reviewCount / ceiling) * 100);
              const ai = aiNames?.[entry.id]?.category ? aiNames[entry.id] : null;
              const store = entry.category;
              return (
                <tr key={entry.id} className={`border-b border-slate-800/50 last:border-0 ${active ? 'bg-slate-800/40' : ''}`}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setOpen(active ? null : entry.id)}
                      aria-expanded={active}
                      aria-controls={`label-detail-${index}`}
                      aria-label={`${entry.name}: ${formatNumber(entry.reviewCount)} of ${formatNumber(pool)} 1–2 star reviews, ${formatNumber(entry.phraseCount)} supporting phrase${entry.phraseCount === 1 ? '' : 's'}.`}
                      className="group flex w-full items-center gap-2 text-left"
                    >
                      <span className="relative h-3 w-full max-w-[110px] shrink-0 overflow-hidden rounded-[2px] bg-slate-800/50">
                        <span className="absolute inset-y-0 left-0 rounded-[2px] bg-neg/70" style={{ width: `${width}%` }} />
                      </span>
                      <span className={`min-w-0 truncate text-[11px] font-semibold ${entry.nameSource === 'term' ? 'capitalize' : 'font-mono'} ${active ? 'text-slate-50' : 'text-slate-200 group-hover:text-slate-50'}`}>
                        {entry.name}
                      </span>
                      {entry.phraseCount > 1 ? (
                        <span className="shrink-0 rounded border border-slate-700/70 px-1 text-[9px] uppercase tracking-wider text-slate-400">cluster</span>
                      ) : (
                        <span className="shrink-0 rounded border border-slate-700/70 px-1 text-[9px] uppercase tracking-wider text-slate-500">single</span>
                      )}
                    </button>
                    {active ? (
                      <div id={`label-detail-${index}`} role="group" aria-label={`Phrases inside the label named ${entry.name}`} className="mt-1 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5">
                        <p className="label-sm">Phrases in this cluster · {formatNumber(entry.phraseCount)}</p>
                        <ul className="mt-1 space-y-0.5">
                          {entry.phrases.map(phrase => (
                            <li key={phrase.text} className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">{phrase.text}</span>
                              <span className="num shrink-0 text-[10px] text-slate-500">
                                1–2★ {formatNumber(phrase.dfNegative)}
                                {phrase.dfPositive ? ` · 4–5★ ${formatNumber(phrase.dfPositive)}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 border-t border-slate-800/70 pt-1 text-[10px] leading-relaxed text-slate-400">
                          {formatNumber(entry.reviewCount)} distinct reviews mention at least one of these phrases. Counting each phrase
                          separately would report {formatNumber(entry.phrases.reduce((sum, phrase) => sum + phrase.dfNegative, 0))} findings from the same people.
                          {entry.nameSource === 'term' ? ' The name is the anchor word these phrases agree on; the full wording is listed above.' : ''}
                        </p>
                      </div>
                    ) : null}
                  </th>
                  <td className="py-1 pr-3 align-top text-[11px]">
                    {ai ? (
                      <span title={`Category named by ${naming.model} from the phrases in this row; every number here is measured`}>
                        <span className="font-semibold text-slate-200">{ai.category}</span>
                        <span className="block truncate text-[10px] text-slate-500">{ai.subLabel || 'AI-named'}</span>
                      </span>
                    ) : store ? (
                      <span title={`Store term carried by ${formatNumber(store.inside)} of ${formatNumber(entry.reviewCount)} reviews in this cluster, denser than among other complaints`}>
                        <span className="font-semibold text-slate-300">{store.name}</span>
                        <span className="block text-[10px] text-slate-500">store term</span>
                      </span>
                    ) : (
                      <span className="text-slate-500" title="No naming cleared the evidence test for this cluster">—</span>
                    )}
                  </td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">{formatNumber(entry.phraseCount)}</td>
                  <td className="num py-1 pr-3 text-right text-[12px] font-bold text-slate-100">{formatNumber(entry.reviewCount)}</td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-neg">{formatPercent(entry.reviewCount, pool)}</td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">
                    {entry.praiseCount == null ? '—' : formatNumber(entry.praiseCount)}
                  </td>
                  <td className="py-1 pr-3 text-right"><Trend entry={entry} /></td>
                  <td className="num py-1 pr-3 text-right text-[11px] text-slate-400">{entry.severity == null ? '—' : entry.severity.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-slate-400">
        The label itself is reviewer wording: each row groups phrases real reviewers wrote, and the
        name is the word those phrases agree on {named ? <span className="num">({formatNumber(named)} of {formatNumber(labels.length)} named this way)</span> : null}. Two phrases are grouped only
        when more reviews carry both than chance explains. Trend is the daily rate of the second
        half of the observed period against the first. {formatNumber(singletons)} {singletons === 1 ? 'label is' : 'labels are'} {singletons === 1 ? 'a single phrase' : 'single phrases'};{' '}
        {metrics.trimmedLabels
          ? <>{formatNumber(metrics.trimmedLabels)} clusters fell outside the display budget and are counted in the metrics instead of being dropped silently.</>
          : 'every cluster fits the display budget.'}
        {filtered ? ' Counts cover the whole corpus, not the active filter.' : ''}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        The Category column is the one interpreted part, and its state is reported as it is:
        {' '}{naming?.status === 'named'
          ? <>it ran with <span className="font-semibold text-slate-400">{naming.model}</span> over {formatNumber(naming.clusters || 0)} clusters and {aiCount ? <span className="num">{formatNumber(aiCount)}</span> : 'no'} of the rows shown {aiCount === 1 ? 'carries' : 'carry'} its name{storeCount ? <>, {formatNumber(storeCount)} carry a store-listing term that is denser inside the cluster than among other complaints</> : null}{maskedStoreCount ? <>, {formatNumber(maskedStoreCount)} further store term{maskedStoreCount === 1 ? '' : 's'} measured here but hidden behind a model name</> : null}{orphanNames ? <>, {formatNumber(orphanNames)} returned name{orphanNames === 1 ? '' : 's'} matched no row on this table and {orphanNames === 1 ? 'was' : 'were'} ignored</> : null}.</>
          : naming?.status === 'skipped'
            ? <>it did not run — {naming.reason || 'the naming layer was not configured'} — so any category below comes from the store listing or is empty.</>
            : naming?.status === 'failed'
              ? <>it ran and failed — {naming.reason || 'no usable names came back'} — so any category below comes from the store listing or is empty.</>
              : 'this snapshot has no naming record at all; it was pulled before the naming layer existed, or nothing was clustered to name.'}
        {' '}No number in the table comes from naming — counts, shares and trend are measured.
      </p>
    </ChartFrame>
  );
}
