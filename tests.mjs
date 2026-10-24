import test from 'node:test';
import assert from 'node:assert/strict';
import { seedReviews, platforms } from './data.js';
import { summary, filterReviews, timeline, timelineMode, upsertReviews, classifyText, classifyReview, complaintStats, ratingSummary, exportCsv, groupStats, painGroups, validSource } from './model.js';
import { createDashboardServer, deploymentConfig } from './server.mjs';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, request as httpRequest } from 'node:http';
import { parseGoogleListing, parseGoogleReviews, parseApplePage, parseAppleRss, parsePlayInstalls, collectGoogle, collectApple, youtubeConfiguration, collectYouTube, apifyConfiguration, collectApify, apifyChannels, placesConfiguration, collectGooglePlaces } from './collectors.mjs';
import { loadLocalEnv } from './local-env.mjs';

const sample = { id:'unit-test-only', platform:'play', author:'Test fixture', date:'2026-10-23', text:'Login gagal dan loading lama', rating:null, sourceUrl:'https://play.google.com/store/apps/details?id=id.bni.wfb' };
test('baseline totals include both stores and preserve neutral denominator', () => {
  const s=summary(seedReviews);
  assert.equal(s.total,64);assert.equal(s.positive,41);assert.equal(s.negative,22);assert.equal(s.neutral,1);
  assert.ok(Math.abs(s.nss-29.6875)<0.000001);
});
test('Google Play baseline covers both published review pools',()=>{
  const s=summary(filterReviews(seedReviews,{platform:'play'}));
  assert.equal(s.total,55);assert.equal(s.positive,32);assert.equal(s.negative,22);assert.equal(s.neutral,1);
});
test('App Store written sample is nine, not fifteen ratings',()=>{
  const s=summary(filterReviews(seedReviews,{platform:'appstore'}));assert.equal(s.total,9);assert.equal(s.positive,9);
});
test('missing platform is unavailable, not neutral or 0 percent',()=>{
  const s=summary(filterReviews(seedReviews,{platform:'tiktok'}));assert.equal(s.total,0);assert.equal(s.neutral,0);assert.equal(s.nss,null);assert.equal(s.positivePct,null);
});
test('date, sentiment, and search filters compose',()=>{
  const rows=filterReviews(seedReviews,{from:'2026-10-01',to:'2026-10-31',sentiment:'negative',query:'gagal'});
  assert.equal(rows.length,1);assert.equal(rows[0].author,'Bos AteQ');
});
test('high star ratings do not override text sentiment',()=>{
  assert.equal(seedReviews.find(r=>r.author==='Tanamo').sentiment,'negative');
  assert.equal(seedReviews.find(r=>r.author==='Andry Teguh Aryanto').sentiment,'negative');
});
test('driver counts deduplicate multiple tags within a group',()=>{
  const groups=Object.fromEntries(groupStats(seedReviews,painGroups,'negative').map(g=>[g.name,g.total]));
  assert.equal(groups['Pendaftaran belum tuntas'],8);assert.equal(groups['Notifikasi & pembaruan laporan'],6);
  assert.equal(groups['Transaksi dan penerimaan pembayaran'],3);assert.equal(groups['Akses & performa aplikasi'],5);
});
test('weekly and monthly chart bins preserve all review totals',()=>{
  for(const mode of ['week','month']){const bins=timeline(seedReviews,mode);assert.equal(bins.reduce((s,b)=>s+b.positive+b.negative+b.neutral,0),64);}
  assert.deepEqual(timeline([]),[]);
});
test('displayed timeline mode matches automatic aggregation beyond one year',()=>{
  const rows=[{date:'2024-01-01',sentiment:'positive'},{date:'2026-10-23',sentiment:'negative'},{date:null,sentiment:'neutral'}];
  assert.equal(timelineMode(rows,'week'),'month');
  assert.equal(timelineMode(seedReviews,'week'),'week');
  assert.equal(timelineMode(seedReviews,'month'),'month');
  assert.equal(timelineMode([],'week'),'week');
  const bins=timeline(rows,'week');
  assert.ok(bins.every(bin=>bin.date.endsWith('-01')));
  assert.equal(bins.reduce((sum,bin)=>sum+bin.positive+bin.negative+bin.neutral,0),2);
});
test('online text classification is explicit and never falls back to stars',()=>{
  assert.equal(classifyText(sample.text).sentiment,'negative');
  assert.equal(classifyText('aplikasinya bagus dan mudah digunakan').sentiment,'positive');
  assert.equal(classifyText('3 bintang dulu').sentiment,'neutral');
  assert.equal(classifyText('apa ini').sentiment,'unclassified');
  assert.equal(classifyText('tidak bagus').sentiment,'negative');
  assert.equal(classifyText('tidak ada masalah').sentiment,'positive');
  assert.equal(classifyText('bagus tapi login gagal').sentiment,'negative');
});
test('unknown labels and missing dates are not converted to neutral or current dates',()=>{
  const result=upsertReviews([],[{...sample,date:null,author:'N/A',text:'apa ini',rating:5}],'2026-10-23');
  const r=result.reviews[0];assert.equal(r.date,null);assert.equal(r.author,'N/A');assert.equal(r.sentiment,'unclassified');
  const s=summary(result.reviews);assert.equal(s.total,1);assert.equal(s.classified,0);assert.equal(s.neutral,0);assert.equal(s.nss,null);
  assert.deepEqual(timeline(result.reviews),[]);assert.equal(filterReviews(result.reviews,{from:'2026-10-01'}).length,0);
});
test('negative feature chart ranks complaints with exact evidence and keeps zero categories',()=>{
  const groups=complaintStats(seedReviews);assert.equal(groups[0].id,'onboarding');assert.equal(groups[0].total,8);
  assert.equal(groups.find(g=>g.id==='notifications').total,4);
  assert.equal(groups.find(g=>g.id==='migration').total,5);
  assert.equal(groups.find(g=>g.id==='login').total,4);
  assert.equal(groups.find(g=>g.id==='transactions').total,3);
  for(const g of groups)assert.equal(g.total,g.reviews.length);
  assert.equal(complaintStats(filterReviews(seedReviews,{platform:'appstore'})).every(g=>g.total===0),true);
  assert.equal(complaintStats([]).length,12);
});
test('sample star averages use only actual ratings',()=>{
  const s=ratingSummary(seedReviews);assert.equal(s.total,64);assert.ok(Math.abs(s.average-245/64)<1e-9);
  assert.deepEqual(s.distribution.map(d=>d.count),[14,4,2,3,41]);assert.equal(ratingSummary([{rating:null}]).average,null);
});
test('sources use HTTPS and matching platform host',()=>{
  assert.equal(validSource('https://www.instagram.com/p/test/','instagram'),true);
  assert.equal(validSource('https://x.com@evil.invalid/','x'),false);
  assert.equal(validSource('http://x.com/test','x'),false);
});
test('incremental online refresh deduplicates IDs and retains manual labels',()=>{
  const r=seedReviews[0];const result=upsertReviews(seedReviews,[r,{...r,id:'other-id'}],'2026-10-23');
  assert.equal(result.added,0);assert.equal(result.unchanged,2);assert.equal(result.reviews.length,64);
  assert.equal(result.reviews[0].sentiment,'negative');assert.equal(result.reviews[0].labeling,'manual');
  assert.equal(upsertReviews(seedReviews,[sample,sample],'2026-10-23').added,1);
});
test('edited reviews update metrics and keep prior versions and absent records',()=>{
  const r=seedReviews[0], result=upsertReviews(seedReviews,[{...r,text:'bagus dan lancar',rating:4}],'2026-10-24');
  assert.equal(result.updated,1);assert.equal(result.reviews.length,64);
  const updated=result.reviews[0];assert.equal(updated.history.length,1);assert.equal(updated.history[0].text,r.text);
  assert.equal(updated.history[0].rating,5);assert.equal(updated.rating,4);assert.equal(updated.sentiment,'positive');assert.equal(updated.lastSeenAt,'2026-10-24');
  assert.equal(summary(result.reviews).negative,21);
  assert.equal(upsertReviews(result.reviews,[{...r,text:'bagus dan lancar',rating:4}],'2026-10-25').reviews[0].history.length,1);
});
test('different unknown authors are not merged on a missing metadata fingerprint',()=>{
  const r={...sample,author:'N/A',date:null};assert.equal(upsertReviews([],[r,{...r,id:'different'}],'2026-10-23').added,2);
});
test('CSV escapes quotes and neutralizes spreadsheet formulas',()=>{
  const csv=exportCsv([{...seedReviews[0],author:'=1+1',text:'hello, "world"\nnext'}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"hello, ""world""\nnext"'));
});
test('baseline review identifiers and sources are valid',()=>{
  assert.equal(new Set(seedReviews.map(r=>r.platform+'|'+r.id)).size,64);
  for(const r of seedReviews){assert.ok(validSource(r.sourceUrl,r.platform));assert.ok(r.rationale);assert.ok(r.tags.length);}
});
test('online API preserves history across partial success, failure and restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wondr-api-test-')),storagePath=join(dir,'data.json');
  let mode='success',release;
  const collector=async()=>{
    if(mode==='wait')await new Promise(resolve=>{release=resolve;});
    return mode==='error' ? [{id:'play',status:'error',fetched:0,message:'Test network failure'},{id:'appstore',status:'error',fetched:0,message:'Test parse failure'}] : [{id:'play',status:'success',fetched:1,message:'Fixture only',reviews:[sample]},{id:'appstore',status:'error',fetched:0,message:'Test parse failure'}];
  };
  let server=await createDashboardServer({storagePath,collector,env:{}});
  const listen=async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const close=()=>new Promise(resolve=>server.close(resolve));
  try{
    let url=await listen();
    assert.equal((await (await fetch(url+'/api/data')).json()).reviews.length,64);
    assert.equal((await fetch(url+'/api/analyze',{method:'POST',headers:{Origin:'https://invalid.example'}})).status,403);
    const first=await (await fetch(url+'/api/analyze',{method:'POST'})).json();
    assert.equal(first.reviews.length,65);assert.equal(first.lastRun.added,1);assert.equal(first.lastRun.status,'partial');
    assert.equal(first.sources.find(s=>s.id==='facebook').status,'needs_setup');assert.equal(first.sources.find(s=>s.id==='appstore').status,'error');
    assert.equal(first.sources.find(s=>s.id==='forum').status,'unsupported');
    assert.match(first.sources.find(s=>s.id==='facebook').message,/APIFY_API_TOKEN/);
    const repeat=await (await fetch(url+'/api/analyze',{method:'POST'})).json();assert.equal(repeat.lastRun.added,0);assert.equal(repeat.reviews.length,65);
    mode='error';const failed=await (await fetch(url+'/api/analyze',{method:'POST'})).json();
    assert.equal(failed.lastRun.status,'error');assert.equal(failed.reviews.length,65);
    mode='wait';const request=fetch(url+'/api/analyze',{method:'POST'});
    while(!release)await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await fetch(url+'/api/analyze',{method:'POST'})).status,409);
    assert.equal((await (await fetch(url+'/api/data')).json()).running,true);release();await request;
    assert.equal((await fetch(url+'/online-data.json')).status,404);
    assert.equal(JSON.parse(await readFile(storagePath,'utf8')).runs.length,4);
    await close();server=await createDashboardServer({storagePath,collector,env:{}});url=await listen();
    assert.equal((await (await fetch(url+'/api/data')).json()).reviews.length,65);
    const blocked=await new Promise((resolve,reject)=>get(url+'/api/data',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
    assert.equal(blocked,403);
  }finally{if(server.listening)await close();await rm(dir,{recursive:true,force:true});}
});
test('local Poppins fonts retain their license and use the explicit asset allowlist',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wondr-font-test-'));
  const server=await createDashboardServer({storagePath:join(dir,'data.json'),env:{}});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${server.address().port}`;
    for(const weight of [400,500,600,700]){
      const response=await fetch(`${url}/assets/fonts/poppins-latin-${weight}-normal.woff2`);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'font/woff2');
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'wOF2');
    }
    const license=await fetch(url+'/assets/fonts/Poppins-OFL.txt');
    assert.equal(license.status,200);
    assert.match(await license.text(),/SIL OPEN FONT LICENSE Version 1.1/);
    const head=await fetch(url+'/assets/fonts/poppins-latin-400-normal.woff2',{method:'HEAD'});
    assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await fetch(url+'/assets/fonts/unlisted.woff2')).status,404);
    assert.equal((await fetch(url+'/online-data.json')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
const rpcFixture = (reviews,cursor=null) => `)]}'\n\n${JSON.stringify([['wrb.fr','oCPfdb',JSON.stringify([reviews,cursor?[null,cursor]:null])]])}\n`;
const googleRow=['unit-test-only',['Fixture'],2,null,'Login gagal',[1792713600,0]];
const googleRowB=['pool-shared',['Fixture'],5,null,'Aplikasi bagus',[1792713600,0]];
const googleRowC=['pool-en-only',['Fixture'],5,null,'Fitur lengkap',[1792713600,0]];
const listingFixture=`<script type="application/ld+json">${JSON.stringify({'@type':'SoftwareApplication',url:sample.sourceUrl,aggregateRating:{ratingValue:3.9,ratingCount:73}})}</script>`;
test('Google parser distinguishes readable empty query from null RPC and changed structures',()=>{
  assert.equal(parseGoogleListing(listingFixture).ratingCount,73);
  assert.throws(()=>parseGoogleListing(listingFixture.replace('id.bni.wfb','id.bni.wondr')));
  const parsed=parseGoogleReviews(rpcFixture([googleRow],'next'));assert.equal(parsed.cursor,'next');assert.equal(parsed.reviews[0].rating,2);
  assert.deepEqual(parseGoogleReviews(rpcFixture([])).reviews,[]);
  assert.throws(()=>parseGoogleReviews(JSON.stringify([['wrb.fr','oCPfdb',null]])),/rpc_error/);
  assert.throws(()=>parseGoogleReviews('not a response'),/parse_error/);
  assert.throws(()=>parseGoogleReviews(rpcFixture([[...googleRow.slice(0,2),9,...googleRow.slice(3)]])));
});
test('Play install range is read only from the published listing block',()=>{
  assert.equal(parsePlayInstalls('<div class="wVqUob"><div class="ClM7O">10K+</div><div class="g1rdde">Downloads</div></div>'),'10K+');
  assert.equal(parsePlayInstalls('<div class="ClM7O">500K+</div><div class="g1rdde">Unduhan</div>'),'500K+');
  assert.equal(parsePlayInstalls(listingFixture),null);
});
test('Apple parser uses actual UTC records, not relative dates or duplicated nested shelves',()=>{
  const review={$kind:'Review',id:'fixture',reviewerName:'Fixture',contents:'Bagus',title:'Uji',date:'2026-09-22T08:30:52.000Z',dateText:'* null *',rating:5};
  const root={data:[{intent:{id:'6741567238',storefront:'id'},data:{shelfMapping:{allProductReviews:{items:[{review},{review}],url:null},productRatings:{items:[{productId:'6741567238',ratingAverage:4.7,totalNumberOfRatings:15}]}}}}]};
  const html=`<script id="serialized-server-data" type="application/json">${JSON.stringify(root)}</script>`;
  const parsed=parseApplePage(html);assert.equal(parsed.reviews.length,1);assert.equal(parsed.reviews[0].date,'2026-09-22');assert.equal(parsed.reviews[0].publishedAt,review.date);assert.equal(parsed.ratingCount,15);
  assert.throws(()=>parseApplePage('<html>Login required</html>'),/parse_error/);
  assert.throws(()=>parseApplePage(html.replaceAll('6741567238','1234')),/parse_error/);
});
test('pagination failure retains fetched records as explicitly partial',async()=>{
  let requests=0;
  const result=await collectGoogle(async url=>{
    if(String(url).includes('/store/apps/details'))return new Response(listingFixture);
    requests++;
    if(requests===1)return new Response(rpcFixture([googleRow],'next'));
    throw new Error('fixture disconnect');
  });
  assert.equal(result.status,'partial');assert.equal(result.fetched,1);assert.match(result.message,/network_error/);
  assert.match(result.message,/kumpulan bahasa Inggris/);
});
test('Google collector reads both review pools and merges them without double counting',async()=>{
  const requested=[];
  const result=await collectGoogle(async url=>{
    if(url.startsWith('https://play.google.com/store/apps/details'))return new Response(listingFixture);
    requested.push(new URL(url).searchParams.get('hl'));
    const hl=new URL(url).searchParams.get('hl');
    return new Response(rpcFixture(hl==='id'?[googleRow,googleRowB]:[googleRowB,googleRowC]));
  });
  assert.deepEqual(requested,['id','en']);
  assert.equal(result.status,'success');
  assert.equal(result.fetched,3);
  assert.deepEqual(result.reviews.map(r=>r.id).sort(),['pool-en-only','pool-shared','unit-test-only']);
  assert.match(result.message,/2 ulasan kumpulan bahasa Indonesia dan 1 ulasan kumpulan bahasa Inggris/);
  assert.match(result.message,/73 penilaian, sedangkan 3 muncul sebagai ulasan berteks|73 penilaian, sedangkan daftar ulasan publik menampilkan 3 ulasan berteks/);
  assert.doesNotMatch(result.message,/tidak menyertakan teks sehingga nama dan isinya tidak tersedia/);
  assert.equal(result.coverage.sampleLimit,null);
  assert.deepEqual(result.coverage.pools.map(p=>[p.hl,p.pagesRead,p.rows]),[['id',1,2],['en',1,2]]);
});
const googleCursorToken = body => JSON.parse(JSON.parse(new URLSearchParams(body).get('f.req'))[0][0][1])[1][2][2] ?? null;
test('Google pagination continues past the former ten-page cap without a sample limit',async()=>{
  const pages=[];
  const result=await collectGoogle(async(url,options)=>{
    if(String(url).startsWith('https://play.google.com/store/apps/details'))return new Response(listingFixture);
    const hl=new URL(url).searchParams.get('hl');
    const token=googleCursorToken(options.body);
    pages.push(`${hl}:${token ?? 'first'}`);
    if(hl!=='id')return new Response(rpcFixture([]));
    const index=token===null?0:Number(token.slice(5));
    const row=[`row-id-${index}`,['Fixture'],5,null,'Aplikasi bagus',[1792713600,0]];
    return index<13?new Response(rpcFixture([row],`page-${index+1}`)):new Response(rpcFixture([row]));
  });
  assert.equal(pages.filter(entry=>entry.startsWith('id:')).length,14,'halaman kumpulan Indonesia harus dibaca seluruhnya');
  assert.equal(result.coverage.pools.find(p=>p.hl==='id').pagesRead,14);
  assert.equal(result.coverage.pagesRead,15);
  assert.equal(result.fetched,14);
  assert.equal(result.status,'success');
  assert.match(result.message,/kolektor tidak memiliki batas jumlah sampel/);
});
test('A failing first review pool still lets the second pool be read',async()=>{
  const requested=[];
  const result=await collectGoogle(async url=>{
    if(String(url).startsWith('https://play.google.com/store/apps/details'))return new Response(listingFixture);
    const hl=new URL(url).searchParams.get('hl');
    requested.push(hl);
    if(hl==='id')throw new Error('fixture disconnect');
    return new Response(rpcFixture([googleRowB,googleRowC]));
  });
  assert.deepEqual(requested,['id','en'],'kumpulan kedua tidak boleh dibatalkan oleh kegagalan kumpulan pertama');
  assert.equal(result.status,'partial');
  assert.equal(result.fetched,2);
  assert.match(result.message,/kumpulan bahasa Indonesia: network_error/);
  assert.match(result.message,/2 ulasan kumpulan bahasa Inggris/);
});
const appleReviewFixture={$kind:'Review',id:'14696447164',reviewerName:'okerbk',title:'Fresh & helpful',contents:'Suka bgt sama appsnya',rating:5,date:'2026-10-22T09:02:33.000Z'};
const appleEntryFixture={id:{label:'14696447164'},author:{name:{label:'okerbk'}},title:{label:'Fresh & helpful'},content:{label:'Suka bgt sama appsnya'},'im:rating':{label:'5'},updated:{label:'2026-10-22T02:02:33-07:00'}};
const appleFeedOnlyFixture={id:{label:'14000000001'},author:{name:{label:'pengguna-lain'}},title:{label:'Lain'},content:{label:'Pencairan lambat'},'im:rating':{label:'2'},updated:{label:'2026-09-01T01:02:03-07:00'}};
const applePage=(rows,next=null)=>`<script id="serialized-server-data" type="application/json">${JSON.stringify({data:[{intent:{id:'6741567238',storefront:'id'},data:{shelfMapping:{allProductReviews:{items:rows,url:next},productRatings:{items:[{productId:'6741567238',ratingAverage:4.8,totalNumberOfRatings:17}]}}}}]})}</script>`;
const appleFeed=entries=>JSON.stringify({feed:{id:{label:'https://itunes.apple.com/id/rss/customerreviews'},entry:entries}});
test('Apple collector reads the public review page and the official customer-review feed together',async()=>{
  const requested=[];
  const result=await collectApple(async url=>{
    requested.push(String(url));
    if(url.startsWith('https://apps.apple.com'))return new Response(applePage([{review:appleReviewFixture}]));
    if(url.includes('page=1/'))return new Response(appleFeed([appleEntryFixture,appleFeedOnlyFixture]));
    if(url.includes('page=2/'))return new Response(appleFeed([]));
    throw new Error('unexpected '+url);
  });
  assert.equal(result.status,'success');
  assert.equal(result.fetched,2);
  assert.equal(result.coverage.shelfReviews,1);
  assert.equal(result.coverage.feedReviews,2);
  assert.equal(result.coverage.sharedReviews,1);
  assert.equal(result.coverage.feedOnly,1);
  assert.equal(result.coverage.sampleLimit,null);
  assert.deepEqual(result.reviews.map(r=>r.id).sort(),['apple-14000000001','apple-14696447164']);
  const feedOnly=result.reviews.find(r=>r.id==='apple-14000000001');
  assert.match(feedOnly.provenance,/hanya dikembalikan feed ulasan pelanggan publik Apple/);
  assert.equal(feedOnly.rating,2);
  assert.equal(feedOnly.date,'2026-09-01');
  assert.equal(result.reviews.find(r=>r.id==='apple-14696447164').publishedAt,'2026-10-22T09:02:33.000Z','jalur halaman tidak boleh ditimpa bentuk waktu jalur lain');
  assert.match(result.message,/dua jalur publik sekaligus/);
  assert.match(result.message,/17 penilaian, sedangkan 2 muncul sebagai ulasan berteks/);
  assert.ok(requested.some(url=>url.includes('itunes.apple.com/id/rss/customerreviews')));
});
test('Apple page failure keeps feed results and reports the run as partial',async()=>{
  const result=await collectApple(async url=>{
    if(url.startsWith('https://apps.apple.com'))throw new Error('fixture disconnect');
    if(url.includes('page=1/'))return new Response(appleFeed([appleFeedOnlyFixture]));
    if(url.includes('page=2/'))return new Response(appleFeed([]));
    throw new Error('unexpected '+url);
  });
  assert.equal(result.status,'partial');
  assert.equal(result.fetched,1);
  assert.match(result.message,/halaman ulasan: network_error/);
});
test('Apple continuation is followed only while it stays on this app public page',async()=>{
  const requested=[];
  const result=await collectApple(async url=>{
    requested.push(String(url));
    if(url.startsWith('https://apps.apple.com')){
      if(url.includes('page=two'))return new Response(applePage([{review:{...appleReviewFixture,id:'14696447165',contents:'Halaman kedua'}}]));
      return new Response(applePage([{review:appleReviewFixture}],'https://example.com/id/app/other/id6741567238?see-all=reviews'));
    }
    if(url.includes('page=1/'))return new Response(appleFeed([appleEntryFixture]));
    if(url.includes('page=2/'))return new Response(appleFeed([]));
    throw new Error('unexpected '+url);
  });
  assert.equal(result.status,'partial','tautan lanjutan yang ditolak tidak boleh dianggap selesai');
  assert.equal(requested.filter(url=>url.startsWith('https://apps.apple.com')).length,1,'host asing tidak boleh diambil');
  assert.ok(!requested.some(url=>url.includes('example.com')));
  assert.match(result.message,/continuation_error/);
  assert.equal(result.coverage.shelfReviews,1);
});
test('Apple continuation link is followed when it stays on the same public app page',async()=>{
  const result=await collectApple(async url=>{
    if(url.startsWith('https://apps.apple.com')){
      if(url.includes('page=two'))return new Response(applePage([{review:{...appleReviewFixture,id:'14696447165',contents:'Pencairan lambat'}}]));
      return new Response(applePage([{review:appleReviewFixture}],'/id/app/wondr-merchant-by-bni/id6741567238?see-all=reviews&page=two'));
    }
    if(url.includes('page=1/'))return new Response(appleFeed([appleEntryFixture]));
    if(url.includes('page=2/'))return new Response(appleFeed([]));
    throw new Error('unexpected '+url);
  });
  assert.equal(result.status,'success');
  assert.equal(result.coverage.shelfPages,2);
  assert.equal(result.fetched,2);
  assert.deepEqual(result.reviews.map(r=>r.id).sort(),['apple-14696447164','apple-14696447165']);
});
test('Apple feed parser rejects a changed structure instead of reporting zero reviews',()=>{
  assert.throws(()=>parseAppleRss('bukan json'),/parse_error/);
  assert.throws(()=>parseAppleRss(JSON.stringify({feed:{entry:[{id:{label:'1'},content:{label:5}}]}})),/parse_error/);
  assert.deepEqual(parseAppleRss(appleFeed([])).reviews,[]);
  assert.equal(parseAppleRss(appleFeed([appleEntryFixture])).reviews[0].id,'apple-14696447164');
});

