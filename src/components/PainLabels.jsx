import { useMemo, useState } from 'react';

import { formatNumber, formatPercent } from '../lib/format.js';
import { t, topicLabel } from '../lib/i18n.js';
import { AnalystBadge, aiText } from './Analyst.jsx';
import { EmptyState } from './EmptyState.jsx';
import { ChartFrame } from './charts/ChartFrame.jsx';
import { IconLayers } from './icons.jsx';

// Panel ini hanya membaca lapisan label yang sudah dihitung mesin. Kolom Label, Phrases, 1–2★,
// Share, 4–5★, Trend dan Severity seluruhnya pengukuran: namanya kata yang benar-benar ditulis
// reviewers dan jumlah ulasannya adalah union ulasan berbeda, bukan penjumlahan frasa. Hanya
// kolom Category yang boleh berisi interpretasi, dan panel ini wajib menyebut sumbernya di
// setiap baris (lihat `namingStatus` dan catatan kaki di bawah tabel).

function Header({ children, className = '' }) {
  return <th scope="col" className={`label py-1.5 pr-3 text-left font-semibold ${className}`}>{children}</th>;
}

// Arah dibaca dari momentum (paruh kedua per hari terhadap paruh pertama). 1 berarti laju yang
// sama, jadi arahnya hanya bisa naik atau turun — tidak ada pita "stabil" yang dikarang.
function Trend({ entry }) {
  if (!Number.isFinite(entry.momentum)) {
    const reason = entry.undated === null
      ? t('No usable review dates in this corpus')
      : t('No review of this label in the first half of the period, so there is no baseline to compare against');
    return <span className="num text-[11px] text-slate-400" title={reason} aria-label={reason}>—</span>;
  }
  const rising = entry.momentum > 1;
  const falling = entry.momentum < 1;
  return (
    <span
      className={`num text-[11px] font-semibold ${rising ? 'text-neg' : falling ? 'text-pos' : 'text-slate-400'}`}
      title={`${formatNumber(entry.late)} ${t('reviews in the second half vs')} ${formatNumber(entry.early)} ${t('in the first')}${entry.undated ? `, ${formatNumber(entry.undated)} ${t('undated')}` : ''}`}
      aria-label={rising ? t('rate rising') : falling ? t('rate falling') : t('rate unchanged')}
    >
      {rising ? '▲' : falling ? '▼' : '±'} {entry.momentum.toFixed(2)}×
    </span>
  );
}

