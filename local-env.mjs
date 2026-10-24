// Muat konfigurasi dari berkas .env lokal yang di-git-ignore. Nilai yang sudah ada di
// environment proses selalu menang, dan berkas ini tidak pernah disajikan lewat HTTP.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
// Urutan menimpa: .env.local lebih utama daripada .env, dan keduanya kalah oleh
// variabel yang benar-benar dipasang pada environment proses.
export const envFiles = [join(root, '.env'), join(root, '.env.local')];

export function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) || (value.startsWith("'") && value.endsWith("'") && value.length > 1)) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

export async function loadLocalEnv(paths = envFiles) {
  const files = Array.isArray(paths) ? paths : [paths];
  const merged = {};
  for (const file of files) {
    let text;
    try { text = await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    Object.assign(merged, parseEnvFile(text));
  }
  for (const [key, value] of Object.entries(merged)) if (!process.env[key]?.trim()) process.env[key] = value;
  return merged;
}