// Synthetic API fixtures stay in memory or temporary storage; no collector may use live fetch.
const youtubeTestKey = 'test-only';
const youtubeId = n => `fixture${String(n).padStart(4,'0')}`;
const youtubeTime = '2026-10-23T08:30:52.123Z';
const youtubeVideo = (id = youtubeId(1), snippet = {}) => ({
  id, snippet: { title:'wondr merchant by BNI', description:'Unit-test video metadata', channelId:'fixture-owner', ...snippet },
});
const youtubeComment = (id, text = 'Wondr merchant saya gagal login.', snippet = {}) => ({
  id, snippet: { textDisplay:text, textOriginal:'Different original text; do not substitute', authorDisplayName:'Fixture viewer', authorChannelId:{value:'fixture-viewer'}, publishedAt:youtubeTime, updatedAt:youtubeTime, likeCount:123, ...snippet },
});
const youtubeThread = (comment, { videoId = youtubeId(1), replies = 0, preview = [] } = {}) => ({
  id:`thread-${comment.id}`, snippet:{videoId,totalReplyCount:replies,topLevelComment:comment}, replies:{comments:preview},
});
const youtubeSearchItem = id => ({id:{videoId:id},snippet:{title:'Unverified search title',description:'Not authoritative metadata'}});
const youtubeStep = (resource, params, items, nextPageToken) => ({
  resource, params, payload:{items,...(nextPageToken === undefined ? {} : {nextPageToken})},
});
const youtubeDefaults = {
  search:{part:'snippet',type:'video',q:'"wondr merchant"',maxResults:'50',order:'date'},
  videos:{part:'snippet'},
  commentThreads:{part:'snippet',maxResults:'100',textFormat:'plainText',order:'time'},
  comments:{part:'snippet',maxResults:'100',textFormat:'plainText'},
};
function youtubeMock(steps) {
  const calls = [], violations = [];
  return {
    fetcher:async (input, options) => {
      const step = steps[calls.length];
      calls.push(String(input));
      try {
        assert.ok(step, `Unexpected mock request: ${new URL(input).pathname}`);
        const url = new URL(input);
        assert.equal(url.origin,'https://www.googleapis.com');
        assert.equal(url.pathname,`/youtube/v3/${step.resource}`);
        assert.deepEqual(Object.fromEntries(url.searchParams),{...youtubeDefaults[step.resource],...step.params});
        assert.equal(url.searchParams.has('key'),false);
        assert.equal(url.href.includes(youtubeTestKey),false);
        assert.deepEqual([...new Headers(options.headers)],[['x-goog-api-key',youtubeTestKey]]);
        assert.equal(options.redirect,'error');
        assert.ok(options.signal instanceof AbortSignal);
      } catch (error) { violations.push(error); throw error; }
      if (step.error) throw step.error;
      return new Response(step.raw ?? JSON.stringify(step.payload),{status:step.status ?? 200});
    },
    done:() => {
      // Fetch assertions must survive the collector's intentional error handling.
      if (violations.length) throw violations[0];
      assert.equal(calls.length,steps.length,'Every scripted API page must be requested');
    },
  };
}
async function runYouTube(steps, videoIds = [youtubeId(1)]) {
  const mock = youtubeMock(steps);
  const config = youtubeConfiguration({YOUTUBE_API_KEY:youtubeTestKey,YOUTUBE_VIDEO_IDS:videoIds.join(',')});
  const result = await collectYouTube(mock.fetcher,config);
  mock.done();
  assert.equal(JSON.stringify(result).includes(youtubeTestKey),false,'API secrets must not reach collector output');
  return result;
}
const youtubeRecord = (id, text, extra = {}) => ({
  id, platform:'youtube', author:'Fixture viewer', date:'2026-10-23', publishedAt:youtubeTime, updatedAt:youtubeTime,
  text, rating:null, sourceUrl:`https://www.youtube.com/watch?v=${youtubeId(1)}&lc=${encodeURIComponent(id)}`,
  parentId:null, authorChannelId:'fixture-viewer', context:{videoId:youtubeId(1),title:'wondr merchant by BNI',description:'Fixture only',channelId:'fixture-owner',product:'wondr-merchant'},
  provenance:'Unit-test fixture only', ...extra,
});
const assertTimestamp = value => assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

