import { deriveKeywords } from './discovery.mjs';

// Target analisis adalah identitas aplikasi yang datanya ditarik. Bawaannya tetap aplikasi yang
// selama ini dianalisis, sehingga perilaku lama tidak berubah sedikit pun; target lain dibuat
// dari hasil penemuan (discovery.mjs) dan hanya boleh dipakai setelah pengguna mengonfirmasi.
export const defaultTarget = {
  id: 'wondr-merchant',
  name: 'wondr merchant by BNI',
  entityName: 'wondr merchant',
  category: 'fintech',
  play: { appId: 'id.bni.wfb', url: 'https://play.google.com/store/apps/details?id=id.bni.wfb&hl=id' },
  appstore: { appId: '6741567238', country: 'id', slug: 'wondr-merchant-by-bni' },
  keywords: deriveKeywords('wondr merchant'),
  resolvedAt: null,
};

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slugFromUrl = url => {
  try { return new URL(url).pathname.split('/').filter(Boolean).find(part => !/^(id|app|store)$/.test(part) && !/^id\d+$/.test(part)) ?? null; }
  catch { return null; }
};

export const appleReviewsUrl = target => {
  const { appId, country = 'id', slug } = target.appstore;
  return `https://apps.apple.com/${country}/app/${slug || `id${appId}`}/id${appId}?see-all=reviews&platform=iphone`;
};
export const appleFeedUrl = (target, page) => `https://itunes.apple.com/${target.appstore.country || 'id'}/rss/customerreviews/page=${page}/id=${target.appstore.appId}/sortby=mostrecent/json`;
export const playDetailsUrl = (target, { hl = 'id', gl = 'ID' } = {}) => `https://play.google.com/store/apps/details?id=${encodeURIComponent(target.play.appId)}&hl=${hl}&gl=${gl}`;

// Pola identitas dipakai untuk menyaring teks yang benar-benar menyebut aplikasi target.
// Nama entitas dipecah menjadi kata agar tetap cocok pada penulisan dengan spasi ganda,
// dan kedua ID toko ikut dipakai karena ulasan sering menyebut paket aplikasi, bukan namanya.
export function identityPattern(target) {
  const words = String(target.entityName || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const parts = [];
  if (words.length) parts.push(`\\b${words.join('\\s+')}\\b`);
  if (target.play?.appId) parts.push(`\\b${escapeRegExp(target.play.appId)}(?![\\w.])`);
  if (target.appstore?.appId) parts.push(`\\b(?:id)?${escapeRegExp(target.appstore.appId)}\\b`);
  return new RegExp(parts.join('|'), 'i');
}

export function normalizeTarget(input = {}) {
  const entityName = String(input.entityName || '').trim();
  const playAppId = String(input.playAppId ?? input.play?.appId ?? '').trim();
  const appleAppId = String(input.appleAppId ?? input.appstore?.appId ?? '').trim();
  if (entityName.length < 2) throw new Error('target_invalid: nama entitas wajib diisi');
  if (playAppId && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(playAppId)) throw new Error('target_invalid: ID paket Google Play tidak sesuai bentuk paket aplikasi');
  if (appleAppId && !/^\d{4,12}$/.test(appleAppId)) throw new Error('target_invalid: ID App Store harus angka');
  const playUrl = input.playUrl || (playAppId ? playDetailsUrl({ play: { appId: playAppId } }) : null);
  return {
    id: String(input.id || entityName.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
    name: String(input.name || entityName).trim(),
    entityName,
    category: ['fintech', 'ecommerce', 'app'].includes(input.category) ? input.category : 'app',
    play: { appId: playAppId || null, url: playUrl },
    appstore: { appId: appleAppId || null, country: String(input.country || 'id').toLowerCase(), slug: input.slug ?? slugFromUrl(input.appleSourceUrl || '') },
    keywords: deriveKeywords(entityName),
    resolvedAt: input.resolvedAt ?? null,
  };
}

// Konversi hasil penemuan menjadi target. Sengaja gagal bila identitasnya belum confirmed:
// sistem tidak boleh menurunkan target dari kandidat yang masih seri.
export function targetFromDiscovery({ discovery, id, name }) {
  const play = discovery.play.status === 'confirmed' ? discovery.play.chosen : null;
  const apple = discovery.appstore.status === 'confirmed' ? discovery.appstore.chosen : null;
  if (!play && !apple) throw new Error('discovery_unconfirmed: tidak ada identitas toko yang dapat dipastikan; pilih kandidat atau isi ID manual.');
  return normalizeTarget({
    id, name: name || discovery.entityName, entityName: discovery.entityName, category: discovery.category,
    playAppId: play?.appId ?? null, playUrl: play?.sourceUrl ?? null,
    appleAppId: apple?.appId ?? null, appleSourceUrl: apple?.sourceUrl ?? null,
    resolvedAt: discovery.resolvedAt,
  });
}

export const targetLabel = target => target?.name || target?.entityName || 'tanpa target';
export const targetStoreIds = target => [
  target?.play?.appId ? `Google Play: ${target.play.appId}` : 'Google Play: tidak terpasang',
  target?.appstore?.appId ? `App Store: ${target.appstore.appId}` : 'App Store: tidak terpasang',
].join(' | ');
