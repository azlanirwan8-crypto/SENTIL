import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncHandler, rejectsSameSiteCheck } from '../api/sync.js';
import { SyncError } from '../lib/sync-core.mjs';

function fakeRequest({ method = 'POST', headers = {}, body, raw }) {
  const chunks = raw != null ? [Buffer.from(raw)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { host: 'analisa.example', 'sec-fetch-site': 'same-origin', ...headers },
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
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
}

function stubService(responses = {}) {
  const calls = [];
  return {
    calls,
    discover: async (entity, options) => {
      calls.push({ action: 'discover', entity, options });
      return responses.discover || { action: 'discover', entity, play: { candidates: [] }, appstore: { candidates: [] } };
    },
    sync: async payload => {
      calls.push({ action: 'sync', ...payload });
      return responses.sync || { action: 'sync', ok: true, reviews: [], channels: [], summary: {} };
    },
  };
}

async function run(handler, request) {
  const response = fakeResponse();
  await handler(request, response);
  return response;
}

describe('gerbang asal permintaan', () => {
  test('menolak lintas situs, tanpa host, dan tanpa asal', () => {
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'cross-site', origin: 'https://b.example' }), true);
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'none' }), true);
    assert.equal(rejectsSameSiteCheck({ 'sec-fetch-site': 'same-origin' }), true);
    assert.equal(rejectsSameSiteCheck({ host: 'a.example', 'sec-fetch-site': 'same-origin' }), false);
  });

  test('menerima asal yang sama lewat proxy dan http lokal', () => {
    assert.equal(rejectsSameSiteCheck({
      host: 'analisa.example',
      'x-forwarded-host': 'analisa.example',
      'x-forwarded-proto': 'https',
      origin: 'https://analisa.example',
      'sec-fetch-site': 'same-origin',
    }), false);
    assert.equal(rejectsSameSiteCheck({
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
      'sec-fetch-site': 'same-origin',
    }), false);
    assert.equal(rejectsSameSiteCheck({
      host: 'analisa.example',
      'x-forwarded-host': 'analisa.example',
      'x-forwarded-proto': 'https',
      origin: 'https://penyerang.example',
      'sec-fetch-site': 'same-origin',
    }), true);
  });

  test('handler menolak permintaan lintas situs sebelum membaca isi', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://penyerang.example' },
      body: { action: 'discover', entity: 'Aplikasi Tes' },
    }));
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, 'cross_site');
    assert.equal(service.calls.length, 0);
  });
});

describe('/api/sync', () => {
  test('hanya menerima POST', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, { method: 'GET', headers: { host: 'a.example' }, async *[Symbol.asyncIterator]() {} });
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'POST');
  });

  test('aksi discover diteruskan apa adanya', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'discover', entity: '  Aplikasi Tes  ' } }));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().action, 'discover');
    assert.equal(service.calls[0].entity, '  Aplikasi Tes  ');
    assert.deepEqual(service.calls[0].options, { force: false });
  });

  test('aksi sync meneruskan identitas toko dan force', async () => {
    const service = stubService();
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({
      body: { action: 'sync', entity: 'Aplikasi Tes', playAppId: 'com.tes', appleAppId: '12345', force: true },
    }));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(service.calls[0], {
      action: 'sync',
      entity: 'Aplikasi Tes',
      playAppId: 'com.tes',
      appleAppId: '12345',
      force: true,
    });
  });

  test('aksi tak dikenal ditolak dengan 400', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ body: { action: 'hapus' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'action_invalid');
  });

  test('kesalahan validasi layanan dipetakan ke status 4xx-nya', async () => {
    const service = stubService();
    service.sync = async () => { throw new SyncError('target_required', 'Pilih minimal satu identitas toko.', 400); };
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes' } }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'target_required');
    assert.match(response.json().message, /minimal satu/);
  });

  test('kesalahan tak terduga tidak membocorkan isi error', async () => {
    const service = stubService();
    service.sync = async () => { throw new Error('rahasia internal di token db://kredensial'); };
    const handler = createSyncHandler(service);
    const response = await run(handler, fakeRequest({ body: { action: 'sync', entity: 'Aplikasi Tes' } }));
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error, 'internal_error');
    assert.equal(response.json().message.includes('kredensial'), false);
  });

  test('isi permintaan divalidasi: kosong, bukan JSON, dan bukan objek', async () => {
    const handler = createSyncHandler(stubService());
    assert.equal((await run(handler, fakeRequest({}))).json().error, 'body_required');
    assert.equal((await run(handler, fakeRequest({ raw: 'bukan json' }))).json().error, 'body_invalid');
    assert.equal((await run(handler, fakeRequest({ raw: '[1,2,3]' }))).json().error, 'body_invalid');
  });

  test('isi permintaan yang terlalu besar ditolak', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ raw: JSON.stringify({ action: 'discover', entity: 'x'.repeat(40000) }) }));
    assert.equal(response.statusCode, 413);
    assert.equal(response.json().error, 'body_too_large');
  });

  test('respons selalu no-store agar cache tidak menumpuk di tepi', async () => {
    const handler = createSyncHandler(stubService());
    const response = await run(handler, fakeRequest({ body: { action: 'discover', entity: 'Aplikasi Tes' } }));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });
});
