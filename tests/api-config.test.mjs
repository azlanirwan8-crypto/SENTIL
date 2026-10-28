import assert from 'node:assert/strict';
import test, { describe, beforeEach } from 'node:test';

import { createConfigHandler } from '../api/config.js';
import { invalidateConfigCache } from '../lib/config-store.mjs';

const ADMIN = 'kunci-admin-untuk-uji-1234';
const KEY = 'AIzaSyDEMOKEYxxxxxxxxxxxxxxxxxxxxxx';

function fakeRequest({ method = 'POST', headers = {}, body, raw }) {
  const chunks = raw != null ? [Buffer.from(raw)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { host: 'sentil.example', 'sec-fetch-site': 'same-origin', ...headers },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function fakeResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, sent) {
      this.statusCode = status;
      this.headers = sent || {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
}

function fakeDb(rows = [], { fail = null } = {}) {
  return {
    enabled: true,
    reason: null,
    calls: [],
    async listConfig() {
      if (fail === 'list') throw new Error('relation "sentil_config" does not exist');
      return rows;
    },
    async putConfig(name, value) {
      this.calls.push({ op: 'put', name, value });
      rows.push({ name, value, updated_at: '2026-10-28T00:00:00Z' });
    },
    async deleteConfig(name) {
      this.calls.push({ op: 'delete', name });
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].name === name) rows.splice(index, 1);
      }
    },
  };
}

async function run(handler, request) {
  const response = fakeResponse();
  await handler(request, response);
  return response;
}

const bearer = token => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  invalidateConfigCache();
});

