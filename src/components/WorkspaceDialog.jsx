import { useCallback, useEffect, useRef, useState } from 'react';
import { discoverStores } from '../lib/api.js';
import { formatDecimal, formatNumber, isNumber } from '../lib/format.js';
import { DialogShell } from './Dialog.jsx';
import { StoreGlyph, StoreMark } from './Brand.jsx';
import { IconAlert, IconCheck, IconExternal, IconRefresh, IconSearch, IconStar } from './icons.jsx';

const EMPTY_SELECTION = { play: null, appstore: null };
const MIN_SEARCH_LENGTH = 3;
const MATCH_BADGES = {
  exact: ['exact', 'border-pos/30 bg-pos/10 text-pos'],
  full: ['match', 'border-slate-700 bg-slate-800 text-slate-300'],
  nearest: ['nearest', 'border-neu/30 bg-neu/10 text-neu'],
};

function CandidateSkeleton() {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
      <div className="skeleton h-2.5 w-2/3" />
      <div className="skeleton mt-2 h-2 w-1/2" />
    </div>
  );
}

function CandidateCard({ store, candidate, checked, auto, onSelect }) {
  const id = `candidate-${store}-${candidate.appId}`;
  const score = isNumber(candidate.score) ? formatDecimal(candidate.score, 2) : 'N/A';
  const ratingCount = isNumber(candidate.ratings) ? `${formatNumber(candidate.ratings)} ratings` : null;
  const storeLabel = store === 'play' ? 'Google Play' : 'App Store';
  const badge = MATCH_BADGES[candidate.match?.tier] || null;
  return (
    <div className="relative">
      <input id={id} type="radio" name={`candidate-${store}`} value={candidate.appId} checked={checked} onChange={() => onSelect(candidate)} className="peer sr-only" />
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 pr-9 transition peer-focus-visible:ring-1 peer-focus-visible:ring-accent ${
          checked ? 'border-accent/60 bg-accent/[0.08]' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
        }`}
      >
        <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-accent bg-accent text-slate-950' : 'border-slate-700 text-transparent'}`} aria-hidden="true">
          <IconCheck size={9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold leading-snug text-slate-100">{candidate.title || 'N/A'}</span>
            {badge && (
              <span className={`shrink-0 rounded border px-1 py-px text-[10px] font-bold uppercase tracking-wider ${badge[1]}`} title={`Name match ${candidate.match?.score ?? 0} · missing words: ${candidate.match?.missing?.join(', ') || 'none'}`}>
                {badge[0]}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-slate-400">{candidate.developer || 'N/A'}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
            <span className="num inline-flex items-center gap-1 font-bold text-slate-300">
              <IconStar size={9} className={isNumber(candidate.score) ? 'text-neu' : 'text-slate-400'} />
              {score}
            </span>
            {ratingCount && <span className="num">{ratingCount}</span>}
            {auto && <span className="font-semibold text-accent">auto-selected</span>}
            <span className="truncate rounded bg-slate-800/70 px-1.5 py-px font-mono text-[10px] text-slate-400">{candidate.appId}</span>
          </span>
        </span>
      </label>
      <a
        href={candidate.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        aria-label={`Open ${candidate.title || 'this candidate'} on ${storeLabel}`}
        title={`Open in ${storeLabel}`}
      >
        <IconExternal size={11} />
      </a>
    </div>
  );
}

function StoreColumn({ store, data, phase, selection, onSelect }) {
  const candidates = data?.candidates || [];
  const searching = phase === 'searching';
  const autoAppId = candidates.length === 1 && candidates[0].match?.tier === 'exact' ? candidates[0].appId : null;
  const label = store === 'play' ? 'Google Play' : 'App Store';
  const filteredOut = data?.filteredOut || 0;
  return (
    <section className="flex min-h-[260px] flex-col rounded-lg border border-slate-800 bg-slate-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <StoreMark store={store} size={18} tone="quiet" />
          <p className="truncate text-[11px] font-bold text-slate-200">{label}</p>
        </div>
        <p className="shrink-0 text-[10px] text-slate-400" aria-live="polite">
          {searching ? 'searching…' : phase === 'ready' ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}${filteredOut ? ` · ${filteredOut} filtered out` : ''}` : 'waiting for the entity name'}
        </p>
      </header>

      <div className="scroll-x min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {searching && (<><CandidateSkeleton /><CandidateSkeleton /><CandidateSkeleton /></>)}

        {phase === 'idle' && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-slate-800 px-4 text-center">
            <IconSearch size={16} className="mb-2 text-slate-400" />
            <p className="text-[10.5px] font-semibold text-slate-400">Candidates appear automatically</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Type the entity name above. No ID has to be typed.</p>
          </div>
        )}

        {phase === 'ready' && data?.status === 'error' && (
          <div className="rounded-md border border-neg/25 bg-neg/[0.07] p-2.5 text-[10.5px] leading-relaxed text-neg">
            <p className="mb-1 flex items-center gap-1.5 font-bold"><IconAlert size={12} /> Search failed</p>
            {data.message}
          </div>
        )}

        {phase === 'ready' && data?.status !== 'error' && candidates.length === 0 && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-slate-800 px-4 text-center">
            <p className="text-[10.5px] font-semibold text-slate-400">No candidate matches</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{data?.message || 'The store search results were all filtered out because their names do not contain the words you searched for.'}</p>
          </div>
        )}

        {phase === 'ready' && data?.status !== 'error' && data?.matchMode === 'nearest' && candidates.length > 0 && (
          <p className="rounded border border-neu/25 bg-neu/[0.07] px-2 py-1.5 text-[10px] leading-relaxed text-neu">{data.message}</p>
        )}

        {phase === 'ready' && candidates.map(candidate => (
          <CandidateCard
            key={`${store}-${candidate.appId}`}
            store={store}
            candidate={candidate}
            checked={selection[store]?.appId === candidate.appId}
            auto={candidate.appId === autoAppId}
            onSelect={candidateValue => onSelect(store, candidateValue)}
          />
        ))}
      </div>
    </section>
  );
}

function ChannelSummary({ store, chosen }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${chosen ? (store === 'play' ? 'bg-play text-slate-950' : 'bg-appstore text-slate-950') : 'border border-slate-800 text-slate-400'}`}>
        {chosen ? <IconCheck size={9} /> : <StoreGlyph store={store} size={9} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{store === 'play' ? 'Google Play' : 'App Store'}</span>
        <span className="block truncate text-[10.5px] font-semibold text-slate-300">{chosen ? chosen.title || 'N/A' : 'not included'}</span>
      </span>
    </div>
  );
}

// Kanal non-toko yang bisa diaktifkan per analisis. `needs` hanya penjelasan syarat
// kredensial di server — tidak ada kolom untuk menempel token di sini.
const SOCIAL_OPTIONS = [
  { id: 'news', label: 'News & blogs', needsKey: false, needs: 'no key needed' },
  { id: 'youtube', label: 'YouTube', needsKey: true, needs: 'needs a Google API key' },
  { id: 'reddit', label: 'Reddit', needsKey: true, needs: 'needs a Reddit app' },
  { id: 'facebook', label: 'Facebook', needsKey: true, needs: 'needs an Apify token' },
  { id: 'instagram', label: 'Instagram', needsKey: true, needs: 'needs an Apify token' },
  { id: 'tiktok', label: 'TikTok', needsKey: true, needs: 'needs an Apify token' },
  { id: 'x', label: 'X / Twitter', needsKey: true, needs: 'needs an Apify token' },
];

export function WorkspaceDialog({ open, onClose, existingLabels, onSave }) {
  const [label, setLabel] = useState('');
  const [entity, setEntity] = useState('');
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [channels, setChannels] = useState({ news: true });
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
    setChannels({ news: true });
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
      // Kanal dengan tepat satu kandidat ber-nama persis sudah tidak ambigu, jadi dipilih
      // lebih dulu. Lebih dari satu kandidat tetap sepenuhnya pilihan pengguna.
      const unique = { play: null, appstore: null };
      for (const store of ['play', 'appstore']) {
        const list = response?.[store]?.candidates || [];
        if (list.length === 1 && list[0].match?.tier === 'exact') unique[store] = list[0];
      }
      setSelection(unique.play || unique.appstore ? unique : EMPTY_SELECTION);
      setPhase('ready');
      searchedForRef.current = term;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setPhase('idle');
      searchedForRef.current = null;
      pendingRef.current = null;
      setRequestError(error.message || 'The candidate search failed. Try again.');
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
    if (name.length < 2) errors.label = 'The analysis name needs at least two characters.';
    else if (name.length > 60) errors.label = 'The analysis name takes at most 60 characters.';
    else if (existingLabels.some(existing => existing.toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID'))) {
      errors.label = 'This name is already in use.';
    }
    if (target.length < 2) errors.entity = 'The entity name needs at least two characters.';
    else if (target.length > 80) errors.entity = 'The entity name takes at most 80 characters.';
    const hasStore = Boolean(selection.play || selection.appstore);
    const socialOn = SOCIAL_OPTIONS.some(option => channels[option.id]);
    if (!hasStore && !socialOn) setSummaryError('Select at least one store identity or enable one social/news channel.');
    else setSummaryError(null);
    setFieldErrors(errors);
    if (Object.keys(errors).length || (!hasStore && !socialOn)) return;

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
    const nextChannels = Object.fromEntries(SOCIAL_OPTIONS.map(option => [option.id, {
      enabled: channels[option.id] === true,
      handle: '',
      videoIds: [],
      subreddits: [],
    }]));
    onSave({ label: name, entity: target, stores, channels: nextChannels });
  }

  const selectedCount = Number(Boolean(selection.play)) + Number(Boolean(selection.appstore));
  const socialCount = SOCIAL_OPTIONS.reduce((sum, option) => sum + Number(channels[option.id] === true), 0);
  const found = result ? (result.play?.candidates?.length || 0) + (result.appstore?.candidates?.length || 0) : 0;
  const busy = phase === 'searching';

  return (
    <DialogShell open={open} onClose={onClose} labelledBy="workspace-dialog-title" describedBy="workspace-dialog-desc" className="sm:max-w-[860px]" dismissible={!busy}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="label-sm">New analysis</p>
          <h2 id="workspace-dialog-title" className="mt-1 text-[17px] font-extrabold tracking-tight text-slate-100">Two fields, the rest is automatic</h2>
          <p id="workspace-dialog-desc" className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Candidates are searched automatically on Google Play and the App Store. You pick the identity that is right.
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400" htmlFor="workspace-label">
              <span>1 · Analysis name</span>
              <span className="num font-normal text-slate-400">{label.length}/60</span>
            </label>
            <input
              id="workspace-label"
              className={`field field-sm ${fieldErrors.label ? 'field-error' : ''}`}
              value={label}
              onChange={event => { setLabel(event.target.value); setFieldErrors(current => ({ ...current, label: undefined })); }}
              placeholder="e.g. Merchant reviews Q4"
              maxLength={60}
              autoComplete="off"
              data-autofocus
              aria-invalid={Boolean(fieldErrors.label)}
              aria-describedby={fieldErrors.label ? 'workspace-label-error' : undefined}
            />
            {fieldErrors.label && <p id="workspace-label-error" className="mt-1 text-[10px] font-semibold text-neg" role="alert">{fieldErrors.label}</p>}
          </div>
          <div>
            <label className="mb-1 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400" htmlFor="workspace-entity">
              <span>2 · Entity name / target app</span>
              <span className="num font-normal text-slate-400">{entity.length}/80</span>
            </label>
            <div className="relative">
              <input
                id="workspace-entity"
                className={`field field-sm pr-8 ${fieldErrors.entity ? 'field-error' : ''}`}
                value={entity}
                onChange={event => { setEntity(event.target.value); setFieldErrors(current => ({ ...current, entity: undefined })); setSummaryError(null); }}
                placeholder="e.g. wondr merchant"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.entity)}
                aria-describedby={fieldErrors.entity ? 'workspace-entity-error' : 'workspace-entity-hint'}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {busy ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden="true" /> : <IconSearch size={13} />}
              </span>
            </div>
            {fieldErrors.entity ? (
              <p id="workspace-entity-error" className="mt-1 text-[10px] font-semibold text-neg" role="alert">{fieldErrors.entity}</p>
            ) : (
              <p id="workspace-entity-hint" className="mt-1 text-[10px] text-slate-400">
                {entity.trim().length < MIN_SEARCH_LENGTH ? 'At least three characters to start searching.' : 'Candidates load automatically while you type.'}
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="label-sm">Store candidates</p>
            <div className="flex items-center gap-2.5">
              <p className="text-[10px] text-slate-400" aria-live="polite">
                {busy ? 'searching both sources…' : phase === 'ready' ? `${found} found · ${selectedCount} selected` : 'no candidate yet'}
              </p>
              {phase === 'ready' && (
                <button type="button" onClick={() => runDiscover(entity.trim())} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200">
                  <IconRefresh size={11} /> search again
                </button>
              )}
            </div>
          </div>

          {requestError && (
            <div className="mb-1.5 flex items-start gap-2 rounded-md border border-neg/25 bg-neg/[0.07] p-2.5 text-[10.5px] leading-relaxed text-neg" role="alert">
              <IconAlert size={13} className="mt-0.5 shrink-0" />
              <span className="flex-1">{requestError}</span>
              <button type="button" onClick={() => runDiscover(entity.trim())} className="btn btn-secondary btn-xs">Try again</button>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <StoreColumn store="play" data={result?.play} phase={phase} selection={selection} onSelect={selectCandidate} />
            <StoreColumn store="appstore" data={result?.appstore} phase={phase} selection={selection} onSelect={selectCandidate} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <p className="label-sm">Summary</p>
              <p className="mt-1 truncate text-[11px] font-semibold text-slate-300">
                {label.trim() || '—'} <span className="font-normal text-slate-400">/</span> {entity.trim() || '—'}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1.5">
              <ChannelSummary store="play" chosen={selection.play} />
              <ChannelSummary store="appstore" chosen={selection.appstore} />
            </div>
          </div>
          {summaryError && <p className="mt-1.5 text-[10.5px] font-semibold text-neg" role="alert">{summaryError}</p>}
        </div>

        <div className="card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="label">Social &amp; web channels</h3>
            <p className="text-[10px] text-slate-400">credentials are installed only in the server environment, never on this page</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Non-store channels included in the pull">
            {SOCIAL_OPTIONS.map(option => {
              const on = channels[option.id] === true;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChannels(current => ({ ...current, [option.id]: !current[option.id] }))}
                  className={`filter-chip ${on ? 'filter-chip-active' : ''}`}
                  title={option.needs}
                >
                  {option.label}
                  <span className={`num ml-1 ${on ? 'opacity-80' : 'text-slate-400'}`}>{option.needsKey ? 'key needed' : 'ready'}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            A channel without credentials is still pulled and reported as Needs credentials, never as zero reviews.
          </p>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/80 px-4 py-2.5">
        <p className="hidden text-[10px] text-slate-400 sm:block">A pull reads every public review the source returns · 1 h cache</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={busy || (!selectedCount && !socialCount)}
            className="btn btn-primary"
            title={selectedCount || socialCount ? 'Save this workspace, then pull its data' : 'Pick one store candidate or enable one social channel'}
          >
            Save &amp; pull data
          </button>
        </div>
      </footer>
    </DialogShell>
  );
}
