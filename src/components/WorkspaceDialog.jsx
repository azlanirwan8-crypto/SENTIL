import { useCallback, useEffect, useRef, useState } from 'react';
import { discoverStores } from '../lib/api.js';
import { formatDecimal, formatNumber, isNumber } from '../lib/format.js';
import { DialogShell } from './Dialog.jsx';
import { StoreGlyph, StoreMark } from './Brand.jsx';
import { IconAlert, IconCheck, IconExternal, IconInfo, IconRefresh, IconSearch, IconStar } from './icons.jsx';

const EMPTY_SELECTION = { play: null, appstore: null };
const MIN_SEARCH_LENGTH = 3;

function CandidateSkeleton() {
  return (
    <div className="rounded-xl border border-line/70 bg-paper-50 p-3.5">
      <div className="skeleton h-3 w-2/3" />
      <div className="skeleton mt-2.5 h-2.5 w-1/2" />
      <div className="skeleton mt-4 h-2.5 w-1/3" />
    </div>
  );
}

function CandidateCard({ store, candidate, checked, onSelect }) {
  const id = `candidate-${store}-${candidate.appId}`;
  const score = isNumber(candidate.score) ? formatDecimal(candidate.score, 2) : 'N/A';
  const ratingCount = isNumber(candidate.ratings) ? `${formatNumber(candidate.ratings)} penilaian` : null;
  const storeLabel = store === 'play' ? 'Google Play' : 'App Store';
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={`candidate-${store}`}
        value={candidate.appId}
        checked={checked}
        onChange={() => onSelect(candidate)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 pr-11 transition peer-focus-visible:ring-2 peer-focus-visible:ring-teal/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper-50 ${
          checked
            ? 'border-teal bg-teal-soft/45 shadow-[inset_0_0_0_1px_rgba(14,107,90,.15)]'
            : 'border-line/80 bg-paper-50 hover:border-line-strong hover:bg-paper-100/80'
        }`}
      >
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
            checked ? 'border-teal bg-teal text-paper-50' : 'border-line-strong bg-transparent text-transparent'
          }`}
          aria-hidden="true"
        >
          <IconCheck size={11} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-snug text-ink">{candidate.title || 'N/A'}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">{candidate.developer || 'N/A'}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-ink-faint">
            <span className="inline-flex items-center gap-1 font-semibold text-ink-soft">
              <IconStar size={11} className={isNumber(candidate.score) ? 'text-amber-bright' : 'text-ink-faint'} />
              {score}
            </span>
            {ratingCount && <span>{ratingCount}</span>}
            <span className="rounded bg-paper-200/80 px-1.5 py-0.5 font-mono text-[9.5px] tracking-tight text-ink-muted">{candidate.appId}</span>
          </span>
        </span>
      </label>
      <a
        href={candidate.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper-200 hover:text-ink"
        aria-label={`Buka ${candidate.title || 'kandidat'} di ${storeLabel}`}
        title={`Buka di ${storeLabel}`}
      >
        <IconExternal size={13} />
      </a>
    </div>
  );
}