describe('rute /api/config', () => {
  test('hanya menerima POST', async () => {
    const response = await run(createConfigHandler({ db: fakeDb(), env: {} }), fakeRequest({ method: 'GET' }));
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'POST');
  });

  test('permintaan lintas situs ditolak sebelum isi dibaca', async () => {
    const db = fakeDb();
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } });
    const response = await run(handler, fakeRequest({
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://penyerang.example' },
      body: { action: 'put', name: 'GEMINI_API_KEY', value: KEY },
    }));
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, 'cross_site');
    assert.deepEqual(db.calls, [], 'penolakan terjadi sebelum apa pun dibaca atau ditulis');
  });

  test('isi yang bukan JSON, kosong, dan terlalu besar ditolak dengan rapi', async () => {
    const handler = createConfigHandler({ db: fakeDb(), env: { SENTIL_CONFIG_SECRET: ADMIN } });
    assert.equal((await run(handler, fakeRequest({ raw: 'bukan json' }))).json().error, 'body_invalid');
    assert.equal((await run(handler, fakeRequest({ raw: '[1,2]' }))).json().error, 'body_invalid');
    assert.equal((await run(handler, fakeRequest({}))).json().error, 'body_required');
    const huge = await run(handler, fakeRequest({ raw: `{"action":"status","padding":"${'x'.repeat(20000)}"}` }));
    assert.equal(huge.statusCode, 413);
  });

  test('aksi yang tidak dikenal ditolak', async () => {
    const response = await run(createConfigHandler({ db: fakeDb(), env: {} }), fakeRequest({ body: { action: 'reveal' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'action_invalid');
  });

  test('daftar boleh dibaca tanpa kunci admin, tanpa satu pun nilai rahasia', async () => {
    const db = fakeDb([{ name: 'GEMINI_API_KEY', value: KEY, updated_at: '2026-10-28T00:00:00Z' }]);
    const response = await run(createConfigHandler({ db, env: {} }), fakeRequest({ body: { action: 'status' } }));
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.authorized, false, 'tanpa kunci admin, layar hanya melihat daftar');
    assert.equal(body.writable, false);
    assert.match(body.reason, /SENTIL_CONFIG_SECRET/);
    const gemini = body.rows.find(row => row.name === 'GEMINI_API_KEY');
    assert.equal(gemini.source, 'config');
    assert.equal(gemini.masked, `••••${KEY.slice(-4)}`);
    assert.equal(gemini.value, null);
    assert.equal(response.body.includes(KEY), false, 'kunci tidak boleh muncul di badan jawaban');
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  test('sumber nilai dilaporkan apa adanya: tersimpan di sini, variabel platform, atau belum diisi', async () => {
    const db = fakeDb([{ name: 'REDDIT_SUBREDDITS', value: 'r/bni', updated_at: '2026-10-28T00:00:00Z' }]);
    const response = await run(createConfigHandler({ db, env: { YOUTUBE_API_KEY: KEY } }), fakeRequest({ body: { action: 'status' } }));
    const rows = response.json().rows;
    assert.equal(rows.find(row => row.name === 'REDDIT_SUBREDDITS').source, 'config');
    assert.equal(rows.find(row => row.name === 'YOUTUBE_API_KEY').source, 'env');
    assert.equal(rows.find(row => row.name === 'NEWS_RSS_URLS').source, 'none');
    assert.equal(rows.find(row => row.name === 'NEWS_RSS_URLS').present, false);
  });

  test('database yang belum punya tabel tetap menjawab dengan alasannya', async () => {
    const response = await run(createConfigHandler({ db: fakeDb([], { fail: 'list' }), env: { SENTIL_CONFIG_SECRET: ADMIN } }), fakeRequest({ body: { action: 'status' } }));
    assert.equal(response.statusCode, 200, 'daftar yang gagal dibaca bukan kegagalan layar');
    const body = response.json();
    assert.match(body.tableError, /sentil_config|db_request_failed/);
    assert.equal(body.rows.find(row => row.name === 'GEMINI_API_KEY').source, 'none');
  });

  test('menulis tanpa kunci admin ditolak, dan tanpa database ditolak terpisah', async () => {
    const db = fakeDb();
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } });
    const denied = await run(handler, fakeRequest({ body: { action: 'put', name: 'GEMINI_MODEL', value: 'gemini-2.5-flash' } }));
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.json().error, 'unauthorized');

    const wrong = await run(handler, fakeRequest({ headers: bearer('kunci-salah'), body: { action: 'put', name: 'GEMINI_MODEL', value: 'gemini-2.5-flash' } }));
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(db.calls, [], 'yang ditolak tidak boleh menulis apa pun');

    const noDb = await run(createConfigHandler({ db: { enabled: false, reason: 'SUPABASE_URL is not set.' }, env: { SENTIL_CONFIG_SECRET: ADMIN } }),
      fakeRequest({ headers: bearer(ADMIN), body: { action: 'put', name: 'GEMINI_MODEL', value: 'gemini-2.5-flash' } }));
    assert.equal(noDb.statusCode, 503);
    assert.match(noDb.json().message, /database/);
    assert.equal(noDb.json().reason, 'SUPABASE_URL is not set.');
  });

  test('tanpa kunci admin di server, tulisan menjawab 501 dengan langkah pemasangannya', async () => {
    const db = fakeDb();
    const response = await run(createConfigHandler({ db, env: {} }), fakeRequest({ headers: bearer(ADMIN), body: { action: 'put', name: 'GEMINI_MODEL', value: 'gemini-2.5-flash' } }));
    assert.equal(response.statusCode, 501);
    assert.equal(response.json().error, 'config_gate_missing');
    assert.match(response.json().message, /Vercel/);
    assert.deepEqual(db.calls, []);
  });

  test('nilai yang cacat bentuknya tidak pernah sampai ke tabel', async () => {
    const db = fakeDb();
    const response = await run(createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } }), fakeRequest({
      headers: bearer(ADMIN),
      body: { action: 'put', name: 'NEWS_RSS_URLS', value: 'http://feed.example/rss' },
    }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'config_value_invalid');
    assert.match(response.json().message, /https/);
    assert.deepEqual(db.calls, []);
  });

  test('nama di luar daftar tidak bisa ditulis walau dikirim dengan kunci admin yang benar', async () => {
    const db = fakeDb();
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } });
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'APIFY_ALLOWED']) {
      const response = await run(handler, fakeRequest({ headers: bearer(ADMIN), body: { action: 'put', name, value: 'apa-apa-saja' } }));
      assert.equal(response.statusCode, 400, `${name} harus ditolak`);
      assert.match(response.json().message, /allowed list/);
    }
    assert.deepEqual(db.calls, []);
  });

  test('menulis kunci mengembalikan daftar tersamar dan nilai aslinya tidak pernah keluar', async () => {
    const db = fakeDb();
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } });
    const response = await run(handler, fakeRequest({ headers: bearer(ADMIN), body: { action: 'put', name: 'GEMINI_API_KEY', value: `  ${KEY}  ` } }));
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.action, 'put');
    assert.equal(body.saved, 'GEMINI_API_KEY');
    assert.equal(body.authorized, true);
    assert.deepEqual(db.calls, [{ op: 'put', name: 'GEMINI_API_KEY', value: KEY }], 'nilai dikirim sudah dibersihkan dari spasi');
    const gemini = body.rows.find(row => row.name === 'GEMINI_API_KEY');
    assert.equal(gemini.value, null);
    assert.equal(gemini.masked, `••••${KEY.slice(-4)}`);
    assert.equal(response.body.includes(KEY), false);
  });

  test('menghapus setelan mengembalikan nilai platform sebagai sumber yang berlaku', async () => {
    const db = fakeDb([{ name: 'GEMINI_MODEL', value: 'gemini-2.5-flash', updated_at: '2026-10-28T00:00:00Z' }]);
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN, GEMINI_MODEL: 'gemini-flash-latest' } });
    const response = await run(handler, fakeRequest({ headers: bearer(ADMIN), body: { action: 'forget', name: 'GEMINI_MODEL' } }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().action, 'forget');
    assert.equal(db.calls.at(-1).op, 'delete');
    const model = response.json().rows.find(row => row.name === 'GEMINI_MODEL');
    assert.equal(model.source, 'env', 'setelah dihapus, environment platform kembali yang terpakai');
    assert.equal(model.value, 'gemini-flash-latest');
  });

  test('menulis nilai kosong sama artinya dengan menghapus barisnya', async () => {
    const db = fakeDb([{ name: 'GEMINI_API_KEY', value: KEY, updated_at: '2026-10-28T00:00:00Z' }]);
    const handler = createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } });
    const response = await run(handler, fakeRequest({ headers: bearer(ADMIN), body: { action: 'put', name: 'GEMINI_API_KEY', value: '   ' } }));
    assert.equal(response.statusCode, 200);
    assert.equal(db.calls.at(-1).op, 'delete', 'string kosong tidak boleh masuk tabel');
    assert.equal(response.json().rows.find(row => row.name === 'GEMINI_API_KEY').present, false);
  });

  test('kegagalan tulisan dilaporkan tanpa mengulang isi permintaan', async () => {
    const db = fakeDb();
    db.putConfig = async () => { throw new Error(`write refused for ${KEY}`); };
    const response = await run(createConfigHandler({ db, env: { SENTIL_CONFIG_SECRET: ADMIN } }), fakeRequest({
      headers: bearer(ADMIN),
      body: { action: 'put', name: 'GEMINI_API_KEY', value: KEY },
    }));
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().message, 'The configuration could not be changed. Existing settings were not removed.');
    assert.equal(response.body.includes(KEY), false, 'pesan galat tidak boleh mengulang kunci');
  });
});
