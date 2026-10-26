import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconCheck, IconRefresh } from './icons.jsx';
import { Notice } from './Notices.jsx';
import { fetchComparison } from '../lib/api.js';
import { formatNumber, formatNss, relativeTime } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';

const MAX_COLUMNS = 12;

function Panel({ title, meta, action, children, className = '' }) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`} aria-label={title}>
      <header className="flex min-h-[34px] flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="label">{title}</h2>
          {meta ? <span className="num truncate text-[10px] text-slate-400">{meta}</span> : null}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

const displayValue = (row, value) => {
  if (!Number.isFinite(value)) return '—';
  if (row.unit === 'ratio') return `${(value * 100).toFixed(1)}%`;
  if (row.key === 'nss') return formatNss(value);
  if (value >= 1000) return formatNumber(value);
  return Number.isInteger(value) ? formatNumber(value) : value.toFixed(2);
};

function Delta({ delta, direction, unit }) {
  if (!Number.isFinite(delta) || delta === 0) {
    return <span className="num text-[10px] text-slate-400">±0</span>;
  }
  const good = direction === 'down' ? delta < 0 : delta > 0;
  const shown = unit === 'ratio' ? `${(Math.abs(delta) * 100).toFixed(1)}%` : Math.abs(delta) >= 1000 ? formatNumber(Math.abs(delta)) : Math.abs(delta).toFixed(2);
  return (
    <span className={`num text-[10px] font-semibold ${good ? 'text-pos' : 'text-neg'}`} aria-label={`${good ? 'above' : 'below'} the median by ${shown}`}>
      {delta > 0 ? '▲' : '▼'} {shown}
    </span>
  );
}

function SelectionBar({ workspaces, selected, onToggle, onAll, onRun, busy }) {
  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">Projects in matrix · {selected.length}/{Math.min(workspaces.length, MAX_COLUMNS)}</p>
        <div className="flex items-center gap-2">
          {workspaces.length ? (
            <button type="button" onClick={onAll} className="btn btn-secondary btn-xs">
              {selected.length === Math.min(workspaces.length, MAX_COLUMNS) ? 'Clear' : 'Select all'}
            </button>
          ) : null}
          <button type="button" onClick={onRun} disabled={selected.length < 2 || busy} className="btn btn-primary btn-xs">
            {busy ? <IconRefresh size={12} className="animate-spin" /> : <IconCheck size={12} />} Compare
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Select projects to compare">
        {workspaces.map(workspace => {
          const on = selected.includes(workspace.id);
          return (
            <button
              key={workspace.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(workspace.id)}
              className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors ${
                on ? 'border-accent/50 bg-accent/10 text-slate-100' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-accent' : 'bg-slate-600'}`} aria-hidden="true" />
              <span className="max-w-[140px] truncate font-semibold">{workspace.label}</span>
              {workspace.snapshot?.reviews ? <span className="num text-[10px] text-slate-400">{formatNumber(workspace.snapshot.reviews)}</span> : null}
            </button>
          );
        })}
        {!workspaces.length ? <p className="text-[11px] text-slate-400">No stored projects yet.</p> : null}
      </div>
    </div>
  );
}

