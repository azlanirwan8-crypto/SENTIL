import { formatDecimal, formatNumber } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { AnalystBadge, aiText } from './Analyst.jsx';
import { ChartFrame } from './charts/ChartFrame.jsx';
import { EmptyState } from './EmptyState.jsx';
import { IconAlert, IconGauge } from './icons.jsx';

// Panel ini tidak merangkai kalimat: setiap baris dikirim oleh lapisan sinyal sebagai angka
// hasil ukur plus satu kalimat yang angkanya ada di dalam `facts`. Tugas klien hanya memformat
// ulang angka itu, tidak menafsir atau menambahkan klaim. Bacaan lapisan `ai-analyst-v1` duduk
// di atas daftar itu sebagai satu blok tersendiri — bertemukan, dan tidak pernah menyamar
// sebagai salah satu baris terukur.

// Hanya arah yang boleh berwarna. Enam warna kategori pada baris sedekat ini membaca sebagai
// permen, bukan sebagai temuan: theme/channel/structure hanyalah pengelompok, jadi mereka netral,
// dan accent ditinggalkan untuk status interaksi. rose/emerald tetap berarti memburuk/membaik.
const KINDS = {
  theme: { label: 'theme', tone: 'text-slate-200 border-slate-700' },
  rise: { label: 'rising', tone: 'text-neg border-neg/40' },
  fall: { label: 'easing', tone: 'text-pos border-pos/40' },
  channel: { label: 'channel', tone: 'text-slate-200 border-slate-700' },
  shared: { label: 'counter-read', tone: 'text-slate-200 border-slate-700' },
  structure: { label: 'structure', tone: 'text-slate-200 border-slate-700' },
  coverage: { label: 'limit', tone: 'text-slate-400 border-slate-700' },
};

function factValue(entry) {
  if (entry.unit === 'percent') return `${formatDecimal(entry.value * 100, 1)}%`;
  if (entry.unit === 'ratio') return `${formatDecimal(entry.value, 2)}×`;
  if (entry.unit === 'text') return String(entry.value);
  return formatNumber(entry.value);
}

export function Signal({ item }) {
  const kind = KINDS[item.kind] || { label: item.kind, tone: 'text-slate-300 border-slate-700' };
  return (
    <li className="break-inside-avoid rounded border border-slate-800/70 bg-slate-900/40 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className={`shrink-0 rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${kind.tone}`}>
          {t(kind.label)}
        </span>
        {/* judul dan badan kalimat ditulis mesin di server: keduanya data, tidak diterjemahkan */}
        <p className="min-w-0 text-[12px] font-bold leading-snug text-slate-100">{item.title}</p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{item.body}</p>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-800/60 pt-1.5" aria-label={`${t('Measurements behind')}: ${item.title}`}>
        {item.facts.map(entry => (
          <li key={entry.key} className="flex items-baseline gap-1">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">{entry.label}</span>
            <span className="num text-[11px] font-semibold text-slate-200">{factValue(entry)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function Signals({ signals, ai = null, filtered = false }) {
  const narrative = ai?.status === 'answered' ? aiText(ai.reading?.narrative) : '';
  if (!signals || !Array.isArray(signals.items)) {
    return (
      <ChartFrame label={t('Analyst signals')}>
        <EmptyState
          compact
          icon={IconGauge}
          title={t('This snapshot predates the signal layer')}
          body={t('Signals are written by the engine that measures them. Pull this project again and the analysis lines are rebuilt from the same numbers the tables show.')}
        />
      </ChartFrame>
    );
  }

  if (!signals.items.length) {
    return (
      <ChartFrame label={t('Analyst signals')} meta={`${formatNumber(signals.metrics?.candidates || 0)} ${t('candidates')}`}>
        <EmptyState
          compact
          icon={IconAlert}
          title={t('No signal cleared the test')}
          body={t('Every candidate reading was either too thin to separate from chance or already reported by a table. An empty panel here is the honest result — no sentence was written to fill it.')}
        />
      </ChartFrame>
    );
  }

  const basis = signals.basis || {};
  const metrics = signals.metrics || {};
  const meta = `${formatNumber(metrics.reported)} ${t('of')} ${formatNumber(metrics.candidates)} ${t('measured')}`
    + `${basis.reviews ? ` · ${formatNumber(basis.reviews)} ${t('reviews')}` : ''}`
    + `${filtered ? ` · ${t('whole corpus')}` : ''}`;

  return (
    <ChartFrame
      label={t('Analyst signals')}
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">{t('each line is a claim its own numbers support')}</span>}
      bodyClassName="flex flex-col"
    >
      {narrative ? (
        <div className="mb-2 shrink-0 rounded border border-slate-600/70 bg-slate-800/40 px-2.5 py-2">
          <div className="flex items-baseline gap-2">
            <span className="label-sm shrink-0">{t('Analyst reading')}</span>
            <AnalystBadge model={ai.model} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-200">{narrative}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-400">
            {t('This paragraph interprets the lines below it. It was written from rankings and wording, not from counts, and it contains no number by design.')}
          </p>
        </div>
      ) : null}
      <ul className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
        {signals.items.map(item => <Signal key={item.id} item={item} />)}
      </ul>
      <p className="mt-2 shrink-0 border-t border-slate-800/70 pt-1.5 text-[10px] leading-relaxed text-slate-400">
        {t('A line is written only when the gap between two proportions is larger than the standard error of that gap — the same test that admits a phrase or a topic, with no threshold chosen per project. Direction compares the second half of')} <span className="num">{basis.trend ? `${basis.trend.firstDay} → ${basis.trend.lastDay}` : t('the observed period')}</span> {t('against the first')}{basis.trend && basis.trend.earlyNegative != null
          ? <> {t('on')} <span className="num">{formatNumber(basis.trend.earlyNegative)}</span> {t('vs')} <span className="num">{formatNumber(basis.trend.lateNegative)}</span> {t('complaints')}</>
          : null}. {metrics.trimmed
            ? <><span className="num">{formatNumber(metrics.trimmed)}</span> {t('candidates sat outside the display budget and are counted above.')}</>
            : t('Nothing was trimmed.')}
        {filtered ? ` ${t('Signals are computed on the whole corpus, not the active filter.')}` : ''}
      </p>
    </ChartFrame>
  );
}
