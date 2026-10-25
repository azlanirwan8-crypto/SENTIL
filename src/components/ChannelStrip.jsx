import { channelStatusLabel, formatDateTime, formatDecimal, formatNumber, isNumber } from '../lib/format.js';
import { StoreMark, StoreName } from './Brand.jsx';
import { IconAlert, IconExternal, IconInfo } from './icons.jsx';

const STATUS_STYLES = {
  success: 'border-teal/20 bg-teal-soft/70 text-teal-deep',
  partial: 'border-amber/25 bg-amber-soft/60 text-amber-deep',
  empty: 'border-line-strong/40 bg-paper-200/70 text-ink-muted',
  error: 'border-coral/25 bg-coral-soft/60 text-coral-deep',
};

function Num({ label, value, accent = false }) {
  return (
    <div>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={`num mt-1 text-[16px] font-semibold leading-none ${accent ? 'text-coral-deep' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function ChannelCard({ channel, store, workspaceStore, fetchedAt }) {
  const selected = Boolean(workspaceStore?.appId);
  const app = channel?.app || null;
  const coverage = channel?.coverage || null;
  const title = app?.title || workspaceStore?.title || 'N/A';
  const developer = app?.developer || workspaceStore?.developer || 'N/A';
  const score = isNumber(app?.score) ? formatDecimal(app.score, 2) : 'N/A';
  const storeRatings = app?.ratingCount ?? app?.ratings;
  const ratings = isNumber(storeRatings) ? formatNumber(storeRatings) : 'N/A';
  const url = app?.url || workspaceStore?.url || null;
  const status = channel?.status || (selected ? 'error' : 'missing');
  const reported = isNumber(coverage?.reportedReviewCount) ? Number(coverage.reportedReviewCount) : null;
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.empty;

  return (
    <article className="rounded-[18px] border border-line/80 bg-paper-50/80 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StoreMark store={store} size={38} />
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight text-ink">{StoreName({ store })}</p>
            <p className="mt-0.5 truncate text-[10.5px] text-ink-faint">{workspaceStore?.appId || channel?.appId || 'N/A'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusStyle}`}>
            {selected ? channelStatusLabel(status) : 'Tidak disertakan'}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper-50 text-ink-faint transition hover:border-line-strong hover:text-ink"
              aria-label={`Buka ${StoreName({ store })} di tab baru`}
              title="Buka di toko"
            >
              <IconExternal size={13} />
            </a>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="truncate text-[14px] font-bold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 truncate text-[10.5px] text-ink-muted">{developer}</p>
      </div>

      {!selected ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-paper-100/50 px-3 py-3 text-[10.5px] leading-relaxed text-ink-faint">
          Kanal ini tidak dipilih saat analisis dibuat. Tidak ada angka kanal yang ditampilkan.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Num label="Skor toko" value={score} />
          <Num label="Penilaian" value={ratings} />
          <Num label="Terbaca" value={channel?.fetched == null ? 'N/A' : formatNumber(channel.fetched)} />
        </div>
      )}

      {selected && channel && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-ink-faint">
            <span>{reportCountText(coverage, reported)}</span>
            {app?.installs && <span>· {app.installs}</span>}
            <span>· {formatDateTime(channel.cache?.fetchedAt || fetchedAt)}</span>
          </div>
          {channel.truncated && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-soft/45 px-2.5 py-2 text-[10px] leading-relaxed text-amber-deep">
              <IconAlert size={12} className="mt-0.5 shrink-0" /> Hasil kanal ini belum lengkap; lihat catatan sumber di tab Metode &amp; data.
            </p>
          )}
          {channel.status === 'error' && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-coral-soft/40 px-2.5 py-2 text-[10px] leading-relaxed text-coral-deep">
              <IconAlert size={12} className="mt-0.5 shrink-0" /> {channel.message}
            </p>
          )}
          {channel.status === 'empty' && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-paper-200/70 px-2.5 py-2 text-[10px] leading-relaxed text-ink-muted">
              <IconInfo size={12} className="mt-0.5 shrink-0" /> {channel.message}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function reportCountText(coverage, reported) {
  if (!coverage) return 'Cakupan kanal tidak tersedia';
  if (reported != null) return `${formatNumber(reported)} ulasan tertulis dilaporkan toko`;
  if (Number.isInteger(coverage.shelfReviews)) {
    return `Halaman ulasan ${formatNumber(coverage.shelfReviews)} · feed ${formatNumber(coverage.feedReviews)}`;
  }
  return `Halaman ${formatNumber(coverage.pages)}`;
}

export function ChannelStrip({ dataset, workspace }) {
  const channels = Array.isArray(dataset.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  return (
    <section aria-labelledby="sumber-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rule-label">Sumber</div>
          <h2 id="sumber-title" className="mt-1.5 text-[22px] leading-tight text-ink">Kanal yang benar-benar dibaca</h2>
        </div>
        <p className="text-[10px] text-ink-faint">Skor toko berasal dari halaman publik, bukan dihitung ulang.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {['play', 'appstore'].map(store => (
          <ChannelCard
            key={store}
            store={store}
            channel={byId.get(store)}
            workspaceStore={workspace?.stores?.[store]}
            fetchedAt={dataset.fetchedAt}
          />
        ))}
      </div>
    </section>
  );
}
