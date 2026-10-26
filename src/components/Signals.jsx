import { formatDecimal, formatNumber } from '../lib/format.js';
import { ChartFrame } from './charts/ChartFrame.jsx';
import { EmptyState } from './EmptyState.jsx';
import { IconAlert, IconGauge } from './icons.jsx';

// Panel ini tidak merangkai kalimat: setiap baris dikirim oleh lapisan sinyal sebagai angka
// hasil ukur plus satu kalimat yang angkanya ada di dalam `facts`. Tugas klien hanya memformat
// ulang angka itu, tidak menafsir atau menambahkan klaim.

const KINDS = {
  theme: { label: 'theme', tone: 'text-neg border-neg/40' },
  rise: { label: 'rising', tone: 'text-neg border-neg/40' },
  fall: { label: 'easing', tone: 'text-pos border-pos/40' },
  channel: { label: 'channel', tone: 'text-neu border-neu/40' },
  shared: { label: 'counter-read', tone: 'text-slate-300 border-slate-600' },
  structure: { label: 'structure', tone: 'text-accent border-accent/40' },
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
    <li className="break-inside-avoid rounded border border-slate-800/70 bg-slate-900/40 px-2 py-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-bold uppercase tracking-wider ${kind.tone}`}>
          {kind.label}
        </span>
        <p className="min-w-0 text-[12px] font-bold leading-snug text-slate-100">{item.title}</p>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.body}</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-800/60 pt-1" aria-label={`Measurements behind: ${item.title}`}>
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

export function Signals({ signals, filtered = false }) {
  if (!signals || !Array.isArray(signals.items)) {
    return (
      <ChartFrame label="Analyst signals">
        <EmptyState
          compact
          icon={IconGauge}
          title="This snapshot predates the signal layer"
          body="Signals are written by the engine that measures them. Pull this project again and the analysis lines are rebuilt from the same numbers the tables show."
        />
      </ChartFrame>
    );
  }

  if (!signals.items.length) {
    return (
      <ChartFrame label="Analyst signals" meta={`${formatNumber(signals.metrics?.candidates || 0)} candidates`}>
        <EmptyState
          compact
          icon={IconAlert}
          title="No signal cleared the test"
          body="Every candidate reading was either too thin to separate from chance or already reported by a table. An empty panel here is the honest result — no sentence was written to fill it."
        />
      </ChartFrame>
    );
  }

  const basis = signals.basis || {};
  const metrics = signals.metrics || {};
  const meta = `${formatNumber(metrics.reported)} of ${formatNumber(metrics.candidates)} measured`
    + `${basis.reviews ? ` · ${formatNumber(basis.reviews)} reviews` : ''}`
    + `${filtered ? ' · whole corpus' : ''}`;

  return (
    <ChartFrame
      label="Analyst signals"
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">each line is a claim its own numbers support</span>}
      bodyClassName="flex flex-col"
    >
      <ul className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
        {signals.items.map(item => <Signal key={item.id} item={item} />)}
      </ul>
      <p className="mt-2 shrink-0 border-t border-slate-800/70 pt-1.5 text-[10px] leading-relaxed text-slate-400">
        A line is written only when the gap between two proportions is larger than the standard error of that
        gap — the same test that admits a phrase or a topic, with no threshold chosen per project. Direction
        compares the second half of <span className="num">{basis.trend ? `${basis.trend.firstDay} → ${basis.trend.lastDay}` : 'the observed period'}</span> against the
        first{basis.trend && basis.trend.earlyNegative != null
          ? <> on <span className="num">{formatNumber(basis.trend.earlyNegative)}</span> vs <span className="num">{formatNumber(basis.trend.lateNegative)}</span> complaints</>
          : null}. {metrics.trimmed
            ? <><span className="num">{formatNumber(metrics.trimmed)}</span> candidates sat outside the display budget and are counted above.</>
            : 'Nothing was trimmed.'}
        {filtered ? ' Signals are computed on the whole corpus, not the active filter.' : ''}
      </p>
    </ChartFrame>
  );
}
