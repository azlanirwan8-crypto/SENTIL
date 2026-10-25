import { KpiRow } from './KpiRow.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { DailyTrend } from './charts/DailyTrend.jsx';
import { ChannelDonut } from './charts/ChannelDonut.jsx';
import { PainTreemap } from './charts/PainTreemap.jsx';
import { PlatformBars } from './charts/PlatformBars.jsx';

export function Overview({ dataset, workspace }) {
  const model = dataset.model || {};
  return (
    <div className="space-y-6">
      <KpiRow dataset={dataset} />

      <section aria-labelledby="charts-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="rule-label">Pembacaan</div>
            <h2 id="charts-title" className="mt-1.5 text-[22px] leading-tight text-ink">Empat sudut dari satu korpus</h2>
          </div>
          <p className="text-[10px] text-ink-faint">
            {Array.isArray(model.daily) ? `${model.daily.length} hari berulasan` : 'N/A'} · {Array.isArray(model.platforms) ? `${model.platforms.length} kanal` : 'N/A'} · seluruh baris dihitung
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <DailyTrend daily={model.daily} />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <ChannelDonut platforms={model.platforms} />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <PainTreemap clusters={model.clusters} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <PlatformBars platforms={model.platforms} />
          </div>
        </div>
      </section>

      <ChannelStrip dataset={dataset} workspace={workspace} />
    </div>
  );
}
