import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { loadEnvFiles, parseEnv } from '../load-env.mjs';

describe('pemuat environment lokal', () => {
  test('baris komentar, kosong, dan tanpa nilai diabaikan dengan benar', () => {
    const parsed = parseEnv([
      '# komentar',
      '',
      '   ',
      'SUPABASE_URL=https://x.supabase.co',
      'PORT=5173',
      'KOSONG=',
      'TANPA_SEPARATOR',
      'BERPETIK="kutipan ganda"',
      "BERPETIK2='kutipan tunggal'",
    ].join('\n'));
    assert.equal(parsed.SUPABASE_URL, 'https://x.supabase.co');
    assert.equal(parsed.PORT, '5173');
    assert.equal(parsed.KOSONG, '');
    assert.equal('TANPA_SEPARATOR' in parsed, false);
    assert.equal(parsed.BERPETIK, 'kutipan ganda');
    assert.equal(parsed.BERPETIK2, 'kutipan tunggal');
  });

  test('nilai dari host tidak pernah tertimpa isi berkas', () => {
    const env = { SUPABASE_URL: 'https://asli.supabase.co' };
    const root = 'C:/sentil-test-hanya-teks';
    const files = ['.env'];
    const loaded = loadEnvFiles({ root, files, env });
    // Berkas tidak ada di path itu, jadi tidak ada yang berubah dan tidak ada yang melempar.
    assert.deepEqual(loaded, []);
    assert.equal(env.SUPABASE_URL, 'https://asli.supabase.co');
  });

  test('berkas yang tidak ada bukan kesalahan: server tetap jalan', () => {
    const env = {};
    const loaded = loadEnvFiles({ root: 'C:/sentil-test-kosong', files: ['.env', '.env.local'], env });
    assert.deepEqual(loaded, []);
    assert.deepEqual(env, {});
  });
});
