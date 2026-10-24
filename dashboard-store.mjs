// Penyimpanan dataset untuk lingkungan serverless (Vercel Functions).
// Disk /tmp hanya bertahan selama instance hidup, jadi state dipegang di memori
// dan ditulis ke DATA_PATH agar penarikan berikutnya tetap memakai riwayat yang sama.
import { readFile, writeFile } from 'node:fs/promises';
import { collectOnline, collectPlatform, channelConfigurations } from './collectors.mjs';
import { initialDataset, overlayConfiguration, buildDataset, reclassifyDerived, resumeMap } from './dashboard-core.mjs';
import { withAbsa } from './model.js';

// Environment dibaca saat dipakai agar fungsi yang baru dimuat ulang mengikuti
// konfigurasi deployment, bukan nilai saat modul pertama kali diimpor.
const storagePath = () => process.env.DATA_PATH?.trim() || '/tmp/online-data.json';
// Actor Apify dapat berjalan beberapa menit. Batas tunggu dijaga di bawah maxDuration
// function agar run yang belum selesai sempat dicatat dan dilanjutkan pada penarikan
// berikutnya, bukan dimulai ulang dari nol.
const apifyWaitMs = () => {
  const configured = Number(process.env.APIFY_WAIT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
};

let cache = null;
let running = false;

export const isRunning = () => running;

async function readStored() {
  try {
    const saved = JSON.parse(await readFile(storagePath(), 'utf8'));
    if (Array.isArray(saved.reviews) && Array.isArray(saved.sources) && Array.isArray(saved.runs)) return saved;
  } catch { /* belum ada berkas di instance ini */ }
  return null;
}

async function writeStored(dataset) {
  try { await writeFile(storagePath(), JSON.stringify(dataset, null, 2), 'utf8'); }
  catch { /* disk sementara tidak dapat ditulis: state memori tetap dipakai */ }
}

export async function snapshot() {
  if (!cache) {
    const stored = (await readStored()) ?? initialDataset();
    cache = { ...stored, reviews: withAbsa(reclassifyDerived(stored.reviews)), sources: overlayConfiguration(stored.sources, channelConfigurations()) };
  }
  return { ...cache, running };
}

export async function pull({ collector = collectOnline } = {}) {
  return runStep((previous, options) => collector(options), { recordRun: true });
}

// Satu kanal per permintaan. Antarmuka memakainya untuk menampilkan progres nyata per
// platform, dan function serverless selesai dalam waktu singkat tanpa menahan 3 menit.
export async function pullPlatform(id, { collect = collectPlatform } = {}) {
  return runStep(async (previous, options) => {
    const result = await collect(id, options);
    if (!result) throw new Error('unknown-platform');
    return [result];
  }, { recordRun: false });
}

// Menutup batch penarikan bertahap dan mencatat satu entri riwayat. Dipisahkan agar
// kegagalan satu kanal terakhir tidak membuat seluruh penarikan tanpa catatan.
export async function finishPull() {
  return runStep(async () => [], { recordRun: true });
}

async function runStep(produce, { recordRun }) {
  if (running) throw new Error('busy');
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const previous = await snapshot();
    const results = await produce(previous, { resume: resumeMap(previous), apifyWaitMs: apifyWaitMs() });
    const finishedAt = new Date().toISOString();
    cache = buildDataset({ previous, results, startedAt, finishedAt, channelConfig: channelConfigurations(), recordRun });
    await writeStored(cache);
    return { ...cache, running: false };
  } finally {
    running = false;
  }
}

