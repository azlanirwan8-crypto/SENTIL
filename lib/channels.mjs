// Katalog kanal yang aman dimuat di peramban: hanya label dan pengelompokan, tanpa
// impor Node (kolektor memakai node:crypto, jadi tidak boleh ikut ke bundle klien).
export const CHANNEL_CATALOG = [
  { id: 'play', label: 'Google Play', group: 'store', credential: null },
  { id: 'appstore', label: 'App Store', group: 'store', credential: null },
  { id: 'youtube', label: 'YouTube', group: 'social', credential: 'YOUTUBE_API_KEY' },
  { id: 'reddit', label: 'Reddit', group: 'social', credential: 'REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET' },
  { id: 'news', label: 'News & blogs', group: 'web', credential: null },
  { id: 'facebook', label: 'Facebook', group: 'social', credential: 'APIFY_API_TOKEN' },
  { id: 'instagram', label: 'Instagram', group: 'social', credential: 'APIFY_API_TOKEN' },
  { id: 'tiktok', label: 'TikTok', group: 'social', credential: 'APIFY_API_TOKEN' },
  { id: 'x', label: 'X / Twitter', group: 'social', credential: 'APIFY_API_TOKEN' },
];

export const CHANNEL_IDS = CHANNEL_CATALOG.map(channel => channel.id);
export const CHANNEL_LABELS = Object.fromEntries(CHANNEL_CATALOG.map(channel => [channel.id, channel.label]));

export const PLATFORM_LABELS = {
  ...CHANNEL_LABELS,
  play: 'Google Play',
  appstore: 'App Store',
};