test('YouTube configuration validates IDs and never fetches without usable configuration',async t => {
  const ready = youtubeConfiguration({YOUTUBE_API_KEY:` ${youtubeTestKey} `,YOUTUBE_VIDEO_IDS:`${youtubeId(1)}, ${youtubeId(2)}\n${youtubeId(1)}`});
  assert.equal(ready.status,'ready');
  assert.equal(ready.apiKey,youtubeTestKey);
  assert.deepEqual(ready.videoIds,[youtubeId(1),youtubeId(2)]);
  assert.equal(ready.message.includes(youtubeTestKey),false);
  const search = youtubeConfiguration({YOUTUBE_API_KEY:youtubeTestKey});
  assert.equal(search.status,'ready');assert.deepEqual(search.videoIds,[]);
  for (const [name,env] of [
    ['missing key',{}], ['blank key',{YOUTUBE_API_KEY:'  '}],
    ['missing key with IDs',{YOUTUBE_VIDEO_IDS:youtubeId(1)}],
    ['short ID',{YOUTUBE_API_KEY:youtubeTestKey,YOUTUBE_VIDEO_IDS:'short'}],
    ['video URL instead of ID',{YOUTUBE_API_KEY:youtubeTestKey,YOUTUBE_VIDEO_IDS:`https://youtube.com/watch?v=${youtubeId(1)}`}],
    ['mixed valid and invalid IDs',{YOUTUBE_API_KEY:youtubeTestKey,YOUTUBE_VIDEO_IDS:`${youtubeId(1)},invalid!`}],
  ]) await t.test(name,async () => {
    let requests = 0;
    const config = youtubeConfiguration(env);
    const result = await collectYouTube(async () => { requests++; throw new Error('No request permitted'); },config);
    assert.equal(config.status,'needs_setup');assert.equal(requests,0);
    assert.deepEqual(result,{id:'youtube',status:'needs_setup',fetched:null,message:config.message,reviews:[]});
    assert.equal(JSON.stringify(result).includes(youtubeTestKey),false);
  });
});

test('YouTube traverses every search page, twelve comment pages and actual paginated replies',async () => {
  const [first,second] = [youtubeId(1),youtubeId(2)];
  const steps = [
    youtubeStep('search',{},[youtubeSearchItem(first)],'search-2'),
    youtubeStep('search',{pageToken:'search-2'},[youtubeSearchItem(first),youtubeSearchItem(second)],'search-3'),
    youtubeStep('search',{pageToken:'search-3'},[]),
    youtubeStep('videos',{id:`${first},${second}`},[youtubeVideo(first),youtubeVideo(second)]),
  ];
  const expected = [];
  for (let page = 0; page < 12; page++) {
    const comment = youtubeComment(`top-${page}`);
    expected.push(comment.id);
    steps.push(youtubeStep('commentThreads',{videoId:first,...(page ? {pageToken:`thread-${page}`} : {})},[
      youtubeThread(comment,{replies:page === 0 ? 3 : 0,preview:page === 0 ? [youtubeComment('preview-only','Stale truncated preview')] : []}),
    ],page < 11 ? `thread-${page+1}` : undefined));
    if (page === 0) {
      const replies = ['reply-a','reply-b','reply-c'].map(id => youtubeComment(id,`Actual ${id}`,{parentId:comment.id}));
      expected.push(...replies.map(reply => reply.id));
      steps.push(youtubeStep('comments',{parentId:comment.id},replies.slice(0,1),'replies-2'));
      steps.push(youtubeStep('comments',{parentId:comment.id,pageToken:'replies-2'},replies));
    }
  }
  for (let page = 0; page < 2; page++) {
    const comment = youtubeComment(`second-${page}`);
    expected.push(comment.id);
    steps.push(youtubeStep('commentThreads',{videoId:second,...(page ? {pageToken:'second-page'} : {})},[youtubeThread(comment,{videoId:second})],page ? undefined : 'second-page'));
  }
  const result = await runYouTube(steps,[]);
  assert.equal(result.status,'success');assert.equal(result.fetched,17);
  assert.deepEqual(result.reviews.map(r => r.id).sort(),expected.sort());
  assert.equal(result.reviews.some(r => r.id === 'preview-only'),false);
  for (const reply of result.reviews.filter(r => r.parentId)) {
    assert.equal(reply.parentId,'top-0');assert.equal(reply.text,`Actual ${reply.id}`);
  }
  assert.deepEqual(result.scope,{mode:'search',query:'"wondr merchant"',discoveredVideos:2,relevantVideos:2,completedVideos:2,pagesRead:steps.length,paginationComplete:true});
  assert.deepEqual(result.issues,[]);
  assert.match(result.message,/bukan seluruh percakapan YouTube/);
});

test('YouTube resolves all discovered video metadata in batches beyond fifty IDs',async () => {
  const ids = Array.from({length:51},(_,i) => youtubeId(i+1));
  const steps = [
    youtubeStep('search',{},ids.slice(0,50).map(youtubeSearchItem),'next'),
    youtubeStep('search',{pageToken:'next'},[youtubeSearchItem(ids[0]),youtubeSearchItem(ids[50])]),
  ];
  for (const batch of [ids.slice(0,50),ids.slice(50)]) {
    steps.push(youtubeStep('videos',{id:batch.join(',')},batch.map(id => youtubeVideo(id))));
    for (const id of batch) steps.push(youtubeStep('commentThreads',{videoId:id},[]));
  }
  const result = await runYouTube(steps,[]);
  assert.equal(result.status,'success');assert.equal(result.fetched,0);
  assert.equal(result.scope.discoveredVideos,51);assert.equal(result.scope.relevantVideos,51);
  assert.equal(result.scope.completedVideos,51);assert.equal(result.scope.pagesRead,55);
  assert.equal(result.scope.paginationComplete,true);
});

test('YouTube preserves exact display text, missing metadata, timestamps and provenance without invented metrics',async () => {
  const rawText = '  wondr merchant\r\n\tbagus <b>literal</b> &amp; e\u0301\u00a0  ';
  const comments = [
    youtubeComment('raw /?&',rawText,{authorDisplayName:'  Original name  ',publishedAt:'2026-10-22T23:45:06.789-05:00',updatedAt:youtubeTime}),
    youtubeComment('missing-metadata','apa ini',{authorDisplayName:undefined,authorChannelId:undefined,publishedAt:undefined,updatedAt:undefined}),
    youtubeComment('blank-author','apa ini',{authorDisplayName:''}),
    youtubeComment('whitespace',' \n\t '),youtubeComment('empty-text',''),
  ];
  const before = Date.now();
  const result = await runYouTube([
    youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
    youtubeStep('commentThreads',{videoId:youtubeId(1)},comments.map(comment => youtubeThread(comment))),
  ]);
  const after = Date.now();
  assert.equal(result.status,'success');assert.equal(result.fetched,comments.length);
  for (let i = 0; i < comments.length; i++) {
    const record = result.reviews[i], original = comments[i].snippet;
    assert.equal(record.id,comments[i].id);assert.equal(record.text,original.textDisplay);
    assert.equal(record.author,original.authorDisplayName || 'N/A');
    assert.equal(record.rating,null);assert.equal(record.date,original.publishedAt?.slice(0,10) ?? null);
    assert.equal(record.publishedAt,original.publishedAt ?? null);assert.equal(record.updatedAt,original.updatedAt ?? null);
    assert.equal(record.authorChannelId,original.authorChannelId?.value ?? null);assert.equal(record.parentId,null);
    assertTimestamp(record.retrievedAt);assert.ok(Date.parse(record.retrievedAt) >= before && Date.parse(record.retrievedAt) <= after);
    assert.equal(validSource(record.sourceUrl,'youtube'),true);
    const source = new URL(record.sourceUrl);
    assert.equal(source.searchParams.get('v'),youtubeId(1));assert.equal(source.searchParams.get('lc'),record.id);
    assert.deepEqual(record.context,{videoId:youtubeId(1),...youtubeVideo().snippet,product:'wondr-merchant'});
    assert.match(record.provenance,/YouTube Data API v3/);assert.match(record.provenance,/textDisplay.*textFormat=plainText.*tanpa perubahan/);
    assert.equal(record.likeCount,undefined);assert.equal(record.sentiment,undefined);
  }
  for (const field of ['rating','ratingCount','installs','views']) assert.equal(result[field],undefined);
  assert.equal(ratingSummary(result.reviews).average,null);
  const retained = upsertReviews([],result.reviews,youtubeTime).reviews;
  assert.equal(retained.length,5);assert.equal(retained[1].date,null);
  assert.deepEqual(retained.slice(-2).map(r => [r.text,r.sentiment]),[[' \n\t ','unclassified'],['','unclassified']]);
});

test('YouTube deduplicates repeated IDs but retains different IDs with identical author, date and text',async () => {
  const first = youtubeComment('same-id'), second = {...first,id:'different-id'};
  const result = await runYouTube([
    youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
    youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(first)],'next'),
    youtubeStep('commentThreads',{videoId:youtubeId(1),pageToken:'next'},[youtubeThread(first),youtubeThread(second)]),
  ]);
  assert.equal(result.status,'success');assert.equal(result.fetched,2);
  assert.deepEqual(result.reviews.map(r => r.id),['same-id','different-id']);
  const stored = upsertReviews([],[...result.reviews,...result.reviews],youtubeTime);
  assert.equal(stored.added,2);assert.equal(stored.unchanged,2);assert.equal(stored.reviews.length,2);
});

test('YouTube relevance is established from video metadata rather than search snippets or comment keywords',async t => {
  for (const [name,snippet,relevant] of [
    ['merchant title',{title:'Panduan WONDR  MERCHANT by BNI'},true],
    ['merchant description',{title:'Tutorial',description:'Pengalaman wondr merchant'},true],
    ['exact Android ID',{title:'Tutorial',description:'https://play.google.com/store/apps/details?id=id.bni.wfb'},true],
    ['exact Apple ID',{title:'Tutorial',description:'https://apps.apple.com/id/app/app/id6741567238'},true],
    ['consumer app',{title:'wondr by BNI mobile banking'},false],
    ['similar merchant name',{title:'wondr merchants'},false],
    ['unrelated merchant',{title:'Tutorial merchant QRIS'},false],
  ]) await t.test(name,async () => {
    const search = {...youtubeSearchItem(youtubeId(1)),snippet:{title:relevant ? 'Unrelated search snippet' : 'wondr merchant'}};
    const steps = [youtubeStep('search',{},[search]),youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo(youtubeId(1),snippet)])];
    if (relevant) steps.push(youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(youtubeComment('metadata-comment'))]));
    const result = await runYouTube(steps,[]);
    assert.equal(result.status,'success');assert.equal(result.scope.discoveredVideos,1);
    assert.equal(result.scope.relevantVideos,Number(relevant));assert.equal(result.fetched,Number(relevant));
    assert.equal(result.scope.completedVideos,Number(relevant));
  });
});

test('YouTube does not accept a longer numeric identifier as the exact merchant Apple app identity',async () => {
  const result = await runYouTube([
    youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo(youtubeId(1),{title:'Unrelated app',description:'https://apps.apple.com/id/app/unrelated/id167415672389'})]),
  ]);
  assert.equal(result.status,'success');assert.equal(result.fetched,0);
  assert.equal(result.scope.relevantVideos,0);assert.deepEqual(result.reviews,[]);
});

