import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import tmpdir from 'node:os';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';

import { createAppServer, resolveStaticPath } from '../server.mjs';

const ROOT = path.join(process.cwd(), 'public');

// Uji jalur statis tidak boleh bergantung pada apakah `npm run build` sudah dijalankan,
// jadi berkasnya dibuat di direktori sementara sendiri.
function fixtureRoot() {
  const dir = mkdtempSync(path.join(tmpdir.tmpdir(), 'sentil-static-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Sentil</title><div id="root"></div>');
  writeFileSync(path.join(dir, 'app.js'), 'console.log(1);');
  writeFileSync(path.join(dir, 'styles.css'), 'body{color:red}');
  mkdirSync(path.join(dir, 'assets/fonts'), { recursive: true });
  writeFileSync(path.join(dir, 'assets/fonts/fraunces-latin-var.woff2'), 'font');
  return dir;
}

describe('penyelesaian berkas statis', () => {
  test('hanya mengizinkan berkas aplikasi dan aset', () => {
    assert.equal(resolveStaticPath('/', ROOT), path.join(ROOT, 'index.html'));
    assert.equal(resolveStaticPath('/index.html', ROOT), path.join(ROOT, 'index.html'));
    assert.equal(resolveStaticPath('/app.js', ROOT), path.join(ROOT, 'app.js'));
    assert.equal(resolveStaticPath('/styles.css', ROOT), path.join(ROOT, 'styles.css'));
    assert.equal(resolveStaticPath('/assets/fonts/manrope-latin-var.woff2', ROOT), path.join(ROOT, 'assets/fonts/manrope-latin-var.woff2'));
  });

  test('menolak lintasan jalur dan berkas lama', () => {
    assert.equal(resolveStaticPath('/assets/../../package.json', ROOT), null);
    assert.equal(resolveStaticPath('/assets/%2e%2e%2fpackage.json', ROOT), null);
    assert.equal(resolveStaticPath('/assets', ROOT), null);
    assert.equal(resolveStaticPath('/model.js', ROOT), null);
    assert.equal(resolveStaticPath('/collectors.mjs', ROOT), null);
    assert.equal(resolveStaticPath('/.env.local', ROOT), null);
    assert.equal(resolveStaticPath('/online-data.json', ROOT), null);
    assert.equal(resolveStaticPath('/%zz', ROOT), null);
  });
});

describe('server pratinjau lokal', () => {
  let server;
  let base;
  let dir;
  const seen = [];

  before(async () => {
    const syncHandler = async (request, response) => {
      seen.push(request.method);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, action: 'discover' }));
    };
    dir = fixtureRoot();
    server = createAppServer({ syncHandler, root: dir });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  test('menyajikan cangkang aplikasi dengan header keamanan', async () => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    const html = await response.text();
    assert.match(html, /<div id="root">/);
    assert.match(html, /Sentil/);
  });

  test('menyajikan hasil build dan aset font', async () => {
    for (const route of ['/app.js', '/styles.css', '/assets/fonts/fraunces-latin-var.woff2']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
    }
  });

  test('HEAD tidak mengirim body', async () => {
    const response = await fetch(`${base}/styles.css`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    assert.ok(Number(response.headers.get('content-length')) > 0);
  });

  test('berkas yang tidak diizinkan dan tidak ada menghasilkan 404', async () => {
    assert.equal((await fetch(`${base}/model.js`)).status, 404);
    assert.equal((await fetch(`${base}/tidak-ada.js`)).status, 404);
    assert.equal((await fetch(`${base}/api/data`)).status, 404);
  });

  test('/api/sync diteruskan ke handler tanpa login', async () => {
    const response = await fetch(`${base}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'discover', entity: 'Aplikasi Tes' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, action: 'discover' });
    assert.deepEqual(seen, ['POST']);
  });

  test('metode lain pada /api/sync ditolak', async () => {
    const response = await fetch(`${base}/api/sync`);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });
});
