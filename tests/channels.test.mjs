import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSyncService, normalizeSocialTargets, channelCredentials, CHANNEL_IDS } from '../lib/sync-core.mjs';
import { fetchNewsReviews, parseFeed, newsQuery } from '../lib/news.mjs';
import { fetchYouTubeReviews } from '../lib/youtube.mjs';
import { fetchRedditReviews } from '../lib/reddit.mjs';
import { fetchApifyReviews, apifyChannels } from '../lib/apify.mjs';

const ok = (text, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
  headers: { get: name => headers[String(name).toLowerCase()] ?? null },
});

const playChannel = {
  id: 'play',
  status: 'success',
  fetched: 2,
  appId: 'com.tes',
  app: { ratingCount: 9, reviewCountReported: 2 },
  coverage: { pools: [], pages: 1, rows: 2, skipped: 0, reportedReviewCount: 2, reportedRatingCount: 9 },
  limits: { issues: [], paths: [] },
  truncated: false,
  error: null,
  reviews: [
    { id: 'a', platform: 'play', author: 'A', title: null, text: 'aplikasi ini bagus sekali mudah dipakai', rating: 5, date: '2026-10-01', publishedAt: '2026-10-01T00:00:00.000Z', sourceUrl: null, store: 'Google Play', language: null, meta: {} },
    { id: 'b', platform: 'play', author: 'B', title: null, text: 'error terus tidak bisa masuk akun', rating: 1, date: '2026-10-02', publishedAt: '2026-10-02T00:00:00.000Z', sourceUrl: null, store: 'Google Play', language: null, meta: {} },
  ],
};

describe('normalisasi target kanal sosial', () => {
  test('hanya bentuk yang sah yang lolos dan kredensial tidak bisa diselipkan', () => {
    const targets = normalizeSocialTargets({
      news: { enabled: true, token: 'curian' },
      youtube: { enabled: 'ya', videoIds: ['ABCDEFGHIJK', 'p<'] },
      reddit: { enabled: true, subreddits: ['r/finansiastack', '!!', 'x'] },
      play: { enabled: true },
      tiktok: 'bukan objek',
    });
    assert.equal(targets.news.enabled, true);
    assert.equal('token' in targets.news, false, 'bidang asing tidak boleh ikut tersimpan');
    assert.equal(targets.youtube.enabled, false, 'flag harus boolean sejati');
    assert.deepEqual(targets.youtube.videoIds, ['ABCDEFGHIJK']);
    assert.deepEqual(targets.reddit.subreddits, ['finansiastack']);
    assert.equal('play' in targets, false, 'kanal toko tidak lewat jalur sosial');
    assert.equal(targets.tiktok.enabled, false);
  });

  test('status kredensial hanya melaporkan ada atau tidaknya', () => {
    const status = channelCredentials({ YOUTUBE_API_KEY: 'RAHASIA-123', APIFY_TOKEN: 'APIFY-RAHASIA' });
    assert.equal(status.youtube.ready, true);
    assert.equal(status.facebook.ready, false, 'token Apify saja belum cukup: run berbayar butuh izin tertulis pemilik');
    assert.equal(status.facebook.status, 'consent_required', 'kunci ada tetapi izin belum — bukan "kunci belum dipasang"');
    assert.match(status.facebook.message, /APIFY_ALLOWED=true/);
    const consented = channelCredentials({ APIFY_TOKEN: 'APIFY-RAHASIA', APIFY_ALLOWED: 'true' });
    assert.equal(consented.facebook.ready, true, 'token Apify dipakai bersama oleh kanal sosial berbayar');
    assert.equal(consented.x.ready, true, 'kanal X ikut izin yang sama');
    assert.equal(channelCredentials({ APIFY_ALLOWED: 'true' }).tiktok.status, 'needs_setup', 'izin tanpa token tidak membuat kanal jadi siap');
    assert.equal(status.news.ready, true, 'berita RSS tidak butuh kredensial');
    assert.equal(status.reddit.ready, false, 'client id saja tanpa secret belum cukup');
    const serialised = JSON.stringify(status);
    assert.equal(serialised.includes('RAHASIA-123'), false, 'nilai kunci tidak boleh keluar ke klien');
    assert.equal(serialised.includes('APIFY-RAHASIA'), false, 'nilai token tidak boleh keluar ke klien');
  });
});

