import { IconArrowRight, IconPlus } from './icons.jsx';
import { t } from '../lib/i18n.js';

const STEPS = [
  { n: '01', title: 'Fill in two fields', body: 'Analysis name and target entity.' },
  { n: '02', title: 'Pick the store channels', body: 'Play and App Store candidates appear automatically.' },
  { n: '03', title: 'Pull & read', body: 'The pull runs on the server and the page checks back; every review that is read enters the corpus model.' },
];

export function Welcome({ onAdd }) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center py-6">
      <section className="card w-full max-w-[520px] animate-fade-in overflow-hidden shadow-[0_18px_50px_-24px_rgba(2,6,23,0.9)]">
        <div className="border-b border-slate-800/80 px-4 py-3.5">
          <p className="label-sm">{t('Analysis workspace · public data')}</p>
          <h1 className="mt-1.5 text-[15px] font-extrabold tracking-tight text-slate-100">{t('No active analysis yet')}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {t('One workspace = one entity analysed from Google Play and the App Store.')}
          </p>
          <button type="button" onClick={onAdd} className="btn btn-primary mt-3 w-full">
            <IconPlus size={14} />
            {t('Start the first analysis')}
            <IconArrowRight size={13} />
          </button>
        </div>

        <ol className="grid sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.n}
              className={`px-4 py-3 ${index < STEPS.length - 1 ? 'border-b border-slate-800/70 sm:border-b-0 sm:border-r' : ''}`}
            >
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-accent">{step.n}</p>
              <p className="mt-1.5 text-[11.5px] font-bold text-slate-200">{t(step.title)}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{t(step.body)}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 bg-slate-950/40 px-4 py-2.5">
          <span className="chip">{t('9 channels')}</span>
          <span className="chip">{t('1 h cache · incremental pull')}</span>
          <span className="chip">{t('23-topic ID/EN dictionary')}</span>
          <span className="chip">{t('0 hand-written sentiment rules')}</span>
          <span className="chip">{t('Nothing stored in your browser')}</span>
        </div>
      </section>
    </div>
  );
}
