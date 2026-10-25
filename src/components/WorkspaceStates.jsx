import { useEffect, useState } from 'react';
import { formatDateTime, formatNumber } from '../lib/format.js';
import { StoreMark } from './Brand.jsx';
import { Notice } from './Notices.jsx';
import { EmptyState } from './EmptyState.jsx';
import { IconAlert, IconArrowRight, IconRefresh, IconSearchSignal } from './icons.jsx';

function ScanLine({ label, detail, tone = 'teal' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-paper-50/10 bg-paper-50/[0.045] p-3.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone === 'amber' ? 'bg-amber' : 'bg-teal'} text-paper-50`}>
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-bold text-paper-50/90">{label}</p>
        <p className="mt-0.5 text-[9.5px] text-paper-50/45">{detail}</p>
      </div>
      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-teal-bright" aria-hidden="true" />
    </div>
  );
}

export function SyncScreen({ workspace }) {
  const [elapsed, setElapsed] = useState(0);
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-5 space-y-4" aria-busy="true" aria-live="polite">
      <section className="surface overflow-hidden p-5 sm:p-7">
        <div className="grid items-center gap-7 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="rule-label">Penarikan pertama</div>
            <h2 className="mt-4 text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.05] text-ink">Membaca dua sumber publik.</h2>
            <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-ink-muted">
              Ulasan ditarik langsung dari halaman publik, lalu mesin mempelajari bobot kata dari rating yang ikut terbaca. Tidak ada data contoh dan tidak ada isian pengganti.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-100 px-3 py-1.5 text-[10.5px] font-semibold text-ink-soft">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-teal" />
                {elapsed < 1 ? 'baru dimulai' : `${elapsed} detik berjalan`}
              </span>
              <span className="text-[10px] text-ink-faint">biasanya selesai dalam hitungan detik</span>
            </div>
          </div>

          <div className="dark-panel noise-dark rounded-2xl border border-ink p-4 text-paper-50">
            <p className="mb-3 text-[8.5px] font-bold uppercase tracking-[0.18em] text-paper-50/40">Permintaan berjalan</p>
            <div className="space-y-2">
              {stores.map(store => (
                <ScanLine
                  key={store}
                  label={store === 'play' ? 'Google Play' : 'App Store'}
                  detail={`${workspace.stores[store].appId} · ulasan publik`}
                  tone={store === 'play' ? 'teal' : 'amber'}
                />
              ))}
              <ScanLine label="Model korpus" detail="Stopwords frekuensi · bobot rating · klaster" />
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-paper-50/35">
              Status per tahap tidak dialirkan dari server; waktu di samping adalah waktu permintaan yang sebenarnya.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map(index => (
          <div key={index} className="surface min-h-[152px] p-4">
            <div className="skeleton h-2.5 w-16" />
            <div className="skeleton mt-5 h-9 w-24" />
            <div className="skeleton mt-5 h-2 w-full" />
            <div className="skeleton mt-2 h-2 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelState({ channel, workspaceStore, store }) {
  const status = channel?.status || 'pending';
  const badge = {
    error: ['Gagal', 'border-coral/25 bg-coral-soft/50 text-coral-deep'],
    empty: ['Kosong', 'border-line-strong/50 bg-paper-200 text-ink-muted'],
    partial: ['Parsial', 'border-amber/25 bg-amber-soft/55 text-amber-deep'],
    success: ['Lengkap', 'border-teal/25 bg-teal-soft/60 text-teal-deep'],
    pending: ['Menunggu', 'border-line bg-paper-100 text-ink-faint'],
  }[status] || ['Menunggu', 'border-line bg-paper-100 text-ink-faint'];
  return (
    <div className="rounded-2xl border border-line/80 bg-paper-100/60 p-4">
      <div className="flex items-center gap-2.5">
        <StoreMark store={store} size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold text-ink">{store === 'play' ? 'Google Play' : 'App Store'}</p>
          <p className="truncate font-mono text-[9px] text-ink-faint">{workspaceStore?.appId || 'N/A'}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${badge[1]}`}>{badge[0]}</span>
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
        {channel?.message || 'Kanal belum pernah ditarik. Tidak ada angka yang ditampilkan sebelum sumber benar-benar menjawab.'}
      </p>
      <p className="mt-2 text-[9.5px] text-ink-faint">{channel?.fetched != null ? `${formatNumber(channel.fetched)} ulasan terbaca` : 'Tidak ada angka terbaca'}</p>
    </div>
  );
}

export function WorkspaceEmpty({ workspace, dataset, datasetError, syncError, syncing, onRefresh }) {
  const channels = Array.isArray(dataset?.channels) ? dataset.channels : [];
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  const stores = ['play', 'appstore'].filter(store => workspace.stores?.[store]?.appId);
  const allError = channels.length > 0 && channels.every(channel => channel.status === 'error');
  const title = dataset
    ? allError ? 'Kanal tidak dapat dibaca' : 'Tidak ada ulasan tertulis yang terbaca'
    : syncError ? 'Penarikan gagal' : 'Snapshot belum ada';
  const body = dataset
    ? allError
      ? 'Sumber publik menolak atau tidak merespons pada penarikan terakhir. Ini kegagalan sumber, bukan bukti nol ulasan. Data lama, bila ada, dipertahankan.'
      : 'Sumber terhubung, tetapi tidak ada ulasan tertulis publik yang dikembalikan untuk kanal yang dipilih. Ini bukan berarti aplikasi tidak memiliki ulasan.'
    : syncError || datasetError || 'Workspace ini belum memiliki salinan data. Tarik ulasan publik untuk mulai membaca sinyalnya.';

  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      {(syncError || datasetError) && dataset && (
        <Notice tone="coral" title="Catatan pemuatan" live>{syncError || datasetError}</Notice>
      )}
      <section className="surface overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_0.9fr]">
          <div className="p-6 sm:p-8">
            <EmptyState
              icon={syncError ? IconAlert : IconSearchSignal}
              title={title}
              body={body}
              action={
                <button type="button" onClick={onRefresh} disabled={syncing} className="btn btn-primary">
                  <IconRefresh size={15} />
                  {syncing ? 'Menarik data…' : 'Tarik data sekarang'}
                  {!syncing && <IconArrowRight size={14} />}
                </button>
              }
            />
            {dataset?.fetchedAt && (
              <p className="mt-1 text-center text-[9.5px] text-ink-faint">
                Snapshot terakhir: {formatDateTime(dataset.fetchedAt)}
              </p>
            )}
          </div>
          <div className="border-t border-line/80 bg-paper-100/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <p className="rule-label">Status kanal</p>
            <div className="mt-3 space-y-2.5">
              {stores.map(store => (
                <ChannelState
                  key={store}
                  store={store}
                  channel={byId.get(store)}
                  workspaceStore={workspace.stores[store]}
                />
              ))}
            </div>
            <p className="mt-4 text-[9.5px] leading-relaxed text-ink-faint">
              Tidak ada metrik yang diisi otomatis saat kanal gagal. Grafik hanya akan muncul dari ulasan yang benar-benar terbaca.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
