import { useCallback, useEffect, useMemo, useState } from 'react';

import { Progress } from './Progress.jsx';
import { IconCheck, IconRefresh, IconShield, IconTrash } from './icons.jsx';
import { ApiError, fetchConfigStatus, forgetConfigSetting, saveConfigValue } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { t } from '../lib/i18n.js';

// Menu Config: kunci API dan setelan sumber yang dulu harus dipasang manual di dashboard
// inang. Sekarang keduanya hidup di basis data project ini, dan nilai yang tersimpan di
// mari dipakai lebih dulu. Nilai rahasia tidak pernah tampil — yang ada hanyalah samarannya.

const GROUP_TITLES = {
  analysis: 'Analysis model',
  social: 'Social channels',
  sources: 'Source targets',
  timing: 'Scheduled pull',
};

const SOURCE_LABELS = {
  config: 'Saved here',
  env: 'Platform variable',
  none: 'Not set',
};

const SOURCE_TONES = {
  config: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  env: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  none: 'border-slate-700 bg-slate-800/60 text-slate-300',
};

const messageOf = (error, fallback) => (error instanceof ApiError && error.message ? error.message : fallback);

// Nilai yang boleh disalin pemilik adalah nilai biasa (daftar feed, subreddit, id kanal).
// Kunci tidak pernah keluar dari server, jadi kolom rahasianya selalu mulai kosong.
const currentText = (row, draft) => {
  if (draft !== undefined) return draft;
  return row.secret ? '' : String(row.value ?? '');
};