function MatrixTable({ result }) {
  const columns = result.projects;
  const now = useNow(60000);
  return (
    <Panel title="Metric matrix" meta={`reference = median of ${result.reference.projects} columns`} className="xl:col-span-12">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Metric matrix: one row per measured metric, one column per stored project. Every cell
            is read from that project&apos;s own snapshot; a project without a snapshot shows no
            value rather than a zero.
          </caption>
          <thead>
            <tr className="border-b border-slate-800">
              <th scope="col" className="label sticky left-0 bg-slate-900/95 py-1.5 pr-3 font-semibold">Metric</th>
              {columns.map(column => (
                <th key={column.id} scope="col" className="py-1.5 pl-3 align-bottom">
                  <p className="truncate text-[11px] font-bold text-slate-200">{column.label}</p>
                  <p className="num text-[10px] text-slate-400">{column.hasData ? `${formatNumber(column.metrics.volume)} · as of ${relativeTime(column.fetchedAt, now)}` : 'no snapshot'}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map(row => (
              <tr key={row.key} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/20">
                <th scope="row" className="sticky left-0 bg-slate-900/95 py-1.5 pr-3 text-left align-top">
                  <span className="text-[11px] font-medium text-slate-300">{row.label}</span>
                </th>
                {row.values.map(value => {
                  const cell = columns.find(column => column.id === value.id);
                  return (
                    <td key={value.id} className="py-1.5 pl-3 align-top">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`num text-[12px] font-semibold ${cell?.hasData ? 'text-slate-100' : 'text-slate-400'}`}>{displayValue(row, value.value)}</span>
                        {row.direction !== 'neutral' && Number.isFinite(value.value) ? <Delta delta={value.delta} direction={row.direction} unit={row.unit} /> : null}
                      </div>
                      {Number.isFinite(value.value) && row.direction !== 'neutral' && row.values.filter(entry => Number.isFinite(entry.value)).length > 1 ? (
                        <p className="num text-[10px] text-slate-400">#{value.rank}</p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Leaderboard({ result }) {
  if (!result.leaderboard.length) return null;
  return (
    <Panel title="NSS leaderboard" meta={`${result.leaderboard.length} ranked`} className="xl:col-span-5">
      <ol className="space-y-1">
        {result.leaderboard.map(entry => (
          <li key={entry.id} className="flex items-center gap-2 rounded border border-slate-800/70 bg-slate-900/40 px-2 py-1.5">
            <span className="num w-4 shrink-0 text-[10px] font-bold text-slate-400">{entry.rank}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">{entry.label}</span>
            <span className={`num text-[12px] font-bold ${entry.nss >= 0 ? 'text-pos' : 'text-neg'}`}>{formatNss(entry.nss)}</span>
            {entry.rank > 1 ? <span className="num text-[10px] text-slate-400">{entry.gapToLeader.toFixed(1)}</span> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Insights({ result }) {
  const labels = useMemo(() => new Map(result.projects.map(project => [project.id, project.label])), [result]);
  if (!result.insights.length) return null;
  return (
    <Panel title="Widest gaps" meta={`${result.insights.length} metrics`} className="xl:col-span-7">
      <ul className="grid gap-1 sm:grid-cols-2">
        {result.insights.map(insight => (
          <li key={insight.key} className="flex items-baseline justify-between gap-2 border-b border-slate-800/60 pb-1 last:border-0">
            <span className="min-w-0 truncate text-[11px] text-slate-300">{insight.label}</span>
            <span className="shrink-0 text-right">
              <span className="text-[11px] font-semibold text-pos">{labels.get(insight.winnerId) || insight.winnerId}</span>
              <span className="num text-[10px] text-slate-400"> vs </span>
              <span className="text-[11px] font-semibold text-neg">{labels.get(insight.loserId) || insight.loserId}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PainHeatmap({ result }) {
  const columns = result.projects;
  const ceiling = Math.max(...result.painPoints.flatMap(row => Object.values(row.cells).map(cell => cell.share).filter(Number.isFinite)), 0) || 1;
  if (!result.painPoints.length) return null;
  return (
    <Panel title="Cross-project pain points" meta={`${result.painPointTotal} phrases · showing ${result.painPoints.length}`} className="xl:col-span-12">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Cross-project pain points: each row is one complaint phrase measured inside every
            selected project. A cell shows that project&apos;s own count; a dash means the phrase
            did not clear the evidence test there, not that it was zero.
          </caption>
          <thead>
            <tr className="border-b border-slate-800">
              <th scope="col" className="label py-1.5 pr-3">Phrase</th>
              {columns.map(column => <th key={column.id} scope="col" className="py-1.5 pl-2 text-right text-[10px] font-semibold text-slate-400">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.painPoints.map(row => (
              <tr key={row.text} className="border-b border-slate-800/50 last:border-0">
                <th scope="row" className="py-1 pr-3 text-left">
                  <span className="text-[11px] font-medium text-slate-200">{row.text}</span>
                  <span className="num ml-1.5 text-[10px] text-slate-400">{row.projectCount}/{columns.length}</span>
                </th>
                {columns.map(column => {
                  const cell = row.cells[column.id];
                  const strength = cell ? Math.min(1, cell.share / ceiling) : 0;
                  return (
                    <td key={column.id} className="py-1 pl-2 text-right">
                      {cell ? (
                        <span
                          className="num inline-block min-w-[52px] rounded px-1.5 py-0.5 text-[11px] font-semibold text-neg"
                          style={{ backgroundColor: `rgba(248,113,113,${(0.08 + strength * 0.34).toFixed(3)})` }}
                          title={`${formatNumber(cell.count)} negative reviews · severity ${cell.severity}`}
                        >
                          {(cell.share * 100).toFixed(1)}%
                        </span>
                      ) : <span className="num text-[11px] text-slate-400">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function CompareView({ workspaces, onToast }) {
  const [selected, setSelected] = useState(() => workspaces.slice(0, MAX_COLUMNS).map(workspace => workspace.id));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Kunci pilihan yang sudah dicoba. Tanpa penjaga ini, jalur yang mengembalikan hasil kosong
  // (database belum terpasang) membuat effect memicu permintaan berikutnya terus-menerus:
  // 33 permintaan bandingkan dalam 15 detik terukur di URL produksi.
  const attempted = useRef(null);

  const toggle = id => setSelected(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id].slice(0, MAX_COLUMNS)));
  const toggleAll = () => setSelected(current => (current.length ? [] : workspaces.slice(0, MAX_COLUMNS).map(workspace => workspace.id)));

  const run = useCallback(async () => {
    attempted.current = selected.join(',');
    if (selected.length < 2) {
      setError('Select at least two projects.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await fetchComparison(selected);
      if (data.db && data.db.reachable === false) {
        setError('The database is not reachable, so no project snapshots could be read.');
        setResult(null);
      } else {
        // Urutan kolom mengikuti pilihan pengguna, bukan urutan server.
        const order = new Map(selected.map((id, index) => [id, index]));
        setResult({ ...data, projects: data.projects.slice().sort((a, b) => order.get(a.id) - order.get(b.id)) });
      }
    } catch (cause) {
      setError(cause?.message || 'The comparison could not be built.');
    } finally {
      setBusy(false);
    }
  }, [selected]);

  useEffect(() => {
    if (selected.length >= 2 && !result && !busy && attempted.current !== selected.join(',')) run();
  }, [selected, result, busy, run]);

  const ordered = useMemo(() => (result ? selected.map(id => result.projects.find(project => project.id === id)).filter(Boolean) : []), [result, selected]);
  const view = result ? { ...result, projects: ordered } : null;

  return (
    <div className="space-y-3">
      <SelectionBar
        workspaces={workspaces}
        selected={selected}
        onToggle={toggle}
        onAll={toggleAll}
        onRun={run}
        busy={busy}
      />
      {error ? <Notice tone="coral" title="Comparison unavailable">{error}</Notice> : null}
      {busy && !view ? <Panel title="Building matrix" meta="reading stored summaries">…</Panel> : null}
      {view ? (
        <>
          <div className="grid gap-3 xl:grid-cols-12">
            <MatrixTable result={view} />
          </div>
          <div className="grid gap-3 xl:grid-cols-12">
            <Leaderboard result={view} />
            <Insights result={view} />
          </div>
          <div className="grid gap-3 xl:grid-cols-12">
            <PainHeatmap result={view} />
          </div>
          {view.caveats.length ? (
            <div className="flex flex-wrap gap-1.5">
              {view.caveats.map(caveat => (
                <span key={caveat} className="rounded border border-slate-800 bg-slate-900/50 px-2 py-1 text-[10px] text-slate-400">{caveat}</span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