function StoreColumn({ store, data, phase, selection, onSelect }) {
  const candidates = data?.candidates || [];
  const searching = phase === 'searching';
  return (
    <section className="flex min-h-[300px] flex-col rounded-2xl border border-line/80 bg-paper-100/55 p-3.5">
      <header className="flex items-center justify-between gap-3 px-1 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StoreMark store={store} size={30} tone="quiet" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-ink">{store === 'play' ? 'Google Play' : 'App Store'}</p>
            <p className="text-[10px] text-ink-faint">
              {searching
                ? 'Mencari kandidat…'
                : phase === 'ready'
                  ? `${candidates.length} kandidat · pilih satu atau lewati`
                  : 'Kandidat muncul otomatis'}
            </p>
          </div>
        </div>
        <span className={`h-1.5 w-1.5 rounded-full ${data?.status === 'error' ? 'bg-coral' : candidates.length ? 'bg-teal' : 'bg-line-strong'}`} aria-hidden="true" />
      </header>

      <div className="scrollbar-soft -mr-1 flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 286 }}>
        {searching && (
          <>
            <CandidateSkeleton />
            <CandidateSkeleton />
            <CandidateSkeleton />
          </>
        )}

        {phase === 'idle' && (
          <div className="flex h-full min-h-[218px] flex-col items-center justify-center rounded-xl border border-dashed border-line px-5 text-center">
            <span className="mb-2.5 text-ink-faint"><IconSearch size={20} /></span>
            <p className="text-[12px] font-semibold text-ink-soft">Menunggu nama entitas</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">Kandidat dicari otomatis saat nama entitas diketik. Tidak ada ID yang perlu diketik.</p>
          </div>
        )}

        {phase === 'ready' && data?.status === 'error' && (
          <div className="rounded-xl border border-coral/25 bg-coral-soft/45 p-3.5 text-[11.5px] leading-relaxed text-coral-deep">
            <span className="mb-1 flex items-center gap-1.5 font-bold"><IconAlert size={13} /> Pencarian gagal</span>
            {data.message}
          </div>
        )}

        {phase === 'ready' && data?.status !== 'error' && candidates.length === 0 && (
          <div className="flex h-full min-h-[218px] flex-col items-center justify-center rounded-xl border border-dashed border-line px-5 text-center">
            <p className="text-[12px] font-semibold text-ink-soft">Tidak ada kandidat</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">Sumber tidak mengembalikan aplikasi untuk nama ini. Coba nama lain atau gunakan kanal satunya.</p>
          </div>
        )}

        {phase === 'ready' && candidates.map(candidate => (
          <CandidateCard
            key={`${store}-${candidate.appId}`}
            store={store}
            candidate={candidate}
            checked={selection[store]?.appId === candidate.appId}
            onSelect={candidateValue => onSelect(store, candidateValue)}
          />
        ))}
      </div>
    </section>
  );
}