describe('registry kanal di layanan sinkron', () => {
  const serviceWith = (deps, env = {}) => createSyncService({
    deps: { fetchGooglePlayReviews: async () => ({ ...playChannel, cached: false }), ...deps },
    env,
    now: () => Date.parse('2026-10-26T00:00:00.000Z'),
  });

  test('kanal sosial aktif menambah baris monitor tanpa identitas toko', async () => {
    const service = serviceWith({
      fetchNewsReviews: async () => ({ id: 'news', status: 'success', fetched: 0, reviews: [], coverage: { skipped: 0 }, limits: { issues: [], paths: [] }, truncated: false, error: null }),
    });
    const result = await service.sync({ entity: 'Aplikasi Tes', social: { news: { enabled: true } } });
    assert.deepEqual(result.channels.map(channel => channel.id), ['news']);
    assert.equal(result.limits.sources.length, 1);
    assert.equal(result.limits.sources[0].id, 'news');
    assert.equal(result.target.social.news.enabled, true);
  });

  test('sync menolak ketika tidak ada kanal yang aktif', async () => {
    const service = serviceWith({});
    await assert.rejects(() => service.sync({ entity: 'Aplikasi Tes' }), error => error.code === 'target_required');
  });

  test('kanal needs_setup tidak dianggap kegagalan dan tidak menutupi kanal lain', async () => {
    const service = serviceWith({
      fetchYouTubeReviews: async () => ({ id: 'youtube', status: 'needs_setup', fetched: 0, reviews: [], coverage: null, limits: { issues: [], paths: [] }, truncated: true, error: null, message: 'kunci belum dipasang' }),
    });
    const result = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', social: { youtube: { enabled: true } } });
    const youtube = result.limits.sources.find(source => source.id === 'youtube');
    assert.equal(youtube.state, 'setup');
    assert.equal(result.limits.overall, 'ok');
    assert.equal(result.limits.setupCount, 1);
    assert.equal(result.reviews.length, 2, 'ulasan toko tidak ikut hilang karena kanal sosial menganggur');
  });

  test('run actor yang tertahan dilepas bersama reset dan tidak diturunkan ke klien', async () => {
    const seen = [];
    const slow = {
      id: 'tiktok',
      status: 'partial',
      fetched: 0,
      reviews: [],
      coverage: null,
      limits: { issues: [{ source: 'TikTok', text: 'run STILLRUNNING1 belum selesai dalam 40 detik' }], paths: [] },
      truncated: true,
      error: 'run STILLRUNNING1 belum selesai',
      app: null,
    };
    const service = createSyncService({
      deps: {
        fetchGooglePlayReviews: async () => ({ ...playChannel, cached: false }),
        fetchApifyReviews: async (id, entity, options) => {
          seen.push(options.resumeRunId);
          options.onRunId('STILLRUNNING1');
          return { ...slow };
        },
      },
      env: { APIFY_TOKEN: 'secret-token', APIFY_ALLOWED: 'true' },
    });
    const first = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', social: { tiktok: { enabled: true } } });
    assert.equal(seen[0], null);
    assert.equal(first.limits.sources.find(source => source.id === 'tiktok').state, 'limited');
    const second = await service.sync({ entity: 'Aplikasi Tes', playAppId: 'com.tes', social: { tiktok: { enabled: true } }, force: true });
    assert.equal(seen[1], 'STILLRUNNING1', 'run yang sama disambungkan, bukan diduplikasi');
    assert.equal(JSON.stringify(second).includes('secret-token'), false, 'token tidak boleh ikut respons');
    const reset = service.resetLimits({ entity: 'Aplikasi Tes', playAppId: 'com.tes', social: { tiktok: { enabled: true } } });
    assert.deepEqual(reset.cleared.runs, ['STILLRUNNING1']);
  });
});