const youtubeFailures = [
  {name:'network disconnect',message:/network_error/,change:step => ({...step,error:new Error(`Network failed with ${youtubeTestKey}`)})},
  {name:'quota exhausted',message:/api_error.*kuota/,change:step => ({...step,status:403,payload:{error:{message:`Do not expose ${youtubeTestKey}`,errors:[{reason:'quotaExceeded'}]}}})},
  {name:'malformed JSON',message:/parse_error/,change:step => ({...step,raw:'<html>not JSON</html>'})},
  {name:'invalid items',message:/parse_error/,change:step => ({...step,payload:{items:{not:'an array'}}})},
  {name:'invalid continuation token',message:/parse_error/,change:step => ({...step,payload:{items:[],nextPageToken:123}})},
  {name:'repeated continuation token',message:/berulang/,repeated:true,change:step => step},
];
for (const stage of ['search','commentThreads','comments']) {
  test(`YouTube ${stage} failures preserve earlier pages as partial instead of successful zero evidence`,async t => {
    for (const failure of youtubeFailures) await t.test(failure.name,async () => {
      const parent = youtubeComment('before-failure');
      const firstThread = youtubeThread(parent,{replies:stage === 'comments' ? 2 : 0});
      const steps = [];
      if (stage === 'search') {
        steps.push(youtubeStep('search',{},[youtubeSearchItem(youtubeId(1))],'again'));
        steps.push(failure.change(youtubeStep('search',{pageToken:'again'},[youtubeSearchItem(youtubeId(1))],'again')));
      }
      steps.push(youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]));
      steps.push(youtubeStep('commentThreads',{videoId:youtubeId(1)},[firstThread],stage === 'commentThreads' ? 'again' : undefined));
      const expected = [parent.id];
      if (stage === 'commentThreads') {
        steps.push(failure.change(youtubeStep('commentThreads',{videoId:youtubeId(1),pageToken:'again'},[youtubeThread(youtubeComment('on-repeated-page'))],'again')));
        if (failure.repeated) expected.push('on-repeated-page');
      }
      if (stage === 'comments') {
        steps.push(youtubeStep('comments',{parentId:parent.id},[youtubeComment('reply-before','Actual reply',{parentId:parent.id})],'again'));
        steps.push(failure.change(youtubeStep('comments',{parentId:parent.id,pageToken:'again'},[youtubeComment('reply-after','Another reply',{parentId:parent.id})],'again')));
        expected.push('reply-before');if (failure.repeated) expected.push('reply-after');
      }
      const result = await runYouTube(steps,stage === 'search' ? [] : [youtubeId(1)]);
      assert.equal(result.status,'partial');assert.equal(result.scope.paginationComplete,false);
      assert.equal(result.fetched,expected.length);assert.deepEqual(result.reviews.map(r => r.id),expected);
      assert.equal(result.reviews[0].text,parent.snippet.textDisplay);
      assert.ok(result.issues.some(issue => issue.stage === ({search:'search',commentThreads:'comments',comments:'replies'}[stage])));
      assert.match(result.message,failure.message);
      assert.equal(result.scope.completedVideos,stage === 'search' ? 1 : 0);
    });
  });
}

test('YouTube metadata failure in a later batch preserves previously collected comments',async () => {
  const ids = Array.from({length:51},(_,i) => youtubeId(i+1));
  const videos = ids.slice(0,50).map((id,i) => youtubeVideo(id,i ? {title:'Unrelated video'} : {}));
  const result = await runYouTube([
    youtubeStep('videos',{id:ids.slice(0,50).join(',')},videos),
    youtubeStep('commentThreads',{videoId:ids[0]},[youtubeThread(youtubeComment('before-metadata-error'))]),
    {...youtubeStep('videos',{id:ids[50]},[]),error:new Error('Fixture metadata failure')},
  ],ids);
  assert.equal(result.status,'partial');assert.equal(result.fetched,1);
  assert.equal(result.reviews[0].id,'before-metadata-error');assert.equal(result.scope.paginationComplete,false);
  assert.equal(result.issues[0].stage,'videos');assert.match(result.issues[0].message,/network_error/);
});

test('YouTube disabled comments do not erase earlier evidence or prevent later videos being read',async () => {
  const ids = [youtubeId(1),youtubeId(2),youtubeId(3)];
  const result = await runYouTube([
    youtubeStep('videos',{id:ids.join(',')},ids.map(id => youtubeVideo(id))),
    youtubeStep('commentThreads',{videoId:ids[0]},[youtubeThread(youtubeComment('before-disabled'))]),
    {...youtubeStep('commentThreads',{videoId:ids[1]},[]),status:403,payload:{error:{errors:[{reason:'commentsDisabled'}]}}},
    youtubeStep('commentThreads',{videoId:ids[2]},[youtubeThread(youtubeComment('after-disabled'),{videoId:ids[2]})]),
  ],ids);
  assert.equal(result.status,'partial');assert.equal(result.fetched,2);
  assert.deepEqual(result.reviews.map(r => r.id),['before-disabled','after-disabled']);
  assert.equal(result.scope.completedVideos,2);assert.equal(result.scope.paginationComplete,false);
  assert.equal(result.issues[0].videoId,ids[1]);assert.match(result.message,/dinonaktifkan.*bukan nol keluhan/);
});

test('YouTube distinguishes successful empty results, unavailable videos, disabled comments and initial errors',async t => {
  const metadata = () => youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]);
  for (const [name,steps,ids,status,completed] of [
    ['empty search',[youtubeStep('search',{},[])],[],'success',0],
    ['readable empty comments',[metadata(),youtubeStep('commentThreads',{videoId:youtubeId(1)},[])],[youtubeId(1)],'success',1],
    ['unavailable video',[youtubeStep('videos',{id:youtubeId(1)},[])],[youtubeId(1)],'partial',0],
    ['disabled comments',[metadata(),{...youtubeStep('commentThreads',{videoId:youtubeId(1)},[]),status:403,payload:{error:{errors:[{reason:'commentsDisabled'}]}}}],[youtubeId(1)],'partial',0],
    ['initial disconnect',[{...youtubeStep('search',{},[]),error:new Error('Fixture only')}],[],'error',0],
    ['initial invalid payload',[{...metadata(),raw:'not JSON'}],[youtubeId(1)],'error',0],
  ]) await t.test(name,async () => {
    const result = await runYouTube(steps,ids);
    assert.equal(result.status,status);assert.equal(result.fetched,0);assert.deepEqual(result.reviews,[]);
    assert.equal(result.scope.completedVideos,completed);assert.equal(result.scope.paginationComplete,status === 'success');
    assert.equal(result.issues.length > 0,status !== 'success');
  });
});

test('YouTube short reply results remain partial and never substitute the truncated thread preview',async () => {
  const parent = youtubeComment('parent');
  const result = await runYouTube([
    youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
    youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(parent,{replies:3,preview:[youtubeComment('preview-only')]})]),
    youtubeStep('comments',{parentId:parent.id},[youtubeComment('real-reply','Exact reply',{parentId:parent.id})]),
  ]);
  assert.equal(result.status,'partial');assert.equal(result.fetched,2);
  assert.deepEqual(result.reviews.map(r => r.id),['parent','real-reply']);
  assert.equal(result.scope.completedVideos,0);assert.equal(result.scope.paginationComplete,false);
  assert.equal(result.issues[0].stage,'replies');assert.equal(result.issues[0].parentId,parent.id);
  assert.match(result.message,/balasan terbaca lebih sedikit/);
});

test('YouTube malformed records preserve valid earlier records within the same page',async t => {
  for (const [name,invalid] of [
    ['missing textDisplay',youtubeThread(youtubeComment('bad','ignored',{textDisplay:undefined}))],
    ['invalid author',youtubeThread(youtubeComment('bad','ignored',{authorDisplayName:42}))],
    ['invalid timestamp',youtubeThread(youtubeComment('bad','ignored',{publishedAt:'2026-02-30T12:00:00Z'}))],
    ['missing ID',youtubeThread(youtubeComment(''))],
    ['wrong video',youtubeThread(youtubeComment('bad'),{videoId:youtubeId(2)})],
  ]) await t.test(name,async () => {
    const result = await runYouTube([
      youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
      youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(youtubeComment('valid-first')),invalid]),
    ]);
    assert.equal(result.status,'partial');assert.equal(result.fetched,1);
    assert.deepEqual(result.reviews.map(r => r.id),['valid-first']);assert.equal(result.scope.paginationComplete,false);
    assert.match(result.message,/parse_error/);
  });
  await t.test('reply with wrong parent',async () => {
    const result = await runYouTube([
      youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
      youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(youtubeComment('parent'),{replies:2})]),
      youtubeStep('comments',{parentId:'parent'},[youtubeComment('valid-reply','First',{parentId:'parent'}),youtubeComment('wrong-parent','Second',{parentId:'someone-else'})]),
    ]);
    assert.equal(result.status,'partial');assert.equal(result.fetched,2);
    assert.deepEqual(result.reviews.map(r => r.id),['parent','valid-reply']);assert.equal(result.issues[0].stage,'replies');
  });
});

test('YouTube redacts hostile API error messages and reasons instead of echoing credentials',async t => {
  for (const reason of ['keyInvalid','quotaExceeded',youtubeTestKey]) await t.test(reason,async () => {
    const result = await runYouTube([
      youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),
      youtubeStep('commentThreads',{videoId:youtubeId(1)},[youtubeThread(youtubeComment('keep-me'))],'next'),
      {...youtubeStep('commentThreads',{videoId:youtubeId(1),pageToken:'next'},[]),status:403,payload:{
        error:{message:`HOSTILE_ERROR https://example.invalid/?key=${youtubeTestKey}`,errors:[{reason,message:`HOSTILE_ERROR ${youtubeTestKey}`}],details:[{apiKey:youtubeTestKey}]},
      }},
    ]);
    assert.equal(result.status,'partial');assert.equal(result.fetched,1);
    assert.equal(JSON.stringify(result).includes('HOSTILE_ERROR'),false);
    assert.match(result.message,/api_error: HTTP 403/);
  });
});

test('YouTube relevance excludes video owners, direct promotions and consumer app comments',async t => {
  for (const [name,raw] of [
    ['owner top-level comment',youtubeRecord('owner-top','Wondr merchant bagus dan lancar.',{authorChannelId:'fixture-owner'})],
    ['owner reply',youtubeRecord('owner-reply','Wondr merchant login gagal.',{parentId:'customer',authorChannelId:'fixture-owner'})],
    ['promotional invitation',youtubeRecord('promo','  Yuk download wondr merchant, bagus dan lengkap!')],
    ['install invitation',youtubeRecord('install','Install wondr merchant, bagus untuk usaha!')],
    ['consumer product',youtubeRecord('consumer','wondr by BNI bagus dan lancar')],
    ['consumer mobile banking',youtubeRecord('banking','Mobile banking saya gagal login')],
    ['old consumer app',youtubeRecord('old-app','BNI Mobile saya gagal login')],
  ]) await t.test(name,() => {
    const original = structuredClone(raw), label = classifyReview(raw);
    assert.notEqual(classifyText(raw.text).sentiment,'unclassified','Fixture must challenge a keyword sentiment');
    assert.equal(label.sentiment,'unclassified');assert.deepEqual(label.tags,['general']);
    assert.equal(label.relevance.status,'excluded');assert.equal(label.relevance.method,'merchant-context-v1');
    assert.ok(label.relevance.reason);assert.match(label.rationale,/Tetap tersimpan/);
    assert.deepEqual(raw,original,'Classification must not alter raw evidence');
  });
});

test('YouTube uncertain comments remain unclassified despite positive video metadata or star ratings',async t => {
  for (const text of ['bagus videonya','Login gagal','apa ini','terima kasih atas informasinya',' \n\t ']) await t.test(JSON.stringify(text),() => {
    const raw = youtubeRecord('uncertain',text,{rating:5,context:{...youtubeRecord('context','').context,title:'Wondr merchant bagus dan lengkap',description:'QRIS sangat membantu usaha'}});
    const label = classifyReview(raw);
    assert.equal(label.sentiment,'unclassified');assert.equal(label.relevance.status,'uncertain');
    assert.deepEqual(label.tags,['general']);
  });
  const noContext = classifyReview(youtubeRecord('no-context','QRIS saya gagal',{context:{}}));
  assert.equal(noContext.sentiment,'unclassified');assert.equal(noContext.relevance.status,'uncertain');
});

test('YouTube merchant experiences classify from comment text, not from metadata, stars or reply position',async t => {
  for (const [text,sentiment,extra] of [
    ['Wondr merchant saya bagus dan mudah digunakan.','positive',{rating:1}],
    ['Wondr merchant saya gagal login.','negative',{rating:5}],
    ['QRIS di toko saya gagal menerima pembayaran.','negative',{parentId:'another-customer'}],
    ['Settlement usaha saya lancar.','positive',{}],
    ['id.bni.wfb saya gagal login.','negative',{context:{}}],
    ['wondr merchant','unclassified',{}],
  ]) await t.test(text,() => {
    const label = classifyReview(youtubeRecord('customer',text,extra));
    assert.equal(label.relevance.status,'relevant');assert.equal(label.sentiment,sentiment);
    assert.equal(label.labeling,'rules-v1');
  });
  for (const platform of ['play','appstore']) {
    const raw = {...sample,platform};
    assert.deepEqual(classifyReview(raw),classifyText(raw.text));
  }
});

test('YouTube questions and hypothetical problems are not asserted customer sentiments',async t => {
  for (const text of [
    'Apakah wondr merchant bagus?',
    'Kalau wondr merchant gagal login, apa yang harus saya lakukan?',
    'Saya belum mencoba wondr merchant; apakah aplikasinya lancar?',
  ]) await t.test(text,() => {
    assert.equal(classifyReview(youtubeRecord('question',text)).sentiment,'unclassified');
  });
});