export function PainLabels({ pain, topics, ai = null, filtered = false }) {
  const [open, setOpen] = useState(null);
  // Kategori menyimpan id topik kamus, bukan kedua sebutannya. Sebutan yang dibaca manajer
  // diambil dari kamus yang sama yang dipakai peta keluhan, jadi satu fitur tidak pernah
  // punya dua nama berbeda di dua panel — dan angka tetap milik mesin.
  const topicsById = useMemo(() => new Map((Array.isArray(topics) ? topics : []).map(topic => [topic.id, topic])), [topics]);
  const areaName = category => topicLabel(topicsById.get(category.id) || category);

  if (!pain || !Array.isArray(pain.items) || !pain.items.length) {
    return (
      <ChartFrame label={t('Complaint labels')}>
        <EmptyState
          compact
          icon={IconLayers}
          title={t('No complaint phrase yet')}
          body={t('A label is built only from phrases that live in 1–2★ reviews and are absent from 4–5★ reviews. A corpus without both pools, or without repeated wording, cannot produce one.')}
        />
      </ChartFrame>
    );
  }

  if (!Array.isArray(pain.labels) || !pain.labelRules) {
    return (
      <ChartFrame label={t('Complaint labels')} meta={`${formatNumber(pain.items.length)} ${t('phrases stored')}`}>
        <EmptyState
          compact
          icon={IconLayers}
          title={t('This snapshot predates the current label layer')}
          body={`${t('Labels here were built by')} ${pain.version || t('an older version')}${t(', which named clusters differently and carried no direction. Pull this project again to rebuild them from the same phrases.')}`}
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
      <ChartFrame label={t('Complaint labels')} meta={`${formatNumber(pain.items.length)} ${t('phrases')} · ${formatNumber(metrics.phrases || 0)} ${t('clustered')}`}>
        <EmptyState
          compact
          icon={IconLayers}
          title={t('No phrase survived the label test')}
          body={`${formatNumber(pain.metrics?.matchedReviews || 0)} ${t('of')} ${formatNumber(pool)} 1–2★ ${t('reviews carry a stored phrase, but none of them share wording often enough to cluster. Nothing was invented to fill this panel.')}`}
        />
      </ChartFrame>
    );
  }

  const clusters = metrics.clusters || labels.length;
  const meta = `${labels.length === clusters ? `${formatNumber(clusters)} ${t('clusters')}` : `${labels.length} ${t('of')} ${formatNumber(clusters)} ${t('clusters')}`} · ${formatNumber(pool)} 1–2★ ${t('reviews')}${filtered ? ` · ${t('whole corpus')}` : ''}`;
  const singletons = metrics.singletons || 0;
  const headed = metrics.headed || 0;
  // Kategori punya dua sumber yang keduanya ditandai di barisnya: nama dari model bahasa
  // (interpretasi atas frasa yang sudah diukur) dan istilah halaman toko yang lolos uji
  // kepadatan. Satu baris dihitung satu kali — istilah toko yang namanya tertutup nama model
  // dilaporkan terpisah, tidak dijumlahkan ke baris yang sama.
  const naming = ai || null;
  const aiNames = naming?.status === 'answered' ? naming.names || {} : null;
  const readings = naming?.status === 'answered' ? naming.reading?.labels || {} : null;
  const aiRows = labels.filter(entry => aiNames?.[entry.id]?.category);
  const aiCount = aiRows.length;
  const readCount = labels.filter(entry => readings?.[entry.id]).length;
  const storeRows = labels.filter(entry => entry.category && !aiNames?.[entry.id]?.category);
  const termCount = storeRows.length;
  const maskedTermCount = labels.filter(entry => entry.category && aiNames?.[entry.id]?.category).length;
  const orphanNames = aiNames ? Object.keys(aiNames).length - aiCount : 0;

  return (
    <ChartFrame
      label={t('Complaint labels')}
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">{t('click a label for its phrases')}</span>}
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            {t('Complaint labels found by the corpus engine: an area named by the domain dictionary or by the language model, the reviewer wording that evidences it, supporting phrases, distinct 1–2 star reviews, share of the complaint pool, 4–5 star reviews using the same wording, direction of the daily rate, and severity.')}
          </caption>
          <thead>
            <tr className="border-b border-slate-800">
              <Header>{t('Complaint')}</Header>
              <Header className="w-[132px]">{t('Named by')}</Header>
              <Header className="w-[54px] text-right">{t('Phrases')}</Header>
              <Header className="w-[54px] text-right">1–2★</Header>
              <Header className="w-[48px] text-right">{t('Share')}</Header>
              <Header className="w-[48px] text-right">4–5★</Header>
              <Header className="w-[74px] text-right">{t('Trend')}</Header>
              <Header className="w-[58px] text-right">{t('Severity')}</Header>
            </tr>
          </thead>
          <tbody>
            {labels.map((entry, index) => {
              const active = open === entry.id;
              const width = Math.max(2, (entry.reviewCount / ceiling) * 100);
              const aiInfo = aiNames?.[entry.id]?.category ? aiNames[entry.id] : null;
              const store = entry.category;
              // Baris pertama judul adalah AREA (nama kamus, atau interpretasi model atas frasa
              // yang sama); baris kedua adalah kalimat reviewers apa adanya. Tidak ada satu pun
              // kata di kolom ini yang berasal dari kepala: kamus domain, klaim model yang
              // ditandai, atau teks korpus.
              const dictionaryName = store ? areaName(store) : null;
              const area = aiInfo ? aiText(aiInfo.category) : dictionaryName;
              const areaSource = aiInfo ? 'ai' : store ? 'dictionary' : 'corpus';
              const reading = readings?.[entry.id] || null;
              const subLabel = aiInfo ? aiText(aiInfo.subLabel) : '';
              const cause = reading ? aiText(reading.cause) : '';
              const action = reading ? aiText(reading.action) : '';
              return (
                <tr key={entry.id} className={`border-b border-slate-800/50 last:border-0 ${active ? 'bg-slate-800/40' : ''}`}>
                  <th scope="row" className="min-w-[212px] py-1.5 pr-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setOpen(active ? null : entry.id)}
                      aria-expanded={active}
                      aria-controls={`label-detail-${index}`}
                      aria-label={`${area ? `${area}, ${t('evidenced by')}` : t('Reviewer wording')}: ${entry.evidence}. ${formatNumber(entry.reviewCount)} ${t('of')} ${formatNumber(pool)} ${t('1–2 star reviews')}, ${formatNumber(entry.phraseCount)} ${entry.phraseCount === 1 ? t('supporting phrase') : t('supporting phrases')}.`}
                      className="group flex w-full items-center gap-2 text-left"
                    >
                      {/* Bilahnya lebar tetap, nama fleksibel. Sebelumnya bilah ikut tumbuh sampai
                          110px dan menekan nama sampai 0px: di lebar 440px teksnya hilang seluruhnya. */}
                      <span className="relative h-3 w-[56px] shrink-0 overflow-hidden rounded-[2px] bg-slate-800/50">
                        <span className="absolute inset-y-0 left-0 rounded-[2px] bg-neg/70" style={{ width: `${width}%` }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          title={area || entry.evidence}
                          className={`block truncate text-[11px] font-semibold ${areaSource === 'corpus' ? 'font-mono' : 'capitalize'} ${active ? 'text-slate-50' : 'text-slate-200 group-hover:text-slate-50'}`}
                        >
                          {area || entry.evidence}
                        </span>
                        <span title={entry.evidence} className="block truncate font-mono text-[10px] leading-tight text-slate-400">
                          {area ? entry.evidence : `${t('reviewers wrote')}: ${entry.evidence}`}
                        </span>
                      </span>
                      {entry.phraseCount > 1 ? (
                        <span className="shrink-0 rounded border border-slate-700/70 px-1 text-[9px] uppercase tracking-wider text-slate-400">{t('cluster')}</span>
                      ) : (
                        <span className="shrink-0 rounded border border-slate-700/70 px-1 text-[9px] uppercase tracking-wider text-slate-400">{t('single')}</span>
                      )}
                    </button>
                    {active ? (
                      <div id={`label-detail-${index}`} role="group" aria-label={`${t('Phrases inside the complaint area')} ${area || entry.evidence}`} className="mt-1 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5">
                        <p className="label-sm">{t('Phrases in this cluster')} · {formatNumber(entry.phraseCount)}</p>
                        <ul className="mt-1 space-y-0.5">
                          {entry.phrases.map(phrase => (
                            <li key={phrase.text} className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">{phrase.text}</span>
                              <span className="num shrink-0 text-[10px] text-slate-400">
                                1–2★ {formatNumber(phrase.dfNegative)}
                                {phrase.dfPositive ? ` · 4–5★ ${formatNumber(phrase.dfPositive)}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 border-t border-slate-800/70 pt-1 text-[10px] leading-relaxed text-slate-400">
                          {formatNumber(entry.reviewCount)} {t('distinct reviews mention at least one of these phrases. Counting each phrase separately would report')} {formatNumber(entry.phrases.reduce((sum, phrase) => sum + phrase.dfNegative, 0))} {t('findings from the same people.')}
                          {entry.nameSource === 'term' ? ` ${t("The engine's short name for this cluster is")} ${entry.name} ${t('— the anchor word these phrases agree on; the full wording is listed above.')}` : ''}
                        </p>
                        {/* Dua baris interpretasi di bawah frasa: ia menyebut apa yang ditulis
                            reviewers, bukan apa yang terjadi di sistem. Tidak ada angka padanya,
                            dan sumbernya selalu bertanda. */}
                        {cause || action ? (
                          <div className="mt-1.5 border-t border-slate-800/70 pt-1.5">
                            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <AnalystBadge model={naming?.model} />
                              <span className="text-[10px] text-slate-400">{t('an interpretation of the wording above, not a measured cause')}</span>
                            </p>
                            {cause ? <p className="mt-1 text-[10px] leading-relaxed text-slate-300"><span className="label-sm">{t('Likely cause')}</span> {cause}</p> : null}
                            {action ? <p className="mt-0.5 text-[10px] leading-relaxed text-slate-300"><span className="label-sm">{t('Next action')}</span> {action}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </th>
                  <td className="py-1.5 pr-3 align-top text-[11px]">
                    <span
                      className="tag-quiet"
                      title={areaSource === 'ai'
                        ? `${t('Area named by')} ${naming?.model || t('the language model')} ${t('from the phrases in this row; every number in this row is measured by the corpus engine')}`
                        : areaSource === 'dictionary'
                          ? t('Area is the domain-dictionary topic carried by this cluster more densely than by other complaints')
                          : t('No naming cleared the evidence test, so this row shows reviewer wording only')}
                    >
                      {areaSource === 'ai' ? `AI · ${naming?.model || t('model')}` : areaSource === 'dictionary' ? t('domain dictionary') : t('reviewer wording')}
                    </span>
                    {aiInfo && store ? (
                      <span
                        title={`${t('Measured density')}: ${formatNumber(store.inside)} ${t('of')} ${formatNumber(entry.reviewCount)} ${t('reviews in this cluster carry the dictionary term')} ${dictionaryName}${t(', denser than among other complaints')}`}
                        className="mt-1 block truncate text-[10px] text-slate-400"
                      >
                        {t('measured')}: {dictionaryName}
                      </span>
                    ) : null}
                    {subLabel ? <span className="block truncate text-[10px] text-slate-400">{subLabel}</span> : null}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-[11px] text-slate-400">{formatNumber(entry.phraseCount)}</td>
                  <td className="num py-1.5 pr-3 text-right text-[12px] font-bold text-slate-100">{formatNumber(entry.reviewCount)}</td>
                  <td className="num py-1.5 pr-3 text-right text-[11px] text-neg">{formatPercent(entry.reviewCount, pool)}</td>
                  <td className="num py-1.5 pr-3 text-right text-[11px] text-slate-400">
                    {entry.praiseCount == null ? '—' : formatNumber(entry.praiseCount)}
                  </td>
                  <td className="py-1.5 pr-3 text-right"><Trend entry={entry} /></td>
                  <td className="num py-1.5 pr-3 text-right text-[11px] text-slate-400">{entry.severity == null ? '—' : entry.severity.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-slate-400">
        {t("The first line of a row is its area: the domain-dictionary topic this cluster carries more densely than other complaints, or a category named by")} {naming?.model || t('the language model')} {t("when the AI layer answered. The second line is always the reviewers' own wording, so every row can be traced to the text it came from")}{' '}
        {headed ? <span className="num">({formatNumber(headed)} {t('of')} {formatNumber(labels.length)} {t('rows carry a dictionary area')})</span> : null}. {t('Two phrases are grouped only when more reviews carry both than chance explains. Trend is the daily rate of the second half of the observed period against the first.')} {formatNumber(singletons)} {singletons === 1 ? t('label is') : t('labels are')} {singletons === 1 ? t('a single phrase') : t('single phrases')};{' '}
        {metrics.trimmedLabels
          ? <>{formatNumber(metrics.trimmedLabels)} {t('clusters fell outside the display budget and are counted in the metrics instead of being dropped silently.')}</>
          : t('every cluster fits the display budget.')}
        {filtered ? ` ${t('Counts cover the whole corpus, not the active filter.')}` : ''}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
        {t('The Named by column and the two interpretation lines inside a row are the interpreted parts, and the layer state is reported as it is:')}{' '}
        {naming?.status === 'answered'
          ? <>{t('it ran with')} <span className="font-semibold text-slate-400">{naming.model}</span> {t('over')} {formatNumber(naming.clusters || 0)} {t('clusters and')} {aiCount ? <span className="num">{formatNumber(aiCount)}</span> : t('no')} {t('of the rows shown')} {aiCount === 1 ? t('carries') : t('carry')} {t('its name')}; {readCount ? <span className="num">{formatNumber(readCount)}</span> : t('no')} {readCount === 1 ? t('row carries') : t('rows carry')} {t('a cause and a next action')}{termCount ? <>, {formatNumber(termCount)} {t('carry a domain topic name denser inside this cluster than among other complaints')}</> : null}{maskedTermCount ? <>, {formatNumber(maskedTermCount)} {maskedTermCount === 1 ? t('further topic name') : t('further topic names')} {t('measured here but shown under the model name')}</> : null}{orphanNames ? <>, {formatNumber(orphanNames)} {orphanNames === 1 ? t('returned name') : t('returned names')} {t('matched no row on this table and')} {orphanNames === 1 ? t('was') : t('were')} {t('ignored')}</> : null}.</>
          : naming?.status === 'skipped'
            ? <>{t('it did not run —')} {naming.reason || t('the analyst layer was not configured')} {t('— so every area below comes from the domain dictionary, or the row shows reviewer wording only.')}</>
            : naming?.status === 'failed'
              ? <>{t('it ran and failed —')} {naming.reason || t('no usable text came back')}{naming.detail ? <>, {t('source said')}: {naming.detail}</> : null}{Array.isArray(naming.tried) && naming.tried.length > 1 ? <>, {t('models tried')}: <span className="font-mono">{naming.tried.map(entry => `${entry.model} (${entry.status ?? t('no answer')})`).join(', ')}</span></> : null} {t('— so every area below comes from the domain dictionary, or the row shows reviewer wording only.')}</>
              : t('this snapshot has no analyst record at all; it was pulled before the layer existed, or nothing was measured for it to read.')}{' '}
        {t('No number in the table comes from the analyst — counts, shares and trend are measured.')}
      </p>
    </ChartFrame>
  );
}