function ChannelSummary({ store, chosen }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${chosen ? (store === 'play' ? 'bg-teal text-paper-50' : 'bg-amber text-paper-50') : 'border border-line bg-paper-50 text-ink-faint'}`}>
        {chosen ? <IconCheck size={11} /> : <StoreGlyph store={store} size={11} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-ink-faint">{store === 'play' ? 'Google Play' : 'App Store'}</span>
        <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-ink">{chosen ? chosen.title || 'N/A' : 'Tidak disertakan'}</span>
      </span>
    </div>
  );
}

export function WorkspaceDialog({ open, onClose, existingLabels, onSave }) {
  const [label, setLabel] = useState('');
  const [entity, setEntity] = useState('');
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestError, setRequestError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const searchedForRef = useRef(null);
  const pendingRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setEntity('');
    setPhase('idle');
    setResult(null);
    setSelection(EMPTY_SELECTION);
    setFieldErrors({});
    setRequestError(null);
    setSummaryError(null);
    searchedForRef.current = null;
    pendingRef.current = null;
    requestIdRef.current += 1;
  }, [open]);

  const runDiscover = useCallback(async term => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    pendingRef.current = term;
    setPhase('searching');
    setRequestError(null);
    setResult(null);
    setSelection(EMPTY_SELECTION);
    try {
      const response = await discoverStores(term);
      if (requestId !== requestIdRef.current) return;
      setResult(response);
      setPhase('ready');
      searchedForRef.current = term;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setPhase('idle');
      searchedForRef.current = null;
      pendingRef.current = null;
      setRequestError(error.message || 'Pencarian kandidat gagal. Coba ulangi.');
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const term = entity.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      requestIdRef.current += 1;
      searchedForRef.current = null;
      pendingRef.current = null;
      setPhase('idle');
      setResult(null);
      setSelection(EMPTY_SELECTION);
      setRequestError(null);
      return undefined;
    }
    if (pendingRef.current === term) return undefined;
    setSelection(EMPTY_SELECTION);
    setResult(null);
    const timer = window.setTimeout(() => { runDiscover(term); }, 550);
    return () => window.clearTimeout(timer);
  }, [open, entity, runDiscover]);

  function selectCandidate(store, candidate) {
    setSelection(current => ({ ...current, [store]: candidate }));
    setSummaryError(null);
  }

  function save() {
    const errors = {};
    const name = label.trim();
    const target = entity.trim();
    if (name.length < 2) errors.label = 'Nama analisis minimal dua karakter.';
    else if (name.length > 60) errors.label = 'Nama analisis maksimal 60 karakter.';
    else if (existingLabels.some(existing => existing.toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID'))) {
      errors.label = 'Nama ini sudah dipakai. Beri nama yang berbeda.';
    }
    if (target.length < 2) errors.entity = 'Nama entitas minimal dua karakter.';
    else if (target.length > 80) errors.entity = 'Nama entitas maksimal 80 karakter.';
    if (!selection.play && !selection.appstore) {
      setSummaryError('Pilih minimal satu identitas toko dari kandidat hasil pencarian.');
    } else {
      setSummaryError(null);
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length || (!selection.play && !selection.appstore)) return;

    const stores = {};
    for (const store of ['play', 'appstore']) {
      const candidate = selection[store];
      if (candidate) {
        stores[store] = {
          appId: candidate.appId,
          title: candidate.title || null,
          developer: candidate.developer || null,
          url: candidate.url || null,
          score: isNumber(candidate.score) ? Number(candidate.score) : null,
          ratings: isNumber(candidate.ratings) ? Number(candidate.ratings) : null,
        };
      }
    }
    onSave({ label: name, entity: target, stores });
  }

  const selectedCount = Number(Boolean(selection.play)) + Number(Boolean(selection.appstore));
  const found = result ? (result.play?.candidates?.length || 0) + (result.appstore?.candidates?.length || 0) : 0;
  const busy = phase === 'searching';

  return (
    <DialogShell open={open} onClose={onClose} labelledBy="workspace-dialog-title" describedBy="workspace-dialog-desc" className="sm:max-w-[980px]">
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-coral via-amber to-teal" aria-hidden="true" />
      <header className="shrink-0 border-b border-line/70 px-5 pb-5 pt-6 sm:px-7 sm:pr-16">
        <p className="eyebrow">Analisis baru</p>
        <h2 id="workspace-dialog-title" className="mt-2 text-[clamp(1.65rem,3.6vw,2.25rem)] leading-[1.04] text-ink">
          Dua isian. Sisanya mesin.
        </h2>
        <p id="workspace-dialog-desc" className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-muted text-pretty">
          Beri nama ruang analisis, sebutkan entitasnya, lalu centang identitas toko yang benar dari kandidat yang muncul otomatis.
        </p>
      </header>

      <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="workspace-label">
              <span>1 · Nama analisis</span>
              <span className="text-[10px] font-medium text-ink-faint">{label.length}/60</span>
            </label>
            <input
              id="workspace-label"
              className={`field ${fieldErrors.label ? 'field-error' : ''}`}
              value={label}
              onChange={event => { setLabel(event.target.value); setFieldErrors(current => ({ ...current, label: undefined })); }}
              placeholder="Contoh: Ulasan merchant Q4"
              maxLength={60}
              autoComplete="off"
              data-autofocus
              aria-invalid={Boolean(fieldErrors.label)}
              aria-describedby={fieldErrors.label ? 'workspace-label-error' : 'workspace-label-hint'}
            />
            {fieldErrors.label ? (
              <p id="workspace-label-error" className="mt-1.5 text-[11px] font-medium text-coral-deep" role="alert">{fieldErrors.label}</p>
            ) : (
              <p id="workspace-label-hint" className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">Nama ruang kerja di pemilih workspace. Tersimpan hanya di peramban ini.</p>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="workspace-entity">
              <span>2 · Nama entitas / target app</span>
              <span className="text-[10px] font-medium text-ink-faint">{entity.length}/80</span>
            </label>
            <div className="relative">
              <input
                id="workspace-entity"
                className={`field pr-11 ${fieldErrors.entity ? 'field-error' : ''}`}
                value={entity}
                onChange={event => { setEntity(event.target.value); setFieldErrors(current => ({ ...current, entity: undefined })); setSummaryError(null); }}
                placeholder="Contoh: wondr merchant"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.entity)}
                aria-describedby={fieldErrors.entity ? 'workspace-entity-error' : 'workspace-entity-hint'}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                {busy
                  ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                  : <IconSearch size={16} />}
              </span>
            </div>
            {fieldErrors.entity ? (
              <p id="workspace-entity-error" className="mt-1.5 text-[11px] font-medium text-coral-deep" role="alert">{fieldErrors.entity}</p>
            ) : (
              <p id="workspace-entity-hint" className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                {entity.trim().length < MIN_SEARCH_LENGTH ? 'Tulis minimal tiga karakter; kandidat muncul sendiri.' : 'Kandidat dicari otomatis ke dua toko.'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="rule-label">Kandidat toko</p>
            <div className="flex items-center gap-3">
              <p className="text-[10.5px] text-ink-faint" aria-live="polite">
                {busy
                  ? 'Mencari di dua sumber…'
                  : phase === 'ready'
                    ? `${found} kandidat ditemukan · ${selectedCount} dipilih`
                    : 'Belum ada kandidat'}
              </p>
              {phase === 'ready' && (
                <button
                  type="button"
                  onClick={() => runDiscover(entity.trim())}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted transition hover:text-ink"
                >
                  <IconRefresh size={12} /> Cari ulang
                </button>
              )}
            </div>
          </div>

          {requestError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-coral/25 bg-coral-soft/45 p-3 text-[11.5px] leading-relaxed text-coral-deep" role="alert">
              <IconAlert size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{requestError}</span>
              <button type="button" onClick={() => runDiscover(entity.trim())} className="btn btn-sm btn-outline">Coba lagi</button>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <StoreColumn store="play" data={result?.play} phase={phase} selection={selection} onSelect={selectCandidate} />
            <StoreColumn store="appstore" data={result?.appstore} phase={phase} selection={selection} onSelect={selectCandidate} />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-line/75 bg-paper-100/75 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft"><IconInfo size={13} /> Ringkasan</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                {label.trim() ? `“${label.trim()}”` : 'Nama analisis belum diisi'}
                <span className="px-1.5 text-line-strong">/</span>
                {entity.trim() || 'entitas belum diisi'}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 sm:min-w-[280px]">
              <ChannelSummary store="play" chosen={selection.play} />
              <ChannelSummary store="appstore" chosen={selection.appstore} />
            </div>
          </div>
          <p className="mt-3 border-t border-line/60 pt-2.5 text-[10.5px] leading-relaxed text-ink-faint">
            Tarikan membaca seluruh ulasan tertulis publik yang dikembalikan sumber, tanpa sampel buatan. Cache kanal berlaku satu jam; tombol Perbarui memaksa tarikan baru.
          </p>
          {summaryError && <p className="mt-2 text-[11px] font-semibold text-coral-deep" role="alert">{summaryError}</p>}
        </div>
      </div>

      <footer className="shrink-0 border-t border-line/75 bg-paper-50/95 px-5 py-4 sm:px-7">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} className="btn btn-ghost">Batal</button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !selectedCount}
            className="btn btn-primary min-w-[200px]"
            title={selectedCount ? 'Simpan workspace lalu tarik datanya' : 'Pilih satu kandidat toko terlebih dahulu'}
          >
            Simpan &amp; tarik data
          </button>
        </div>
      </footer>
    </DialogShell>
  );
}