test('YouTube promotions remain excluded when the invitation is not the first word',async t => {
  for (const text of [
    'Wondr merchant bagus! Download sekarang dan dapatkan cashback.',
    'Info promo: unduh wondr merchant, fiturnya lengkap!',
  ]) await t.test(text,() => {
    const label = classifyReview(youtubeRecord('promotion',text));
    assert.equal(label.sentiment,'unclassified');assert.equal(label.relevance.status,'excluded');
  });
});

test('YouTube an incidental merchant mention does not turn a consumer app complaint into merchant sentiment',() => {
  const text = 'Video ini tentang wondr merchant, tetapi keluhan saya: wondr by BNI mobile banking gagal login.';
  const label = classifyReview(youtubeRecord('consumer-comparison',text));
  assert.equal(label.sentiment,'unclassified');assert.equal(label.relevance.status,'excluded');
});

test('YouTube retains excluded and uncertain records without inflating sentiment or rating denominators',() => {
  const raw = [
    youtubeRecord('positive','Wondr merchant saya bagus.'),
    youtubeRecord('negative','Wondr merchant saya gagal login.'),
    youtubeRecord('owner','Wondr merchant bagus.',{authorChannelId:'fixture-owner'}),
    youtubeRecord('promotion','Yuk download wondr merchant, bagus!'),
    youtubeRecord('consumer','Wondr by BNI gagal login.'),
    youtubeRecord('uncertain','bagus videonya'),youtubeRecord('blank',' \n '),
  ];
  const stored = upsertReviews([],raw,youtubeTime);
  assert.equal(stored.added,raw.length);assert.deepEqual(stored.reviews.map(r => r.text),raw.map(r => r.text));
  const totals = summary(stored.reviews);
  assert.equal(totals.total,7);assert.equal(totals.unclassified,5);assert.equal(totals.classified,2);
  assert.equal(totals.positive,1);assert.equal(totals.negative,1);assert.equal(totals.neutral,0);
  assert.equal(totals.positivePct,50);assert.equal(totals.negativePct,50);assert.equal(totals.nss,0);
  const unknowns = summary(stored.reviews.slice(2));
  assert.equal(unknowns.total,5);assert.equal(unknowns.classified,0);assert.equal(unknowns.nss,null);assert.equal(unknowns.positivePct,null);
  assert.deepEqual(ratingSummary(stored.reviews),{total:0,average:null,distribution:[1,2,3,4,5].map(stars => ({stars,count:0}))});
  assert.equal(filterReviews(stored.reviews,{sentiment:'unclassified'}).length,5);
  assert.equal(timeline(stored.reviews).reduce((sum,bin) => sum+bin.unclassified,0),5);
});

test('Social upserts use platform plus ID, never the same author, day and text fingerprint',() => {
  const incoming = ['youtube','x','instagram','tiktok'].flatMap(platform => ['shared-id','second-id'].map(id => ({...youtubeRecord(id,'Wondr merchant saya bagus.'),platform})));
  const first = upsertReviews([],incoming,youtubeTime);
  assert.equal(first.added,8);assert.equal(first.reviews.length,8);
  assert.equal(new Set(first.reviews.map(r => `${r.platform}|${r.id}`)).size,8);
  const second = upsertReviews(first.reviews,incoming,'2026-10-24T09:00:00.456Z');
  assert.equal(second.added,0);assert.equal(second.updated,0);assert.equal(second.unchanged,8);
  assert.ok(second.reviews.every(r => r.history.length === 0 && r.firstSeenAt === youtubeTime));
});

test('YouTube updates retain earlier text, full timestamps, provenance and absent records',() => {
  const before = youtubeRecord('edited','  Wondr merchant saya gagal login.\n',{retrievedAt:youtubeTime});
  const absent = youtubeRecord('absent','bagus videonya');
  const initial = upsertReviews([],[before,absent],youtubeTime);
  const observedAt = '2026-10-24T09:10:11.456Z';
  const after = {...before,text:'Wondr merchant saya lancar.',updatedAt:observedAt,retrievedAt:observedAt};
  const next = upsertReviews(initial.reviews,[after],observedAt);
  assert.equal(next.updated,1);assert.equal(next.added,0);assert.equal(next.reviews.length,2);
  const updated = next.reviews[0];
  assert.equal(updated.sentiment,'positive');assert.equal(updated.text,after.text);
  assert.equal(updated.publishedAt,before.publishedAt);assert.equal(updated.updatedAt,observedAt);
  assert.equal(updated.firstSeenAt,youtubeTime);assert.equal(updated.observedAt,observedAt);assert.equal(updated.lastSeenAt,observedAt);
  const {history:ignored,...original} = initial.reviews[0];
  assert.deepEqual(updated.history,[original]);assert.deepEqual(next.reviews[1],initial.reviews[1]);
  assert.equal(initial.reviews[0].text,before.text);assert.deepEqual(initial.reviews[0].history,[]);
  const repeated = upsertReviews(next.reviews,[after],'2026-10-24T10:11:12.789Z');
  assert.equal(repeated.updated,0);assert.equal(repeated.unchanged,1);assert.deepEqual(repeated.reviews[0].history,[original]);
  const ownerMetadata = upsertReviews(next.reviews,[{...after,authorChannelId:'fixture-owner'}],observedAt);
  assert.equal(ownerMetadata.updated,1);assert.equal(ownerMetadata.reviews[0].history.length,2);
  assert.equal(ownerMetadata.reviews[0].history[1].authorChannelId,'fixture-viewer');
  assert.equal(ownerMetadata.reviews[0].sentiment,'unclassified');assert.equal(ownerMetadata.reviews[0].relevance.status,'excluded');
});

async function withIsolatedYouTubeServer(collector, check) {
  const dir = await mkdtemp(join(tmpdir(),'wondr-youtube-test-'));
  const storagePath = join(dir,'data.json');
  let server;
  const close = async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); };
  const start = async () => {
    server = await createDashboardServer({storagePath,collector,env:{}});
    await new Promise((resolve,reject) => { server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  };
  try {
    await start();
    await check({
      storagePath,
      request:async (method = 'GET') => {
        const url = `http://127.0.0.1:${server.address().port}/api/${method === 'POST' ? 'analyze' : 'data'}`;
        const response = await fetch(url,{method});
        assert.equal(response.status,200);
        const body = await response.text();
        assert.equal(body.includes(youtubeTestKey),false);assert.equal(body.includes('HOSTILE_ERROR'),false);
        return JSON.parse(body);
      },
      restart:async () => { await close();await start(); },
    });
  } finally { await close();await rm(dir,{recursive:true,force:true}); }
}
const successfulFixtureStores = () => ['play','appstore'].map(id => ({id,status:'success',fetched:0,reviews:[],message:'Isolated readable empty store fixture'}));

test('Server marks two successful stores as partial full-channel coverage, not all-source success',async () => {
  await withIsolatedYouTubeServer(async () => successfulFixtureStores(),async ({request,storagePath}) => {
    const result = await request('POST');
    assert.equal(result.lastRun.status,'partial');assert.equal(result.sources.length,platforms.length);
    assert.deepEqual(result.lastRun.coverage.fetchedSources,['play','appstore']);
    assert.deepEqual(result.lastRun.coverage.unavailableSources,platforms.filter(p => !['play','appstore'].includes(p.id)).map(p => p.id));
    for (const source of result.sources) {
      if (['play','appstore'].includes(source.id)) assert.equal(source.status,'success');
      else { assert.notEqual(source.status,'success');assert.equal(source.fetched,null); }
    }
    assertTimestamp(result.lastRun.startedAt);assertTimestamp(result.lastRun.finishedAt);
    assert.equal(result.reviews.length,seedReviews.length);
    const saved = JSON.parse(await readFile(storagePath,'utf8'));
    assert.deepEqual(saved.lastRun,result.lastRun);assert.equal(saved.runs.length,1);
  });
});

test('Server persists mocked YouTube updates and raw evidence through partial failures, missing credentials and restart',async () => {
  let mode = 'initial';
  const collector = async () => {
    let youtube;
    if (mode === 'missing') {
      const mock = youtubeMock([]);
      youtube = await collectYouTube(mock.fetcher,youtubeConfiguration({}));
      mock.done();
    } else if (mode === 'error') {
      youtube = await runYouTube([{...youtubeStep('videos',{id:youtubeId(1)},[]),error:new Error(`HOSTILE_ERROR ${youtubeTestKey}`)}]);
    } else {
      const first = youtubeComment('persisted',mode === 'initial' ? '  Wondr merchant saya gagal login.\n' : 'Wondr merchant saya lancar.',{updatedAt:mode === 'initial' ? youtubeTime : '2026-10-24T06:00:00.123Z'});
      const items = [youtubeThread(first)];
      if (mode === 'initial') items.push(youtubeThread(youtubeComment('absent-on-refresh',' \n\t ')),youtubeThread(youtubeComment('owner','Wondr merchant bagus.',{authorChannelId:{value:'fixture-owner'}})));
      const steps = [youtubeStep('videos',{id:youtubeId(1)},[youtubeVideo()]),youtubeStep('commentThreads',{videoId:youtubeId(1)},items,mode === 'update' ? 'blocked' : undefined)];
      if (mode === 'update') steps.push({...youtubeStep('commentThreads',{videoId:youtubeId(1),pageToken:'blocked'},[]),status:403,payload:{error:{message:`HOSTILE_ERROR ${youtubeTestKey}`,errors:[{reason:'quotaExceeded'}]}}});
      youtube = await runYouTube(steps);
    }
    return [...successfulFixtureStores(),youtube];
  };
  await withIsolatedYouTubeServer(collector,async ({request,restart,storagePath}) => {
    const initial = await request('POST'), first = initial.reviews.find(r => r.id === 'persisted');
    assert.equal(initial.lastRun.status,'partial');assert.equal(initial.lastRun.added,3);
    assert.equal(initial.reviews.length,seedReviews.length+3);
    assert.equal(initial.sources.find(s => s.id === 'youtube').status,'success');
    assert.deepEqual(initial.lastRun.coverage.fetchedSources,['play','appstore','youtube']);
    assert.equal(first.sentiment,'negative');assert.equal(first.observedAt,initial.lastRun.finishedAt);
    assertTimestamp(first.observedAt);assertTimestamp(first.firstSeenAt);assertTimestamp(first.lastSeenAt);assertTimestamp(first.retrievedAt);
    const owner = initial.reviews.find(r => r.id === 'owner');
    assert.equal(owner.sentiment,'unclassified');assert.equal(owner.relevance.status,'excluded');
    assert.equal(initial.reviews.find(r => r.id === 'absent-on-refresh').text,' \n\t ');
    mode = 'update';
    const update = await request('POST'), changed = update.reviews.find(r => r.id === 'persisted');
    assert.equal(update.lastRun.status,'partial');assert.equal(update.lastRun.updated,1);assert.equal(update.lastRun.added,0);
    assert.equal(update.reviews.length,initial.reviews.length);assert.equal(changed.sentiment,'positive');
    assert.equal(changed.observedAt,update.lastRun.finishedAt);assertTimestamp(changed.observedAt);
    assert.equal(changed.firstSeenAt,first.firstSeenAt);assert.equal(changed.history.length,1);
    const {history:ignored,...original} = first;
    assert.deepEqual(changed.history[0],original);
    assert.deepEqual(update.reviews.find(r => r.id === 'owner'),owner);
    const lastSuccessAt = update.sources.find(s => s.id === 'youtube').lastSuccessAt;
    assert.equal(lastSuccessAt,update.lastRun.finishedAt);
    assert.equal(update.sources.find(s => s.id === 'youtube').status,'partial');
    for (const nextMode of ['error','missing']) {
      mode = nextMode;
      const failed = await request('POST'), source = failed.sources.find(s => s.id === 'youtube');
      assert.equal(failed.lastRun.status,'partial');assert.deepEqual(failed.reviews,update.reviews);
      assert.equal(failed.lastRun.added,0);assert.equal(failed.lastRun.updated,0);
      assert.equal(source.status,nextMode === 'missing' ? 'needs_setup' : 'error');
      assert.equal(source.fetched,nextMode === 'missing' ? null : 0);
      assert.equal(source.lastSuccessAt,lastSuccessAt);assert.equal(source.checkedAt,failed.lastRun.finishedAt);
      assert.deepEqual(failed.lastRun.coverage.fetchedSources,['play','appstore']);
      assert.ok(failed.lastRun.coverage.unavailableSources.includes('youtube'));
    }
    const savedText = await readFile(storagePath,'utf8'), saved = JSON.parse(savedText);
    assert.equal(savedText.includes(youtubeTestKey),false);assert.equal(savedText.includes('HOSTILE_ERROR'),false);
    assert.equal(saved.runs.length,4);assert.deepEqual(saved.reviews,update.reviews);
    assert.equal(saved.sources.find(s => s.id === 'youtube').fetched,null);
    await restart();
    const restarted = await request();
    assert.deepEqual(restarted.reviews,update.reviews);assert.deepEqual(restarted.lastRun,saved.lastRun);
    assert.equal(restarted.runs.length,4);assert.equal(restarted.running,false);
  });
});

// --- Konektor Apify: selalu memakai fetcher tiruan; tidak ada panggilan nyata dan tidak ada kunci asli. ---
const apifyToken = 'apify-fixture-token-jangan-dicatat';
const apifyConfig = (env = { APIFY_API_TOKEN: apifyToken }) => apifyConfiguration(env);
const apifyJson = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const apifyRun = (id = 'run-1', extra = {}) => ({ id, status: 'RUNNING', defaultDatasetId: `dataset-${id}`, ...extra });
function apifyRoutes(routes) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const key = `${options.method ?? 'GET'} ${parsed.pathname}`;
    calls.push({ key, url: String(url), options });
    for (const [pattern, respond] of routes) if (pattern.test(key)) return respond(calls.length, options);
    throw new Error('permintaan tak terduga: ' + key);
  };
  return { calls, fetcher };
}
const socialRoutes = items => apifyRoutes([
  [/POST \/v2\/acts\/.+\/runs$/, () => apifyJson({ data: apifyRun() })],
  [/GET \/v2\/actor-runs\/run-1$/, () => apifyJson({ data: { status: 'SUCCEEDED' } })],
  [/GET \/v2\/datasets\/dataset-run-1\/items$/, n => apifyJson(n === 3 ? items : [])],
]);