function SettingRow({ row, adminKey, busy, draft, notice, onSave, onForget, onDraft }) {
  const [confirming, setConfirming] = useState(false);
  const saved = row.source === 'config';
  const editable = Boolean(adminKey) && !busy;

  return (
    <li className="break-inside-avoid rounded border border-slate-800/70 bg-slate-900/40 p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="min-w-0 text-[12px] font-bold leading-snug text-slate-100">{t(row.label)}</p>
        <span className="num text-[10px] text-slate-400" title={t('The server variable this writes')}>{row.name}</span>
        <span className={`ml-auto shrink-0 rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${SOURCE_TONES[row.source] || SOURCE_TONES.none}`}>
          {t(SOURCE_LABELS[row.source] || SOURCE_LABELS.none)}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t(row.note)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="num min-w-0 flex-1 truncate text-[11px] text-slate-300" title={row.secret ? undefined : (currentText(row, draft) || undefined)}>
          <IconShield size={11} className={`mr-1 inline-block align-[-1px] ${row.secret && row.present ? 'text-emerald-300' : 'text-slate-400'}`} />
          {row.secret
            ? (row.present ? `${row.masked} · ${t('kept on the server only')}` : t('nothing stored yet'))
            : (currentText(row, draft) || t('nothing stored yet'))}
        </p>
        {saved && row.updatedAt ? (
          <span className="tag-quiet" title={t('When this value was saved')}>{formatDateTime(row.updatedAt)}</span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('New value for')} {t(row.label)}</span>
          <input
            type={row.secret ? 'password' : 'text'}
            value={currentText(row, draft)}
            onChange={event => onDraft(row.name, event.target.value)}
            disabled={!editable}
            autoComplete="off"
            spellCheck={false}
            placeholder={row.secret
              ? (row.present ? t('Paste a new key to replace it') : t('Paste the key to store it here'))
              : t('Type the value to store here')}
            className="field field-sm mt-1 w-full font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="btn btn-secondary btn-xs" disabled={!editable} onClick={() => onSave(row.name)}>
            <IconCheck size={12} />
            {t('Save')}
          </button>
          {saved ? (
            confirming ? (
              <button
                type="button"
                className="btn btn-danger btn-xs"
                disabled={busy}
                onClick={() => { setConfirming(false); onForget(row.name); }}
                onBlur={() => setConfirming(false)}
              >
                {t('Confirm remove')}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-xs" disabled={!editable} onClick={() => setConfirming(true)}>
                <IconTrash size={12} />
                {t('Remove')}
              </button>
            )
          ) : null}
        </div>
      </div>

      {!editable ? (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{t('Unlock editing above to change this setting.')}</p>
      ) : null}
      {notice?.name === row.name ? (
        <p className={`mt-1.5 text-[11px] leading-snug ${notice.ok ? 'text-emerald-200' : 'text-rose-300'}`} role="status">
          {notice.text}
        </p>
      ) : null}
    </li>
  );
}

export function ConfigView() {
  const [token, setToken] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [storage, setStorage] = useState({ enabled: false, reason: null });
  const [writable, setWritable] = useState(false);
  const [gateReason, setGateReason] = useState(null);
  const [tableError, setTableError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const apply = result => {
    setRows(Array.isArray(result.rows) ? result.rows : []);
    setGroups(Array.isArray(result.groups) ? result.groups : []);
    setStorage(result.storage || { enabled: false, reason: null });
    setWritable(result.writable === true);
    setGateReason(result.reason || null);
    setTableError(result.tableError || null);
    // Draft dibuang: nilai yang belum dikirim tidak boleh tertinggal di bawah nilai baru.
    setDrafts({});
  };

  const load = useCallback(async (bearer = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchConfigStatus(bearer || null);
      apply(result);
      setUnlocked(result.authorized === true);
    } catch (cause) {
      setError(messageOf(cause, t('The settings list could not be read.')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
    // Sekali saat layar dibuka: saat itu kunci admin belum dikenal, dan memang begitu
    // keadaannya — tombol di bawah yang akan membaca ulang dengan kunci tersebut.
  }, [load]);

  const authorize = async () => {
    const key = token.trim();
    setBusy(true);
    setError(null);
    try {
      const result = await fetchConfigStatus(key || null);
      apply(result);
      setUnlocked(result.authorized === true);
      if (result.authorized === true) {
        setAdminKey(key);
        setNotice(null);
      } else {
        setAdminKey('');
        setError(t('The admin key does not match this server.'));
      }
    } catch (cause) {
      setUnlocked(false);
      setAdminKey('');
      setError(messageOf(cause, t('The admin key could not be checked.')));
    } finally {
      setBusy(false);
    }
  };

  const save = async name => {
    const value = currentText(rows.find(row => row.name === name) || { name, secret: true }, drafts[name]);
    if (!String(value).length) {
      setNotice({ name, ok: false, text: t('Type a value before saving.') });
      return;
    }
    setBusy(true);
    try {
      apply(await saveConfigValue({ name, value, token: adminKey }));
      setNotice({ name, ok: true, text: t('Saved to this project database. New pulls use it right away.') });
    } catch (cause) {
      setNotice({ name, ok: false, text: messageOf(cause, t('This value could not be saved.')) });
    } finally {
      setBusy(false);
    }
  };

  const forget = async name => {
    setBusy(true);
    try {
      apply(await forgetConfigSetting({ name, token: adminKey }));
      setNotice({ name, ok: true, text: t('Removed here. The platform variable is used again if one is installed.') });
    } catch (cause) {
      setNotice({ name, ok: false, text: messageOf(cause, t('This setting could not be removed.')) });
    } finally {
      setBusy(false);
    }
  };

  const byGroup = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row.group) || [];
      list.push(row);
      map.set(row.group, list);
    }
    return map;
  }, [rows]);

  const savedCount = rows.filter(row => row.source === 'config').length;
  const readyCount = rows.filter(row => row.present).length;

  return (
    <section className="space-y-3" aria-label={t('Configuration of keys and source settings')}>
      <div className="card p-3">
        <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold leading-tight text-slate-100">{t('Configuration')}</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
              {t('Keys used to be installed by hand in the hosting dashboard. They live in this project now, and the value saved here is the one that gets used.')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tag-quiet" title={t('Settings saved in this project database')}>
              {`${savedCount}/${rows.length}`} {t('saved here')}
            </span>
            <span className="tag-quiet" title={t('Settings that have a working value')}>
              {`${readyCount}/${rows.length}`} {t('ready')}
            </span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => void load(adminKey)} disabled={loading || busy}>
              <IconRefresh size={12} />
              {t('Reload')}
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="label-sm">{t('Admin key')}</span>
            <input
              type="password"
              value={token}
              onChange={event => { setToken(event.target.value); setUnlocked(false); }}
              onKeyDown={event => { if (event.key === 'Enter') void authorize(); }}
              disabled={busy || !writable}
              autoComplete="off"
              spellCheck={false}
              placeholder={writable ? t('The key installed as SENTIL_CONFIG_SECRET') : t('Saving is switched off until the server has an admin key')}
              className="field field-sm mt-1 w-full font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => void authorize()}
            disabled={busy || !writable || !token.trim() || unlocked}
          >
            <IconShield size={12} />
            {unlocked ? t('Unlocked') : t('Unlock editing')}
          </button>
        </div>

        {loading ? <div className="mt-2.5"><Progress label={t('Reading the settings list')} /></div> : null}

        {error ? (
          <p className="mt-2.5 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] leading-snug text-rose-300" role="alert">
            {error}
          </p>
        ) : null}

        <dl className="mt-2.5 grid gap-1.5 text-[11px] leading-snug sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="text-slate-400">{t('Storage')}</dt>
            <dd className={storage.enabled ? 'text-slate-200' : 'text-amber-200'}>
              {storage.enabled ? t('This project database, reachable') : t('Not configured on this server')}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-slate-400">{t('Editing')}</dt>
            <dd className={writable ? 'text-slate-200' : 'text-amber-200'}>
              {writable ? t('Needs the admin key above') : t('Switched off on this server')}
            </dd>
          </div>
        </dl>

        {!writable && gateReason ? <p className="mt-2 text-[11px] leading-relaxed text-amber-200">{gateReason}</p> : null}
        {!storage.enabled && storage.reason ? <p className="mt-2 text-[11px] leading-relaxed text-amber-200">{storage.reason}</p> : null}
        {tableError ? (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-200">
            {t('The settings table could not be read, so only platform variables are in use.')} ({tableError})
          </p>
        ) : null}
      </div>

      {groups.map(group => {
        const list = byGroup.get(group) || [];
        if (!list.length) return null;
        return (
          <div className="card p-3" key={group}>
            <div className="flex min-h-[36px] flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-[13px] font-bold leading-tight text-slate-100">{t(GROUP_TITLES[group] || group)}</h2>
              <span className="tag-quiet">
                {`${list.filter(row => row.present).length}/${list.length}`} {t('set')}
              </span>
            </div>
            <ul className="reveal-group mt-2 grid gap-2 md:grid-cols-2">
              {list.map(row => (
                <SettingRow
                  key={row.name}
                  row={row}
                  adminKey={adminKey}
                  busy={busy || loading}
                  draft={drafts[row.name]}
                  notice={notice}
                  onSave={name => void save(name)}
                  onForget={name => void forget(name)}
                  onDraft={(name, value) => setDrafts(current => ({ ...current, [name]: value }))}
                />
              ))}
            </ul>
          </div>
        );
      })}

      <div className="card p-3">
        <h2 className="text-[13px] font-bold leading-tight text-slate-100">{t('What stays in the hosting dashboard')}</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {t('Five controls stay out of this screen on purpose.')}{' '}
          {t('They are the database address, its secret key, the scheduled-pull key, the visitor-quota salt, and the written permission for paid runs.')}{' '}
          {t('If this screen could write them, one request could point the app at another database, or switch paid usage on by itself.')}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {t('A saved key is never shown back.')}{' '}
          {t('Only its last four characters are listed, and the log records the name of the setting that changed, never its value.')}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {t('After saving the analysis key, open the dashboard and press Re-run analysis.')}{' '}
          {t('That names the complaint clusters with the new key without pulling anything again, and stored reviews are not touched.')}
        </p>
      </div>
    </section>
  );
}
