// Lapisan penamaan (label-naming-v1): MODEL BAHASA HANYA MEMBERI NAMA, mesin yang menghitung.
//
// Kontrak yang membuat kolom "Category" tetap bisa diaudit:
//   1. yang dikirim ke model HANYA id gerombol dan frasa verbatim reviewers — tanpa jumlah
//      ulasan, tanpa persentase, tanpa skor. Model tidak bisa mengubah angka karena ia tidak
//      pernah melihatnya;
//   2. yang kembali hanya boleh id yang kita kirim. Id asing dibuang, jadi model tidak bisa
//      menambah gerombol yang tidak dibuktikan mesin;
//   3. nama yang memuat angka apa pun ditolak, supaya tidak ada angka yang lolos dari kepala
//      model ke tabel yang terbaca sebagai hasil pengukuran;
//   4. tanpa kunci, panggilan gagal, atau kuota habis — penamaan di-skip dan panel jatuh ke
//      nama korpus seperti biasa. Penarikan data tidak pernah gagal karena lapisan ini.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const NAMING_VERSION = 'label-naming-v1';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_CLUSTERS = 40;
const MAX_PHRASES = 6;
const MAX_NAME_LENGTH = 60;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function namingConfiguration(env = process.env) {
  const key = clean(env?.GEMINI_API_KEY);
  const model = clean(env?.GEMINI_MODEL) || DEFAULT_MODEL;
  return { enabled: Boolean(key), key, model };
}

// Angka tidak boleh keluar dari mulut model — dan tidak boleh masuk ke prompt-nya.
function hasDigits(value) {
  return /\d/.test(value);
}

function acceptableName(value) {
  const name = clean(value);
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  if (hasDigits(name)) return null;
  return name;
}

export function namingRequest(clusters) {
  const payload = clusters.slice(0, MAX_CLUSTERS).map(cluster => ({
    id: cluster.id,
    phrases: cluster.phrases.slice(0, MAX_PHRASES),
  }));
  return {
    systemInstruction: {
      parts: [{
        text: [
          'You are naming clusters of app-review complaints for an analytics table.',
          'You receive cluster ids and the exact wording reviewers wrote. You never receive counts.',
          'For each cluster return a short analyst category (2-4 words, an area of the product)',
          'and a shorter sub-label (1-3 words, the specific thing being complained about).',
          'Rules: reply with JSON only, as {"names":[{"id":"...","category":"...","subLabel":"..."}]}',
          'Use every id exactly once and invent no new id. Write in English. Never use digits or numbers.',
          'Do not restate the reviewers; name what they are talking about.',
        ].join(' '),
      }],
    },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ clusters: payload }) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 2048 },
  };
}

// Respons model di-parse sekuat mungkin: Gemini membungkus JSON di `candidates[0].content.parts`,
// dan model kadang masih menambahkan pagar markdown. Yang tidak bisa dibaca = penamaan di-skip.
function parseNames(text) {
  const raw = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.names) ? parsed.names : null;
  } catch {
    return null;
  }
}

export function applyNames(clusters, names) {
  const allowed = new Map(clusters.slice(0, MAX_CLUSTERS).map(cluster => [cluster.id, cluster]));
  const out = {};
  if (!Array.isArray(names)) return out;
  for (const entry of names) {
    const id = clean(entry?.id);
    if (!allowed.has(id)) continue;
    const category = acceptableName(entry?.category);
    const subLabel = acceptableName(entry?.subLabel);
    if (!category) continue;
    out[id] = { category, subLabel: subLabel || null };
  }
  return out;
}

export async function nameClusters(clusters, { env = process.env, fetchImpl = fetch, timeoutMs = 25_000 } = {}) {
  const list = Array.isArray(clusters) ? clusters.filter(cluster => cluster?.id && Array.isArray(cluster?.phrases) && cluster.phrases.length) : [];
  if (!list.length) return { status: 'skipped', reason: 'no clusters to name', names: {} };
  const config = namingConfiguration(env);
  if (!config.enabled) return { status: 'skipped', reason: 'GEMINI_API_KEY is not set in the server environment', model: config.model, names: {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
      const response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(config.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
        body: JSON.stringify(namingRequest(list)),
        signal: controller.signal,
      });
    if (!response.ok) {
      return { status: 'failed', reason: `gemini responded ${response.status}`, model: config.model, names: {} };
    }
    const body = await response.json();
    const text = (body?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('');
    const names = applyNames(list, parseNames(text));
    const named = Object.keys(names).length;
    if (!named) return { status: 'failed', reason: 'no usable names in the model response', model: config.model, names: {} };
    return { status: 'named', provider: 'gemini', model: config.model, clusters: list.length, named, names };
  } catch (error) {
    return { status: 'failed', reason: error?.name === 'AbortError' ? 'naming timed out' : clean(error?.message) || 'naming failed', model: config.model, names: {} };
  } finally {
    clearTimeout(timer);
  }
}