test('Apify connector sends no request until a token exists on the server', async () => {
  const config = apifyConfig({});
  assert.equal(config.status, 'needs_setup');
  for (const id of Object.keys(apifyChannels)) {
    const { calls, fetcher } = apifyRoutes([[/./, () => { throw new Error('Apify tidak boleh dipanggil'); }]]);
    const result = await collectApify(id, fetcher, config, { pollMs: 0 });
    assert.equal(result.status, 'needs_setup', id);
    assert.equal(result.fetched, null, id);
    assert.equal(result.reviews.length, 0, id);
    assert.equal(calls.length, 0, `${id} mengirim permintaan tanpa token`);
    assert.match(result.message, /APIFY_API_TOKEN/);
  }
});

test('Apify records keep actor text, expand nested comments, and never place the token in a URL', async () => {
  const items = [
    { id: 'post-1', text: 'wondr merchant saya gagal login lagi', date: '2026-10-20T04:05:06.000Z', url: 'https://x.com/u/status/1', author: { username: 'pelanggan_a' },
      comments: [
        { id: 'c-1', text: 'sama sih, QRIS-nya lama sekali', createdAt: '2026-10-20T05:00:00Z', user: { name: 'pelanggan_b' }, url: 'https://x.com/u/status/2' },
        { id: 'c-1', text: 'ID duplikat tidak boleh menambah baris' },
      ] },
    { id: 'post-2', caption: 'Ayo download wondr merchant sekarang ada cashback', time: 1792713600, permalink: 'https://x.com/brand/status/3', author: 'brandresmi' },
    { id: 'post-3', text: 'wondr merchant juga lambat di HP saya', date: 'bukan tanggal', url: 'http://x.com/tidak-aman/4' },
    { text: 'wondr merchant pencairan telat terus', author: 'tanpa_id' },
    { id: 'post-4' },
  ];
  const { calls, fetcher } = socialRoutes(items);
  const result = await collectApify('x', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'success');
  assert.equal(result.fetched, 5, 'item tanpa teks dibuang dan ID duplikat digabung');
  assert.equal(result.coverage.identityFiltered, 0, 'semua teks di sini menyebut identitas produk');
  assert.doesNotMatch(result.message, /teks lain dikembalikan actor/);
  assert.ok(calls.every(call => call.options?.headers?.authorization === `Bearer ${apifyToken}`), 'setiap permintaan memakai header Authorization');
  assert.ok(!calls.some(call => call.url.includes(apifyToken)), 'token tidak boleh muncul di URL');
  assert.ok(!result.message.includes(apifyToken), 'pesan tidak boleh memuat token');
  assert.equal(result.coverage.actor, 'apidojo/tweet-scraper');
  assert.equal(result.coverage.runId, 'run-1');
  assert.equal(result.coverage.itemsRead, 5);
  assert.equal(result.coverage.nestedRecords, 1);
  assert.equal(result.coverage.sampleLimit, null);
  const byId = new Map(result.reviews.map(r => [r.id, r]));
  assert.equal(byId.get('post-1').author, 'pelanggan_a');
  assert.equal(byId.get('post-1').date, '2026-10-20');
  assert.equal(byId.get('post-1').sourceUrl, 'https://x.com/u/status/1');
  assert.equal(byId.get('c-1').text, 'sama sih, QRIS-nya lama sekali', 'komentar duplikat ID memakai rekaman pertama');
  assert.equal(byId.get('c-1').parentId, 'post-1');
  assert.equal(byId.get('c-1').context.postId, 'post-1');
  assert.equal(byId.get('post-2').platform, 'x');
  assert.match(byId.get('post-2').date, /^\d{4}-\d{2}-\d{2}$/, 'waktu epoch actor diubah ke tanggal nyata');
  assert.equal(byId.get('post-3').date, null, 'tanggal yang tidak dapat dibaca dibiarkan kosong, tidak ditebak');
  assert.equal(byId.get('post-3').sourceUrl, null, 'tautan non-HTTPS ditolak');
  const synthesized = [...byId.values()].find(r => r.author === 'tanpa_id');
  assert.ok(synthesized, 'item tanpa ID sumber tetap disimpan sebagai teks nyata');
  assert.match(synthesized.id, /^x-[0-9a-f]{32}$/, 'identitas lokal dibuat dari hash teks');
  assert.match(synthesized.provenance, /hash lokal dari teks ini, bukan ID dari platform/);
  assert.equal(byId.get('post-1').provenance.includes('hash lokal'), false, 'item ber-ID sumber tidak diklaim ber-ID hash');
  assert.ok(!byId.has('post-4'));
  assert.match(byId.get('post-1').provenance, /apidojo\/tweet-scraper/);
  assert.match(byId.get('post-1').provenance, /run run-1/);
});

test('TikTok actor fields are read from the shapes the actor actually returns', async () => {
  const items = [{
    id: '7677293170949967124',
    text: 'wondr merchant settlement lama sekali',
    createTime: 1787509120,
    createTimeISO: '2026-08-23T18:18:40.000Z',
    authorMeta: { id: '7628449130579428373', name: 'goldie_sketchie', nickName: 'Goldie_Sketchie' },
    webVideoUrl: 'https://www.tiktok.com/@goldie_sketchie/video/7677293170949967124',
    commentCount: 12,
  }];
  const { fetcher } = socialRoutes(items);
  const result = await collectApify('tiktok', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'success');
  const record = result.reviews[0];
  assert.equal(record.id, '7677293170949967124', 'ID video actor dipakai apa adanya');
  assert.equal(record.author, 'goldie_sketchie', 'penulis diambil dari authorMeta.name, bukan dibiarkan N/A');
  assert.equal(record.date, '2026-08-23', 'createTimeISO dipakai sebagai waktu nyata item');
  assert.equal(record.sourceUrl, 'https://www.tiktok.com/@goldie_sketchie/video/7677293170949967124');
  assert.equal(record.rating, null, 'video tidak memiliki penilaian bintang, jadi tidak dibuat-buat');
  assert.equal(result.coverage.emptyResultMarkers, 0);
});

test('Loose social search results that name another product are filtered and counted', async () => {
  const items = [
    { id: 'v-1', text: 'Natalie Merchant - Wonder #nataliemerchant #90smusic', createTimeISO: '2026-04-12T10:00:00Z', authorMeta: { name: 'mojo11960' }, webVideoUrl: 'https://www.tiktok.com/@mojo11960/video/1' },
    { id: 'v-2', text: 'Wandering Merchant #palworld #twitch', createTimeISO: '2026-08-13T10:00:00Z', authorMeta: { name: 'luzerluna' }, webVideoUrl: 'https://www.tiktok.com/@luzerluna/video/2' },
    { id: 'v-3', text: 'wondr merchant notifikasi telat, QRIS juga lambat', createTimeISO: '2026-10-20T10:00:00Z', authorMeta: { name: 'pedagang_a' }, webVideoUrl: 'https://www.tiktok.com/@pedagang_a/video/3' },
  ];
  const { fetcher } = socialRoutes(items);
  const result = await collectApify('tiktok', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'success');
  assert.equal(result.fetched, 1, 'hanya teks yang menyebut identitas produk yang disimpan');
  assert.equal(result.coverage.itemsRead, 3);
  assert.equal(result.coverage.identityFiltered, 2);
  assert.equal(result.reviews[0].id, 'v-3');
});

test('Actor markers that mean "query returned nothing" are reported as evidence, not as lost data', async () => {
  const items = [{ noResults: true }, { error: 'no_items', errorDescription: 'Empty or private data for provided input' }];
  const { fetcher } = socialRoutes(items);
  const result = await collectApify('instagram', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'success', 'kanal terhubung tetapi tidak ada konten: bukan kegagalan');
  assert.equal(result.fetched, 0);
  assert.equal(result.coverage.emptyResultMarkers, 2);
  assert.match(result.message, /2 penanda tidak ada hasil/);
  assert.match(result.message, /Empty or private data for provided input/);
});

test('TikTok and Instagram actor names and inputs match the actors that exist on Apify', () => {
  const config = apifyConfiguration({ APIFY_API_TOKEN: apifyToken });
  assert.equal(config.channels.tiktok.actor, 'clockworks/tiktok-scraper', 'apify/tiktok-scraper tidak ada di Apify (HTTP 404)');
  assert.equal(config.channels.instagram.actor, 'apify/instagram-scraper');
  assert.deepEqual(config.channels.instagram.input, { type: 'hashtag', keywords: ['wondrmerchant', 'wondrmerchantbni'], resultsLimit: 100 });
  assert.deepEqual(config.channels.tiktok.input, { searchQueries: ['"wondr merchant"'], resultsPerPage: 100 }, 'kueri diberi tanda kutip agar hasil benar-benar menyebut produk');
  assert.equal(Object.hasOwn(config.channels, 'googlemaps'), false, 'Google Reviews memakai Places API resmi, bukan actor pihak ketiga');
});

test('Apify dataset is read through every page instead of stopping at the first', async () => {
  const page1 = Array.from({ length: 2 }, (_, i) => ({ id: `p1-${i}`, text: `wondr merchant ulasan ${i}` }));
  const page2 = [{ id: 'p2-0', text: 'wondr merchant ulasan terakhir' }];
  const { calls, fetcher } = apifyRoutes([
    [/POST \/v2\/acts/, () => apifyJson({ data: apifyRun('run-2') })],
    [/GET \/v2\/actor-runs\/run-2$/, () => apifyJson({ data: { status: 'SUCCEEDED' } })],
    [/GET \/v2\/datasets\/dataset-run-2\/items$/, n => apifyJson(n === 3 ? page1 : page2)],
  ]);
  const result = await collectApify('instagram', fetcher, apifyConfig(), { pollMs: 0, pageLimit: 2 });
  assert.equal(result.status, 'success');
  assert.equal(result.fetched, 3);
  const itemCalls = calls.filter(call => call.key.includes('/items'));
  assert.equal(itemCalls.length, 2);
  assert.match(itemCalls.at(-1).url, /offset=2&limit=2/);
});

test('Apify credential and quota failures are reported without echoing the token', async () => {
  for (const [type, status, expected] of [
    ['invalid-api-key', 401, /token Apify ditolak/],
    ['payment-required', 402, /pembayaran atau batas kuota/],
    ['not-found', 404, /actor tidak ditemukan/],
    ['validation-error', 400, /input actor ditolak/],
  ]) {
    const { calls, fetcher } = apifyRoutes([[/POST \/v2\/acts/, () => new Response(JSON.stringify({ error: { type } }), { status, headers: { 'content-type': 'application/json' } })]]);
    const result = await collectApify('tiktok', fetcher, apifyConfig(), { pollMs: 0 });
    assert.equal(result.status, 'error', type);
    assert.equal(result.fetched, null, type);
    assert.equal(result.reviews.length, 0, type);
    assert.match(result.message, expected, type);
    assert.ok(!result.message.includes(apifyToken), `${type}: pesan memuat token`);
    assert.equal(calls.length, 1, type);
  }
});

test('A failed actor run keeps partial evidence instead of claiming success', async () => {
  const { fetcher } = apifyRoutes([
    [/POST \/v2\/acts/, () => apifyJson({ data: apifyRun('run-3') })],
    [/GET \/v2\/actor-runs\/run-3$/, () => apifyJson({ data: { status: 'FAILED' } })],
    [/GET \/v2\/datasets\/dataset-run-3\/items$/, n => apifyJson(n === 3 ? [{ id: 'x-9', text: 'wondr merchant notifikasi hilang' }] : [])],
  ]);
  const result = await collectApify('x', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'partial');
  assert.equal(result.fetched, 1);
  assert.match(result.message, /status FAILED/);
});

test('An empty actor dataset is an accessible empty result, not a failure', async () => {
  const { fetcher } = socialRoutes([]);
  const result = await collectApify('facebook', fetcher, apifyConfig(), { pollMs: 0 });
  assert.equal(result.status, 'success');
  assert.equal(result.fetched, 0);
  assert.match(result.message, /hasil kueri actor, bukan seluruh percakapan Facebook/);
});

test('Invalid Apify input override is rejected before any request', async () => {
  const config = apifyConfig({ APIFY_API_TOKEN: apifyToken, APIFY_INPUT_X: '{bukan json' });
  assert.match(config.channels.x.inputError, /APIFY_INPUT_X bukan JSON/);
  const { calls, fetcher } = apifyRoutes([[/./, () => { throw new Error('Apify tidak boleh dipanggil'); }]]);
  const result = await collectApify('x', fetcher, config, { pollMs: 0 });
  assert.equal(result.status, 'error');
  assert.equal(calls.length, 0);
});

test('Apify actor and input can be replaced per channel from the environment', () => {
  const config = apifyConfig({ APIFY_API_TOKEN: apifyToken, APIFY_ACTOR_INSTAGRAM: 'pelanggan/instagram-kustom', APIFY_INPUT_INSTAGRAM: '{"usernames":["wondrmerchant"]}' });
  assert.equal(config.channels.instagram.actor, 'pelanggan/instagram-kustom');
  assert.deepEqual(config.channels.instagram.input, { usernames: ['wondrmerchant'] });
  assert.equal(config.channels.instagram.inputError, null);
});

