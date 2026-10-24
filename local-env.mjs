// Muat konfigurasi dari berkas .env lokal yang di-git-ignore. Nilai yang sudah ada di
// environment proses selalu menang, dan berkas ini tidak pernah disajikan lewat HTTP.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
export const defaultEnvPath = join(root, '.env');

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

export async function loadLocalEnv(path = defaultEnvPath) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  const values = parseEnvFile(text);
  for (const [key, value] of Object.entries(values)) if (typeof process.env[key] !== 'string' || !process.env[key].trim()) process.env[key] = value;
  return values;
}
