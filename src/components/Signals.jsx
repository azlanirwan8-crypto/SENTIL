import { formatDecimal, formatNumber } from '../lib/format.js';
import { t, topicLabel } from '../lib/i18n.js';
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
// Sebutannya mengikuti register laporan tim, bukan register percakapan.
const KINDS = {
  theme: { label: 'volume', tone: 'text-slate-200 border-slate-700' },
  rise: { label: 'rate rising', tone: 'text-neg border-neg/40' },
  fall: { label: 'rate easing', tone: 'text-pos border-pos/40' },
  channel: { label: 'concentration', tone: 'text-slate-200 border-slate-700' },
  shared: { label: 'counter-evidence', tone: 'text-slate-200 border-slate-700' },
  structure: { label: 'structure', tone: 'text-slate-200 border-slate-700' },
  coverage: { label: 'coverage limit', tone: 'text-slate-400 border-slate-700' },
};

// Nama area yang dibaca manajer di baris sinyal diambil dari sumber yang sama persis dengan
// tabel Complaint labels: nama yang diusulkan model (bertanda AI), lalu istilah kamus domain
// yang densitasnya terukur, lalu tidak sama sekali. Sinyal sendiri tidak pernah dinamai ulang —
// kalimat dan angkanya tetap tulisan mesin pengukuran.
export function signalAreaLookup({ pain, topics, ai } = {}) {
  const byId = new Map((Array.isArray(pain?.labels) ? pain.labels : []).map(label => [label.id, label]));
  const topicsById = new Map((Array.isArray(topics) ? topics : []).map(topic => [topic.id, topic]));
  const names = ai?.status === 'answered' ? ai.names || {} : null;
  return (item) => {
    const label = byId.get(item?.refs?.[0]);
    if (!label) return null;
    const model = names?.[label.id]?.category ? names[label.id] : null;
    if (model) return { name: aiText(model.category), source: `AI · ${ai.model || t('model')}` };
    if (label.category) return { name: topicLabel(topicsById.get(label.category.id) || label.category), source: t('domain dictionary') };
    return null;
  };
}

function factValue(entry) {
  if (entry.unit === 'percent') return `${formatDecimal(entry.value * 100, 1)}%`;
  if (entry.unit === 'ratio') return `${formatDecimal(entry.value, 2)}×`;
  if (entry.unit === 'text') return String(entry.value);
  return formatNumber(entry.value);
}

export function Signal({ item, area = null }) {
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
      {area ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="label-sm">{t('Area')}</span>
          <span className="text-[11px] font-semibold capitalize text-slate-200">{area.name}</span>
          <span className="tag-quiet" title={t('the same source that named this row in Complaint labels')}>{area.source}</span>
        </p>
      ) : null}
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

export function Signals({ signals, pain = null, topics = null, ai = null, filtered = false }) {
  const narrative = ai?.status === 'answered' ? aiText(ai.reading?.narrative) : '';
  const areaFor = signalAreaLookup({ pain, topics, ai });
  if (!signals || !Array.isArray(signals.items)) {
    return (
      <ChartFrame label={t('Analyst signals')}>
        <EmptyState
          compact
          icon={IconGauge}
          title={t('This snapshot predates the signal layer')}
          body={t('Each line is written by the engine that measures it. Run the pull again and these lines are rebuilt from the numbers the tables already show.')}
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
          title={t('Nothing cleared the test')}
          body={t('Nothing stood out more than luck would explain, and nothing here repeats a table. An empty panel is the honest answer — no line was written just to fill it.')}
        />
      </ChartFrame>
    );
  }

  const basis = signals.basis || {};
  const metrics = signals.metrics || {};
  const meta = `${formatNumber(metrics.reported)} ${t('of')} ${formatNumber(metrics.candidates)} ${t('measured')}`
    + `${basis.reviews ? ` · ${formatNumber(basis.reviews)} ${t('reviews')}` : ''}`
    + `${filtered ? ` · ${t('all reviews')}` : ''}`;

  return (
    <ChartFrame
      label={t('Analyst signals')}
      meta={meta}
      legend={<span className="text-[10px] text-slate-400">{t('every line is backed by the numbers under it')}</span>}
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
            {t('This paragraph reads the lines below it. It was written from order and wording, not from counts, so it carries no number on purpose.')}
          </p>
        </div>
      ) : null}
      <ul className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
        {signals.items.map(item => <Signal key={item.id} item={item} area={areaFor(item)} />)}
      </ul>
      <p className="mt-2 shrink-0 border-t border-slate-800/70 pt-1.5 text-[10px] leading-relaxed text-slate-400">
        {t('A line appears only when the difference between two shares is too big to be luck. That is the same test that admits a phrase or a topic, and no cutoff is picked per project. Direction compares the second half of')} <span className="num">{basis.trend ? `${basis.trend.firstDay} → ${basis.trend.lastDay}` : t('the observed period')}</span> {t('with the first')}{basis.trend && basis.trend.earlyNegative != null
          ? <> — <span className="num">{formatNumber(basis.trend.earlyNegative)}</span> {t('complaints then,')} <span className="num">{formatNumber(basis.trend.lateNegative)}</span> {t('in the second half.')}</>
          : null}
        {metrics.trimmed
            ? <><span className="num">{formatNumber(metrics.trimmed)}</span> {t('candidates sat outside the display budget and are counted above.')}</>
            : t('Nothing was trimmed.')}
        {filtered ? ` ${t('Counts cover every review in this project, not only the filtered ones.')}` : ''}
      </p>
    </ChartFrame>
  );
}