test('Apify social text is only scored when it names the merchant app', () => {
  const relevant = classifyReview({ platform: 'x', text: 'wondr merchant saya gagal login', author: 'a' });
  assert.equal(relevant.sentiment, 'negative');
  assert.equal(relevant.relevance.status, 'relevant');
  const vague = classifyReview({ platform: 'x', text: 'aplikasi bank ini lambat sekali', author: 'b' });
  assert.equal(vague.sentiment, 'unclassified');
  assert.equal(vague.relevance.status, 'uncertain');
  const consumer = classifyReview({ platform: 'instagram', text: 'wondr by BNI mobile banking saya error', author: 'c' });
  assert.equal(consumer.sentiment, 'unclassified');
  assert.equal(consumer.relevance.status, 'excluded');
  const maps = classifyReview({ platform: 'googlemaps', text: 'pelayanannya ramah', author: 'd' });
  assert.equal(maps.relevance.status, 'uncertain', 'ulasan tempat tanpa sebutan aplikasi tidak dinilai otomatis');
  const store = classifyReview({ platform: 'play', text: 'aplikasi ini lambat sekali', author: 'e' });
  assert.equal(store.relevance, undefined, 'ulasan toko tidak melewati penyaringan sosial');
});

test('Google Reviews links are accepted only from the Google Maps host', () => {
  assert.equal(validSource('https://www.google.com/maps/place/wondr+merchant/', 'googlemaps'), true);
  assert.equal(validSource('https://maps.app.goo.gl/abc', 'googlemaps'), false, 'pendek bukan host Google Maps yang diizinkan');
  assert.equal(validSource('http://google.com/maps/place/x', 'googlemaps'), false, 'non-HTTPS ditolak');
});

test('Google Places connector sends no request until a server key exists', async () => {
  const calls = [];
  const fetcher = (url, options) => { calls.push([url, options]); return Promise.reject(new Error('tidak boleh ada permintaan')); };
  const result = await collectGooglePlaces(fetcher, placesConfiguration({}));
  assert.equal(result.status, 'needs_setup');
  assert.equal(result.fetched, null);
  assert.equal(calls.length, 0, 'tanpa kunci, tidak ada permintaan dan tidak ada angka karangan');
  assert.doesNotMatch(result.message, /undefined/);
});

test('Google Places reads every page, keeps only product places, and reports missing review text honestly', async () => {
  const reply = value => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(value)) });
  const pages = [
    { places: [{ id: 'placeProduk', displayName: { text: 'Wondr Merchant by BNI' }, formattedAddress: 'Jakarta', rating: 4.5, userRatingCount: 30 }], nextPageToken: 'halaman-2' },
    { places: [{ id: 'placeKantor', displayName: { text: 'BNI Depok 1' }, formattedAddress: 'Depok' }] },
  ];
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, headers: options.headers ?? {}, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith(':searchText')) {
      const index = Math.min(calls.filter(call => call.url.endsWith(':searchText')).length - 1, pages.length - 1);
      return reply(pages[index]);
    }
    if (url.includes('/places/placeProduk')) return reply({ id: 'placeProduk', rating: 4.5, userRatingCount: 30 });
    return reply({});
  };
  const config = placesConfiguration({ GOOGLE_PLACES_API_KEY: 'kunci-places-tes', GOOGLE_PLACES_QUERIES: 'wondr merchant' });
  const result = await collectGooglePlaces(fetcher, config);
  assert.equal(calls.filter(call => call.url.endsWith(':searchText')).length, 2, 'token halaman berikutnya diikuti sampai habis');
  assert.equal(calls.some(call => call.url.includes('kunci-places-tes')), false, 'kunci tidak masuk URL');
  assert.equal(calls.every(call => call.headers['X-Goog-Api-Key'] === 'kunci-places-tes'), true);
  assert.equal(result.fetched, 0, 'API tidak mengembalikan teks ulasan, maka tidak ada ulasan yang dibuat-buat');
  assert.equal(result.coverage.placesFound, 2);
  assert.equal(result.coverage.productMatches, 1, 'hanya place bernama produk yang diperiksa ulasannya');
  assert.equal(result.coverage.reviewTextServed, false);
  assert.equal(result.rating, 4.5);
  assert.match(result.message, /tidak menyertakan satu pun teks ulasan/);
  assert.match(result.message, /BNI Depok 1|Wondr Merchant by BNI/);
});

test('Google Places accepts real review text when the API provides it', async () => {
  const fetcher = async () => ({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({
      places: [{ id: 'placeProduk', displayName: { text: 'Wondr Merchant by BNI' } }],
      reviews: [{ rating: 2, authorDisplayName: 'Pegawai', text: { text: 'Settlement terlambat' }, publishTime: '2026-10-01T03:04:05Z' }],
    })),
  });
  const result = await collectGooglePlaces(fetcher, placesConfiguration({ GOOGLE_PLACES_API_KEY: 'kunci-tes' }));
  assert.equal(result.fetched, 1);
  assert.equal(result.reviews[0].text, 'Settlement terlambat', 'teks disimpan apa adanya');
  assert.equal(result.reviews[0].date, '2026-10-01');
  assert.equal(result.reviews[0].platform, 'googlemaps');
  assert.match(result.reviews[0].sourceUrl, /^https:\/\/www\.google\.com\/maps\/place\//);
  assert.match(result.reviews[0].provenance, /hash lokal/);
});

test('Brand-owned social accounts are kept as context but never counted as customer sentiment', () => {
  const promo = classifyReview({ platform: 'tiktok', author: 'bni46', text: 'Baru ngerintis bisnis? Di wondr merchant, kamu bisa ajuin settlement maksimal 5x sehari. Customer udah bayar? Dana bisa lebih cepat diterima.' });
  assert.equal(promo.relevance.status, 'excluded', 'konten akun resmi BNI bukan pengalaman pelanggan');
  assert.equal(promo.sentiment, 'unclassified');
  assert.match(promo.relevance.reason, /akun resmi/);
  const withAt = classifyReview({ platform: 'tiktok', author: '@BNI46', text: 'wondr merchant kini lebih cepat' });
  assert.equal(withAt.relevance.status, 'excluded', 'penulisan @ dan huruf besar tidak mengubah identitas akun');
  const customer = classifyReview({ platform: 'tiktok', author: 'pedagang_sate', text: 'wondr merchant saya gagal login lagi' });
  assert.equal(customer.relevance.status, 'relevant', 'akun pelanggan biasa tetap dinilai');
  const similar = classifyReview({ platform: 'x', author: 'bnimerchantfans', text: 'wondr merchant bagus untuk QRIS' });
  assert.equal(similar.relevance.status, 'relevant', 'handle yang hanya berawalan bni tidak dianggap akun resmi');
});

test('Reclassifying derived labels refreshes automatic rows without touching manual labels', async () => {
  const { reclassifyDerived } = await import('./dashboard-core.mjs');
  const storedPromo = { id: 'tiktok-lama', platform: 'tiktok', author: 'bni46', text: 'Di wondr merchant, kamu bisa ajuin settlement 5x sehari', sentiment: 'positive', tags: ['settlement'], labeling: 'rules-v1', rationale: 'lama', relevance: { status: 'relevant', reason: 'lama', method: 'merchant-context-v1' } };
  const manual = { id: 'play-manual', platform: 'play', author: 'pemilik usaha', text: 'aplikasi ini lambat sekali', sentiment: 'negative', tags: ['performance'], labeling: 'manual', rationale: 'label manual data awal' };
  const [refreshed, untouched] = reclassifyDerived([storedPromo, manual]);
  assert.equal(refreshed.sentiment, 'unclassified', 'baris berlabel otomatis dihitung ulang dengan aturan sekarang');
  assert.equal(refreshed.relevance.status, 'excluded');
  assert.equal(refreshed.text, storedPromo.text, 'teks asli tidak diubah saat pelabelan ulang');
  assert.equal(untouched.sentiment, 'negative', 'label manual pada dataset awal tidak ditimpa classifier');
  assert.equal(untouched.rationale, 'label manual data awal');
});

test('Server reports every credential-backed channel as needing setup, never as connected', async () => {  const dir = await mkdtemp(join(tmpdir(), 'wondr-apify-'));
  try {
    const server = await createDashboardServer({ storagePath: join(dir, 'data.json'), env: {}, collector: async () => [] });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const text = await (await fetch(`${url}/api/data`)).json();
    for (const id of ['youtube', ...Object.keys(apifyChannels)]) {
      const source = text.sources.find(s => s.id === id);
      assert.equal(source.status, 'needs_setup', id);
      assert.equal(source.fetched, null, id);
    }
    for (const id of ['forum', 'blog', 'news']) assert.equal(text.sources.find(s => s.id === id).status, 'unsupported', id);
    const serialised = JSON.stringify(text);
    assert.ok(!/Bearer|APIFY_API_TOKEN=|apify-fixture-token/.test(serialised), 'respons tidak boleh memuat kredensial');
    await new Promise(resolve => server.close(resolve));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Local env file is parsed without exposing values and never overrides the real environment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-env-'));
  const path = join(dir, '.env');
  await writeFile(path, '# komentar\nAPIFY_API_TOKEN="kunci-dari-berkas"\nKOSONG=\nBUKAN_KUNCI\nAPIFY_ACTOR_X=pelanggan/aktor-kustom\n');
  process.env.APIFY_ACTOR_X = 'proses/sudah-ada';
  try {
    const loaded = await loadLocalEnv(path);
    assert.equal(loaded.APIFY_API_TOKEN, 'kunci-dari-berkas', 'tanda kutip dilepas');
    assert.equal(loaded.KOSONG, '');
    assert.equal(loaded.BUKAN_KUNCI, undefined, 'baris tanpa tanda sama dengan diabaikan');
    assert.equal(loaded.APIFY_ACTOR_X, 'pelanggan/aktor-kustom');
    assert.equal(process.env.APIFY_ACTOR_X, 'proses/sudah-ada', 'nilai environment proses harus menang atas berkas');
    assert.equal(process.env.APIFY_API_TOKEN, 'kunci-dari-berkas', 'nilai baru dari berkas ikut dipakai proses');
    assert.deepEqual(await loadLocalEnv(join(dir, 'tidak-ada.env')), {}, 'berkas yang tidak ada bukan kesalahan');
    await writeFile(join(dir, '.env'), 'APIFY_ACTOR_X=proses/dari-dot-env\nGOOGLE_API_KEY=kunci-dot-env\n');
    await writeFile(join(dir, '.env.local'), 'APIFY_ACTOR_X=proses/dari-dot-env-local\n');
    delete process.env.APIFY_ACTOR_X; delete process.env.GOOGLE_API_KEY;
    const layered = await loadLocalEnv([join(dir, '.env'), join(dir, '.env.local')]);
    assert.equal(layered.APIFY_ACTOR_X, 'proses/dari-dot-env-local', '.env.local harus menang atas .env');
    assert.equal(layered.GOOGLE_API_KEY, 'kunci-dot-env', 'nilai yang hanya ada di .env tetap dipakai');
    assert.equal(process.env.APIFY_ACTOR_X, 'proses/dari-dot-env-local');
    assert.equal(process.env.GOOGLE_API_KEY, 'kunci-dot-env');
    delete process.env.APIFY_ACTOR_X; delete process.env.GOOGLE_API_KEY;
  } finally {
    delete process.env.APIFY_API_TOKEN; delete process.env.APIFY_ACTOR_X;
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Deployment ke host Node berkelanjutan ---
const rawRequest = (port, path, { host, headers = {}, method = 'GET' } = {}) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host, ...headers } }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', reject);
  req.end();
});
const basic = (user, password) => 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');

test('Deployment configuration stays loopback-only unless a public host is declared', () => {
  const local = deploymentConfig({});
  assert.equal(local.bindHost, '127.0.0.1');
  assert.equal(local.exposed, false);
  assert.equal(local.user, '', 'pemakaian lokal tidak dipaksa autentikasi');
  assert.equal(local.scheme, 'http');
  assert.equal(local.port, 4173);
});

test('Public deployment refuses to configure itself without credentials', () => {
  assert.throws(() => deploymentConfig({ BIND_HOST: '0.0.0.0' }), /DASHBOARD_USER dan DASHBOARD_PASSWORD/);
  assert.throws(() => deploymentConfig({ ALLOWED_HOSTS: 'saya.onrender.com' }), /DASHBOARD_USER dan DASHBOARD_PASSWORD/);
  assert.throws(() => deploymentConfig({ ALLOWED_HOSTS: 'saya.onrender.com', DASHBOARD_USER: 'pemilik' }), /DASHBOARD_USER dan DASHBOARD_PASSWORD/);
  const open = deploymentConfig({ ALLOWED_HOSTS: 'saya.onrender.com', DASHBOARD_USER: 'pemilik', DASHBOARD_PASSWORD: 'rahasia-uji' });
  assert.equal(open.exposed, true);
  assert.equal(open.scheme, 'https', 'mode publik memakai https');
  assert.deepEqual(open.allowedHosts, ['saya.onrender.com']);
});