describe('konektor berita RSS', () => {
  test('hanya butir yang menyebut seluruh nama entitas yang disimpan', async () => {
    const xml = `<rss><channel>
      <item><guid>1</guid><title>Wondr Merchant luncurkan fitur baru</title><description>Wondr Merchant oleh BNI</description><link>https://example.com/a</link><pubDate>Mon, 24 Aug 2026 07:00:00 GMT</pubDate><source>Kontan</source></item>
      <item><guid>2</guid><title>Rekomendasi saham emiten lain</title><link>https://example.com/b</link><pubDate>Mon, 24 Aug 2026 08:00:00 GMT</pubDate></item>
      <item><guid>3</guid><title>Wondr Merchant</title><link>https://example.com/c</link></item>
      <item><guid>4</guid><link>https://example.com/d</link></item>
    </channel></rss>`;
    const channel = await fetchNewsReviews('Wondr Merchant', {
      budgetMs: 5000,
      fetchImpl: async () => ok(xml),
    });
    assert.equal(channel.status, 'success');
    assert.equal(channel.fetched, 2, 'butir tanpa pubDate tetap dihitung selama menyebut entitas');
    assert.equal(channel.coverage.notAbout, 1, 'butir yang tidak menyebut entitas dicatat, bukan hilang diam-diam');
    assert.equal(channel.coverage.skipped, 1, 'butir tanpa teks dibuang tetapi dihitung');
    assert.equal(channel.reviews[0].store, 'Kontan', 'nama media diambil dari tag source, bukan dari host pengalih');
    assert.equal(channel.reviews[0].rating, null, 'berita tidak boleh diberi bintang karangan');
    assert.match(channel.message, /News is not a customer review/);
  });

  test('suaka yang mengembalikan HTTP 429 menjadi kegagalan sumber, bukan nol liputan', async () => {
    const channel = await fetchNewsReviews('Aplikasi Tes', {
      budgetMs: 5000,
      fetchImpl: async () => ok('<rss><channel></channel></rss>', 429, { 'retry-after': '120' }),
    });
    assert.equal(channel.status, 'error');
    assert.match(channel.limits.issues[0].text, /HTTP 429/);
    assert.match(channel.message, /This is a source failure, not proof that no coverage/);
  });

  test('suaka non-HTTPS dan query pencarian dibentuk dengan aman', () => {
    assert.equal(newsQuery('Wondr Merchant').includes('%22Wondr%20Merchant%22'), true, 'nama entitas dikutip dan dikode');
    assert.equal(parseFeed('<rss><item><title>a</title><link>http://tidak-aman/x</link></item></rss>')[0].link, '', 'tautan non-HTTPS tidak disimpan sebagai sumber');
  });
});

describe('konektor yang menunggu kredensial', () => {
  test('YouTube, Reddit, dan Apify menjawab needs_setup tanpa mengarang baris', async () => {
    const youtube = await fetchYouTubeReviews('Aplikasi Tes', { env: {}, budgetMs: 2000 });
    assert.equal(youtube.status, 'needs_setup');
    assert.equal(youtube.reviews.length, 0);
    assert.match(youtube.message, /YOUTUBE_API_KEY|belum dipasang/);

    const reddit = await fetchRedditReviews('Aplikasi Tes', { env: {}, budgetMs: 2000 });
    assert.equal(reddit.status, 'needs_setup');
    assert.match(reddit.message, /403/, 'alasan tanpa kunci dilaporkan apa adanya');

    for (const id of Object.keys(apifyChannels)) {
      const channel = await fetchApifyReviews(id, 'Aplikasi Tes', { env: {}, budgetMs: 2000 });
      assert.equal(channel.status, 'needs_setup');
      assert.match(channel.message, /APIFY_API_TOKEN/);
    }
  });

  test('penolakan kredensial dipetakan ke sinyal yang dikenali monitor', async () => {
    const youtube = await fetchYouTubeReviews('Aplikasi Tes', {
      env: { YOUTUBE_API_KEY: 'palsu' },
      budgetMs: 4000,
      fetchImpl: async () => ok(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), 403),
    });
    assert.equal(youtube.status, 'error');
    assert.match(youtube.limits.issues[0].text, /daily API quota exhausted/);

    const reddit = await fetchRedditReviews('Aplikasi Tes', {
      env: { REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'secret' },
      budgetMs: 4000,
      fetchImpl: async url => (
        url.includes('/api/v1/access_token')
          ? ok(JSON.stringify({ access_token: 'token-palsu' }))
          : ok('{}', 429, { 'retry-after': '60' })
      ),
    });
    assert.equal(reddit.status, 'error');
    assert.match(reddit.limits.issues[0].text, /request limit reached/);
    assert.match(reddit.limits.issues[0].text, /r\/|global search/, 'kegagalan menyebutkan jalur yang dibaca');
  });

  test('kanal yang tidak dikenal ditolak sebelum ada permintaan jaringan', async () => {
    await assert.rejects(() => fetchApifyReviews('whatsapp', 'Aplikasi Tes', { env: { APIFY_TOKEN: 'x' }, budgetMs: 1000 }), /is not known to Apify/);
  });
});

describe('konsistensi katalog kanal', () => {
  test('setiap kanal punya label dan tidak ada duplikat', () => {
    assert.equal(new Set(CHANNEL_IDS).size, CHANNEL_IDS.length);
    for (const id of ['play', 'appstore', 'youtube', 'reddit', 'news', 'facebook', 'instagram', 'tiktok', 'x']) {
      assert.equal(CHANNEL_IDS.includes(id), true, `${id} harus terdaftar`);
    }
  });
});
