// Menu Config: satu pintu untuk membaca dan mengubah konfigurasi induk aplikasi.
//
// Aturan yang tidak bisa ditawar di layar ini: nilainya adalah kunci API. Karena itu
//  - permintaan lintas situs ditolak (guard yang sama dengan /api/sync),
//  - menulis dan menghapus wajib memakai kunci admin yang hidup di environment platform,
//  - nilai rahasia tidak pernah keluar dari server, termasuk di log dan pesan galat,
//  - nama yang boleh disentuh dibatasi daftar tertutup di lib/config-store.mjs.
export const config = { maxDuration: 60 };

import {
  acceptsConfigSecret,
  configConfiguration,
  configGroups,
  configRows,
  forgetConfigValue,
  loadConfigValues,
  validateConfigValue,
  writeConfigValue,
} from '../lib/config-store.mjs';
import { database } from '../lib/db.mjs';
import { rejectsSameSiteCheck } from './sync.js';

const BODY_LIMIT = 8192;

const json = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) throw new Error('body_required');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value;
  } catch {
    throw new Error('body_invalid');
  }
}

export function createConfigHandler({ db = database, env = process.env, now = () => Date.now() } = {}) {
  const gate = configConfiguration(env);

  async function payload(request, values, updatedAt) {
    return {
      action: 'status',
      ok: true,
      version: 'config-store-v1',
      groups: configGroups(),
      // Kunci admin tidak pernah dikirim ke peramban; yang dilaporkan hanyalah apakah
      // layar ini sedang boleh menulis, dan apa yang harus dipasang kalau tidak.
      authorized: gate.ready ? acceptsConfigSecret(request?.headers || {}, gate.secret) : false,
      writable: gate.ready,
      reason: gate.reason,
      storage: {
        enabled: Boolean(db?.enabled),
        reason: db?.enabled ? null : db?.reason || null,
      },
      rows: configRows({ env, values, updatedAt }),
    };
  }

  return async function handler(request, response) {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
      response.end('');
      return;
    }
    // Satu-satunya alasan guard ini ada di sini: kunci API tidak boleh bisa ditulis atau
    // dibaca dari halaman lain, meskipun aplikasi ini sendiri tanpa akun.
    if (rejectsSameSiteCheck(request.headers || {})) {
      json(response, 403, { error: 'cross_site', message: 'This request did not come from the Sentil page itself.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (failure) {
      const tooLarge = failure.message === 'body_too_large';
      json(response, tooLarge ? 413 : 400, {
        error: failure.message,
        message: tooLarge
          ? 'The configuration request is larger than the allowed size.'
          : 'The configuration request needs a JSON object with an action.',
      });
      return;
    }

    const action = typeof body.action === 'string' ? body.action : '';
    // Yang dicatat hanyalah aksi dan nama setelannya. Nilai tidak pernah masuk log, dan
    // tidak pernah masuk ke pesan galat: pesan itu bisa tersimpan di runtime log platform.
    const log = entry => console.log('[api/config]', JSON.stringify(entry));

    try {
      if (action === 'status') {
        const read = await loadConfigValues({ db, env, now });
        const result = await payload(request, read.values, read.updatedAt);
        log({ action, ok: true, db: result.storage.enabled, tableError: read.error || null });
        json(response, 200, { ...result, tableError: read.error });
        return;
      }

      if (action === 'put' || action === 'forget') {
        if (!gate.ready) {
          json(response, 501, { error: 'config_gate_missing', message: gate.reason });
          return;
        }
        if (!acceptsConfigSecret(request.headers || {}, gate.secret)) {
          json(response, 401, { error: 'unauthorized', message: 'The admin key for this screen is missing or does not match.' });
          return;
        }
        const checked = validateConfigValue(body.name, action === 'put' ? body.value : '');
        if (!checked.ok) {
          log({ action, ok: false, name: String(body.name || '').slice(0, 60), reason: checked.reason });
          json(response, 400, { error: 'config_value_invalid', name: body.name || null, message: checked.reason });
          return;
        }
        if (!db?.enabled) {
          json(response, 503, {
            error: 'db_unavailable',
            message: 'Settings are stored in the project database, and this server has no database configured. Nothing was changed.',
            reason: db?.reason || null,
          });
          return;
        }
        if (action === 'put') await writeConfigValue({ db, name: checked.def.name, value: checked.value });
        else await forgetConfigValue({ db, name: checked.def.name });
        const read = await loadConfigValues({ db, env, now });
        log({ action, ok: true, name: checked.def.name, secret: checked.def.secret });
        json(response, 200, {
          ...(await payload(request, read.values, read.updatedAt)),
          action,
          saved: checked.def.name,
          tableError: read.error,
        });
        return;
      }

      json(response, 400, { error: 'action_invalid', message: 'Unknown configuration action.' });
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'config_failed';
      log({ action, ok: false, code });
      json(response, 500, {
        error: code,
        message: 'The configuration could not be changed. Existing settings were not removed.',
      });
    }
  };
}

export default createConfigHandler();