test('Public mode requires credentials, serves only its declared domain, and keeps health checks open', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-deploy-'));
  const config = deploymentConfig({ ALLOWED_HOSTS: 'saya.test', DASHBOARD_USER: 'pemilik', DASHBOARD_PASSWORD: 'rahasia-uji', DATA_PATH: join(dir, 'data.json') });
  const server = await createDashboardServer({ config, env: {}, collector: async () => [] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal((await rawRequest(port, '/', { host: 'saya.test' })).status, 401, 'tanpa kredensial harus ditolak');
    assert.equal((await rawRequest(port, '/', { host: 'saya.test', headers: { authorization: basic('pemilik', 'salah') } })).status, 401);
    assert.equal((await rawRequest(port, '/', { host: 'saya.test', headers: { authorization: basic('orang', 'rahasia-uji') } })).status, 401);
    assert.equal((await rawRequest(port, '/api/data', { host: 'saya.test' })).status, 401, 'tanpa kredensial data tidak boleh terbaca');
    const auth = basic('pemilik', 'rahasia-uji');
    assert.equal((await rawRequest(port, '/', { host: 'saya.test', headers: { authorization: auth } })).status, 200);
    const page = await rawRequest(port, '/', { host: 'saya.test', headers: { authorization: auth } });
    assert.match(page.body, /<title>/);
    assert.equal((await rawRequest(port, '/api/data', { host: 'saya.test', headers: { authorization: auth } })).status, 200);
    assert.equal((await rawRequest(port, '/online-data.json', { host: 'saya.test', headers: { authorization: auth } })).status, 404, 'cache mentah tetap tidak disajikan');
    assert.equal((await rawRequest(port, '/api/status', { host: 'saya.test' })).status, 200, 'pemeriksaan kesehatan host tetap terbuka');
    assert.doesNotMatch((await rawRequest(port, '/api/status', { host: 'saya.test' })).body, /rahasia|pemilik|Bearer/);
    assert.equal((await rawRequest(port, '/', { host: 'orang-lain.test', headers: { authorization: auth } })).status, 403, 'domain lain tidak dilayani');
    const analyze = await rawRequest(port, '/api/analyze', { method: 'POST', host: 'saya.test', headers: { authorization: auth, origin: 'https://saya.test' } });
    assert.equal(analyze.status, 200, 'Origin https milik sendiri harus diterima');
    const crossSite = await rawRequest(port, '/api/analyze', { method: 'POST', host: 'saya.test', headers: { authorization: auth, origin: 'https://situs-lain.test' } });
    assert.equal(crossSite.status, 403, 'Origin asing tetap ditolak');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('Local mode still serves loopback without credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-local-'));
  const server = await createDashboardServer({ storagePath: join(dir, 'data.json'), env: {}, collector: async () => [] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal((await rawRequest(port, '/', { host: `127.0.0.1:${port}` })).status, 200);
    assert.equal((await rawRequest(port, '/', { host: `localhost:${port}` })).status, 200);
    assert.equal((await rawRequest(port, '/', { host: 'saya.test' })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- Lapisan serverless (Vercel Functions) ----------
const freshStore = tag => import(`./dashboard-store.mjs?case=${tag}`);
function mockResponse() {
  const res = { status: null, headers: {}, body: '' };
  res.writeHead = (status, headers = {}) => { res.status = status; Object.assign(res.headers, headers); };
  res.end = (value = '') => { res.body = String(value); };
  return res;
}
const useDataPath = async (dir, run) => {
  const previous = process.env.DATA_PATH;
  process.env.DATA_PATH = join(dir, 'online-data.json');
  try { return await run(); } finally {
    if (previous === undefined) delete process.env.DATA_PATH; else process.env.DATA_PATH = previous;
  }
};
const storedReview = { id: 'serverless-new-1', platform: 'play', author: 'Uji Serverless', date: '2026-10-24', text: 'Pencairan terlambat', rating: 2, sourceUrl: 'https://play.google.com/store/apps/details?id=id.bni.wfb' };

test('Serverless store starts from the same seed and marks credential channels as needing setup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-store-'));
  try {
    await useDataPath(dir, async () => {
      const store = await freshStore('seed');
      const data = await store.snapshot();
      assert.equal(data.reviews.length, seedReviews.length, 'tanpa berkas, function memakai dataset awal yang sama dengan server lokal');
      assert.equal(data.running, false);
      assert.equal(data.sources.find(source => source.id === 'x').status, 'needs_setup');
      assert.equal(data.sources.find(source => source.id === 'googlemaps').status, 'needs_setup');
      assert.equal(data.sources.find(source => source.id === 'play').status, 'snapshot');
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Serverless pull stores results on disk and resumes an unfinished actor run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-store-'));
  try {
    await useDataPath(dir, async () => {
      const first = await freshStore('pull-1');
      const result = await first.pull({ collector: async () => [
        { id: 'play', status: 'success', fetched: 1, message: '1 ulasan dibaca', reviews: [storedReview], coverage: { sampleLimit: null } },
        { id: 'x', status: 'partial', fetched: 3, message: 'Actor masih berjalan', reviews: [], coverage: { actor: 'apidojo/tweet-scraper', runId: 'runBelumSelesai', datasetId: 'dsBelumSelesai', runFinished: false } },
      ] });
      assert.equal(result.reviews.length, seedReviews.length + 1);
      assert.equal(result.lastRun.status, 'partial');
      assert.deepEqual(result.lastRun.coverage.fetchedSources.sort(), ['play', 'x']);
      assert.ok(Number.isFinite(Date.parse(result.lastRun.startedAt)), 'waktu mulai diambil saat penarikan dimulai');
      assert.match(await readFile(join(dir, 'online-data.json'), 'utf8'), /Uji Serverless/);

      const second = await freshStore('pull-2');
      let resumed = null;
      const again = await second.pull({ collector: async options => { resumed = options.resume; return [{ id: 'play', status: 'success', fetched: 0, message: 'Tidak ada ulasan baru', reviews: [] }]; } });
      assert.equal(again.reviews.length, seedReviews.length + 1, 'ulasan dari instance sebelumnya tetap ada');
      assert.deepEqual(resumed.get('x'), { runId: 'runBelumSelesai', datasetId: 'dsBelumSelesai', status: 'RUNNING' }, 'run actor berbayar dilanjutkan, tidak dijalankan ulang');
      assert.equal(resumed.has('play'), false);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Serverless pull refuses a concurrent request and releases the lock after failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wondr-store-'));
  try {
    await useDataPath(dir, async () => {
      const store = await freshStore('busy');
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const running = store.pull({ collector: async () => { await gate; return []; } });
      assert.equal(store.isRunning(), true);
      await assert.rejects(store.pull({ collector: async () => [] }), /busy/);
      release();
      await running;
      assert.equal(store.isRunning(), false);

      const failed = await freshStore('fail');
      await assert.rejects(failed.pull({ collector: async () => { throw new Error('jaringan putus'); } }), /jaringan putus/);
      assert.equal(failed.isRunning(), false, 'gagal tidak mengunci function selamanya');
      assert.equal((await failed.snapshot()).reviews.length, seedReviews.length, 'kegagalan tidak menghapus dataset yang ada');
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

async function runMiddleware(url, options = {}) {
  const previousUser = process.env.DASHBOARD_USER, previousPassword = process.env.DASHBOARD_PASSWORD;
  try { return await (await import('./middleware.edge.js')).middleware(new Request(url, options)); } finally {
    if (previousUser === undefined) delete process.env.DASHBOARD_USER; else process.env.DASHBOARD_USER = previousUser;
    if (previousPassword === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = previousPassword;
  }
}

test('Middleware blocks paid pulls until dashboard credentials are configured', async () => {
  delete process.env.DASHBOARD_USER;
  delete process.env.DASHBOARD_PASSWORD;
  const blocked = await runMiddleware('https://situs.example.com/api/analyze', { method: 'POST' });
  assert.equal(blocked.status, 401);
  assert.match(await blocked.text(), /DASHBOARD_USER/);
  assert.equal(await runMiddleware('https://situs.example.com/api/data'), undefined, 'halaman tetap dapat dibaca tanpa kredensial');
});

test('Middleware decodes Basic credentials using web APIs only', async () => {
  const source = await readFile(new URL('./middleware.edge.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Buffer\.from\(/, 'Buffer tidak tersedia di Edge Runtime dan pernah membuat situs gagal 500');
  assert.equal(/^\s*import\s.+from\s+['"]node:/m.test(source), false, 'middleware tidak boleh mengimpor modul Node');
  assert.doesNotMatch(source, /crypto\.subtle/, 'perbandingan dilakukan tanpa API asinkron yang bisa gagal di Edge');
  process.env.DASHBOARD_USER = 'pemilik';
  process.env.DASHBOARD_PASSWORD = 'sandi-panjang';
  assert.equal(await runMiddleware('https://situs.example.com/', { headers: { authorization: basic('pemilik', 'sandi-panjang') } }), undefined);
  assert.equal((await runMiddleware('https://situs.example.com/', { headers: { authorization: 'Basic bukan-base64-###' } })).status, 401, 'header rusak ditolak tanpa melempar galat');
});

test('A failing gateway keeps the site open but shuts the paid route closed', async () => {
  const { middleware } = await import('./middleware.edge.js');
  const broken = { url: 'https://situs.example.com/api/analyze', headers: { get: () => { throw new Error('runtime asing'); } } };
  const blocked = middleware(broken);
  assert.equal(blocked.status, 401, 'jalur berbayar tetap tertutup bila gerbangnya sendiri error');
  assert.equal(middleware({ url: 'https://situs.example.com/', headers: { get: () => { throw new Error('runtime asing'); } } }), undefined, 'halaman tidak boleh ikut mati karena middleware');
});

test('The pull endpoint runs without any login, but still refuses other sites', async () => {
  const previousUser = process.env.DASHBOARD_USER, previousPassword = process.env.DASHBOARD_PASSWORD;
  delete process.env.DASHBOARD_USER;
  delete process.env.DASHBOARD_PASSWORD;
  try {
    const analyze = await import('./api/analyze.js');
    let pulls = 0;
    const okRes = mockResponse();
    await analyze.default({ method: 'POST', url: '/api/analyze', headers: { host: 'situs.example.com', origin: 'https://situs.example.com' } }, okRes, async () => { pulls++; return { reviews: [], running: false }; });
    assert.equal(okRes.status, 200, 'tanpa kredensial sekalipun, penarikan dijalankan');
    assert.equal(pulls, 1);
    assert.equal(JSON.parse(okRes.body).reviews.length, 0);

    const crossRes = mockResponse();
    await analyze.default({ method: 'POST', url: '/api/analyze', headers: { host: 'situs.example.com', origin: 'https://pengiklan.example' } }, crossRes, async () => { pulls++; return { reviews: [] }; });
    assert.equal(crossRes.status, 403, 'situs lain tetap tidak bisa memicu penarikan');
    assert.equal(pulls, 1, 'permintaan ditolak sebelum penarikan dimulai');

    const busyRes = mockResponse();
    await analyze.default({ method: 'POST', url: '/api/analyze', headers: { host: 'situs.example.com' } }, busyRes, async () => { throw new Error('busy'); });
    assert.equal(busyRes.status, 409);
  } finally {
    if (previousUser === undefined) delete process.env.DASHBOARD_USER; else process.env.DASHBOARD_USER = previousUser;
    if (previousPassword === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = previousPassword;
  }
});

test('Middleware requires Basic credentials on every path once they are configured', async () => {
  process.env.DASHBOARD_USER = 'pemilik';
  process.env.DASHBOARD_PASSWORD = 'sandi-panjang';
  const anonymous = await runMiddleware('https://situs.example.com/');
  assert.equal(anonymous.status, 401, 'tanpa header, browser diminta masuk');
  assert.match(anonymous.headers.get('www-authenticate'), /Basic realm/);
  assert.equal(await runMiddleware('https://situs.example.com/', { headers: { authorization: basic('pemilik', 'sandi-panjang') } }), undefined);
  assert.equal((await runMiddleware('https://situs.example.com/', { headers: { authorization: basic('pemilik', 'sandi-salah') } })).status, 401);
  assert.equal((await runMiddleware('https://situs.example.com/', { headers: { authorization: basic('orang-lain', 'sandi-panjang') } })).status, 401);
  assert.equal((await runMiddleware('https://situs.example.com/styles.css', { headers: { authorization: basic('pemilik', 'salah-sandi') } })).status, 401);
  assert.equal(await runMiddleware('https://situs.example.com/api/status', { headers: { authorization: basic('pemilik', 'sandi-panjang') } }), undefined, 'pemeriksaan kesehatan host tetap terbuka');
});

test('Serverless API functions refuse other methods, other origins, and unknown hosts', async () => {
  // Function Node Vercel menerima header sebagai objek biasa, jadi mock mengikuti bentuk itu.
  const mockRequest = (method, url, headers = {}) => ({ method, url, headers });
  const analyze = await import('./api/analyze.js');
  const getRes = mockResponse();
  await analyze.default(mockRequest('GET', '/api/analyze', { host: 'situs.example.com' }), getRes);
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.allow, 'POST');
  const crossRes = mockResponse();
  await analyze.default(mockRequest('POST', '/api/analyze', { host: 'situs.example.com', origin: 'https://situs-lain.example' }), crossRes);
  assert.equal(crossRes.status, 403);
  assert.match(crossRes.body, /lintas situs/i);
  const noHostRes = mockResponse();
  await analyze.default(mockRequest('POST', '/api/analyze', { origin: 'https://situs.example.com' }), noHostRes);
  assert.equal(noHostRes.status, 403, 'tanpa host yang dapat dipastikan, penarikan berbayar tidak dijalankan');
  assert.equal(analyze.rejectsSameSiteCheck({ 'x-forwarded-host': 'situs.example.com', 'x-forwarded-proto': 'https', origin: 'https://situs.example.com' }), false, 'host hasil proxy dianggap sama sendiri');
  assert.equal(analyze.rejectsSameSiteCheck({ host: 'situs.example.com', origin: 'http://situs.example.com' }), false, 'skema http pada host yang sama diterima');
  assert.equal(analyze.rejectsSameSiteCheck({ host: 'situs.example.com', 'sec-fetch-site': 'cross-site' }), true);
  assert.equal(analyze.rejectsSameSiteCheck({ host: 'situs.example.com' }), false, 'permintaan tanpa header Origin tetap dilayani selama host dikenal');
  const data = await import('./api/data.js');
  const postRes = mockResponse();
  await data.default(mockRequest('POST', '/api/data'), postRes);
  assert.equal(postRes.status, 405);
  assert.equal(postRes.headers.allow, 'GET, HEAD');
  const statusRes = mockResponse();
  await (await import('./api/status.js')).default(mockRequest('GET', '/api/status'), statusRes);
  assert.deepEqual(JSON.parse(statusRes.body), { status: 'ok', mode: 'online-pull', running: false });
  assert.equal(statusRes.headers['content-type'], 'application/json; charset=utf-8');
});

