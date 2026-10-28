import assert from 'node:assert/strict';
import test, { describe, afterEach } from 'node:test';

import { ApiError, fetchConfigStatus, fetchState, forgetConfigSetting, saveConfigValue } from '../src/lib/api.js';

// Permintaan mana pun yang keluar dari peramban direkam di sini, jadi yang diuji adalah
// bentuk permintaan dan nasib jawabannya — bukan jaringan sungguhan.
let calls = [];

function reply({ status = 200, body = '', throws = false }) {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (throws) throw new TypeError('offline');
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
}

afterEach(() => {
  calls = [];
  delete globalThis.fetch;
});

describe('lapisan permintaan peramban', () => {
  test('504 dari platform dijelaskan sebagai batas waktu, bukan sebagai jawaban rusak', async () => {
    reply({ status: 504, body: '' });
    const error = await fetchState().then(() => null, cause => cause);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 504);
    assert.equal(error.code, 'server_timeout');
    assert.match(error.message, /platform time limit/);
    assert.match(error.message, /nothing was changed/i);
  });

  test('tahap dan alasan dari server digabung ke satu kalimat yang bisa ditindaklanjuti', async () => {
    reply({ status: 500, body: JSON.stringify({ error: 'db_unreachable', message: 'The server could not complete this request.', stage: 'write snapshot', reason: 'The database request timed out.' }) });
    const error = await fetchState().then(() => null, cause => cause);
    assert.equal(error.code, 'db_unreachable');
    assert.match(error.message, /write snapshot/);
    assert.match(error.message, /timed out/);
  });

  test('jawaban yang bukan JSON dan jaringan yang mati sama-sama punya pesan', async () => {
    reply({ status: 200, body: 'sisi server mengirim html' });
    const unread = await fetchState().then(() => null, cause => cause);
    assert.match(unread.message, /could not be read/);

    reply({ throws: true });
    const offline = await fetchState().then(() => null, cause => cause);
    assert.equal(offline.code, 'network_error');
    assert.match(offline.message, /could not be reached/);
  });

  test('Config memakai endpoint sendiri dan mengirim kunci admin sebagai bearer', async () => {
    reply({ status: 200, body: JSON.stringify({ ok: true, rows: [] }) });
    await fetchConfigStatus('kunci-admin');
    assert.equal(calls[0].url, '/api/config');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authorization, 'Bearer kunci-admin');
    assert.equal(calls[0].init.credentials, 'same-origin');

    await fetchConfigStatus();
    assert.equal(calls[1].init.headers.authorization, undefined, 'tanpa kunci, header tidak dikirim sama sekali');
  });

  test('menulis dan menghapus setelan mengirim nama yang sudah dibatasi server', async () => {
    reply({ status: 200, body: JSON.stringify({ ok: true, rows: [] }) });
    await saveConfigValue({ name: 'GEMINI_MODEL', value: 'gemini-2.5-flash', token: 'admin' });
    assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'put', name: 'GEMINI_MODEL', value: 'gemini-2.5-flash' });

    await forgetConfigSetting({ name: 'NEWS_RSS_URLS', token: 'admin' });
    assert.deepEqual(JSON.parse(calls[1].init.body), { action: 'forget', name: 'NEWS_RSS_URLS' });
  });

  test('401 dari layar Config tidak disamarkan menjadi kesalahan jaringan', async () => {
    reply({ status: 401, body: JSON.stringify({ error: 'unauthorized', message: 'The admin key for this screen is missing or does not match.' }) });
    const error = await saveConfigValue({ name: 'GEMINI_MODEL', value: 'x', token: 'salah' }).then(() => null, cause => cause);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'unauthorized');
    assert.match(error.message, /admin key/);
  });

  test('503 tanpa JSON tetap membawa statusnya ke layar', async () => {
    reply({ status: 503, body: '' });
    const error = await fetchConfigStatus('admin').then(() => null, cause => cause);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'request_failed');
    assert.match(error.message, /503/, 'tanpa badan JSON, satu-satunya fakta yang jujur adalah nomor statusnya');
  });
});
