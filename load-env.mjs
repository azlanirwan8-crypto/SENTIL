// Pemuat environment untuk jalan lokal. Dipakai lewat `node --import=./load-env.mjs`
// supaya variabel sudah terisi sebelum server.mjs dan lib/db.mjs dievaluasi.
//
// Sengaja tidak memakai flag --env-file-if-exists: flag itu tidak ada di Node 20 yang
// masih dipakai banyak mesin, dan kegagalan membaca berkas environment tidak boleh
// menghentikan server — aplikasi tetap jalan dan hanya melaporkan database belum terpasang.
import { readFileSync } from 'node:fs';

const FILES = ['.env', '.env.local'];

export function parseEnv(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1)
      || (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

export function loadEnvFiles({ root = process.cwd(), files = FILES, env = process.env } = {}) {
  const loaded = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(`${root}/${file}`, 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      // Variabel asli dari host selalu menang atas isi berkas, supaya nilai yang dipasang
      // di platform tidak pernah tertimpa diam-diam oleh berkas sisa pengembangan.
      if (env[key] !== undefined) continue;
      env[key] = value;
    }
    loaded.push(file);
  }
  return loaded;
}

// Efek sampingnya memang di sini: berkas ini hanya dipakai lewat `node --import=...`,
// jadi cukup diisi saat dimuat. Nilai never dicetak — hanya nama berkas yang dibaca.
loadEnvFiles();
