import test from 'node:test';
import assert from 'node:assert/strict';
import { seedReviews } from './data.js';
import { summary, filterReviews, timeline, upsertReviews, classifyText, complaintStats, ratingSummary, exportCsv, groupStats, painGroups, validSource } from './model.js';
import { createDashboardServer } from './server.mjs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { parseGoogleListing, parseGoogleReviews, parseApplePage, collectGoogle } from './collectors.mjs';

const sample = { id:'unit-test-only', platform:'play', author:'Test fixture', date:'2026-10-23', text:'Login gagal dan loading lama', rating:null, sourceUrl:'https://play.google.com/store/apps/details?id=id.bni.wfb' };
test('baseline totals include both stores and preserve neutral denominator', () => {
  const s=summary(seedReviews);
  assert.equal(s.total,43);assert.equal(s.positive,26);assert.equal(s.negative,16);assert.equal(s.neutral,1);
  assert.ok(Math.abs(s.nss-23.25581395348837)<0.000001);
});
test('Google Play reproduces original 35-review analysis',()=>{
  const s=summary(filterReviews(seedReviews,{platform:'play'}));
  assert.equal(s.total,35);assert.equal(s.positive,18);assert.equal(s.negative,16);assert.equal(s.neutral,1);
});
test('App Store written sample is eight, not fifteen ratings',()=>{
  const s=summary(filterReviews(seedReviews,{platform:'appstore'}));assert.equal(s.total,8);assert.equal(s.positive,8);
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
  const groups=groupStats(seedReviews,painGroups,'negative');
  assert.equal(groups[0].total,6);assert.equal(groups[1].total,4);assert.equal(groups[2].total,4);
});
test('weekly and monthly chart bins preserve all review totals',()=>{
  for(const mode of ['week','month']){const bins=timeline(seedReviews,mode);assert.equal(bins.reduce((s,b)=>s+b.positive+b.negative+b.neutral,0),43);}
  assert.deepEqual(timeline([]),[]);
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
  const groups=complaintStats(seedReviews);assert.equal(groups[0].id,'onboarding');assert.equal(groups[0].total,6);
  assert.equal(groups.find(g=>g.id==='notifications').total,3);
  assert.equal(groups.find(g=>g.id==='migration').total,3);
  assert.equal(groups.find(g=>g.id==='login').total,3);
  for(const g of groups)assert.equal(g.total,g.reviews.length);
  assert.equal(complaintStats(filterReviews(seedReviews,{platform:'appstore'})).every(g=>g.total===0),true);
  assert.equal(complaintStats([]).length,12);
});
test('sample star averages use only actual ratings',()=>{
  const s=ratingSummary(seedReviews);assert.equal(s.total,43);assert.ok(Math.abs(s.average-160/43)<1e-9);
  assert.deepEqual(s.distribution.map(d=>d.count),[10,3,2,2,26]);assert.equal(ratingSummary([{rating:null}]).average,null);
});
test('sources use HTTPS and matching platform host',()=>{
  assert.equal(validSource('https://www.instagram.com/p/test/','instagram'),true);
  assert.equal(validSource('https://x.com@evil.invalid/','x'),false);
  assert.equal(validSource('http://x.com/test','x'),false);
});
test('incremental online refresh deduplicates IDs and retains manual labels',()=>{
  const r=seedReviews[0];const result=upsertReviews(seedReviews,[r,{...r,id:'other-id'}],'2026-10-23');
  assert.equal(result.added,0);assert.equal(result.unchanged,2);assert.equal(result.reviews.length,43);
  assert.equal(result.reviews[0].sentiment,'negative');assert.equal(result.reviews[0].labeling,'manual');
  assert.equal(upsertReviews(seedReviews,[sample,sample],'2026-10-23').added,1);
});
test('edited reviews update metrics and keep prior versions and absent records',()=>{
  const r=seedReviews[0], result=upsertReviews(seedReviews,[{...r,text:'bagus dan lancar',rating:4}],'2026-10-24');
  assert.equal(result.updated,1);assert.equal(result.reviews.length,43);
  const updated=result.reviews[0];assert.equal(updated.history.length,1);assert.equal(updated.history[0].text,r.text);
  assert.equal(updated.history[0].rating,5);assert.equal(updated.rating,4);assert.equal(updated.sentiment,'positive');assert.equal(updated.lastSeenAt,'2026-10-24');
  assert.equal(summary(result.reviews).negative,15);
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
  assert.equal(new Set(seedReviews.map(r=>r.platform+'|'+r.id)).size,43);
  for(const r of seedReviews){assert.ok(validSource(r.sourceUrl,r.platform));assert.ok(r.rationale);assert.ok(r.tags.length);}
});
test('online API preserves history across partial success, failure and restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wondr-api-test-')),storagePath=join(dir,'data.json');
  let mode='success',release;
  const collector=async()=>{
    if(mode==='wait')await new Promise(resolve=>{release=resolve;});
    return mode==='error' ? [{id:'play',status:'error',fetched:0,message:'Test network failure'},{id:'appstore',status:'error',fetched:0,message:'Test parse failure'}] : [{id:'play',status:'success',fetched:1,message:'Fixture only',reviews:[sample]},{id:'appstore',status:'error',fetched:0,message:'Test parse failure'}];
  };
  let server=await createDashboardServer({storagePath,collector});
  const listen=async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const close=()=>new Promise(resolve=>server.close(resolve));
  try{
    let url=await listen();
    assert.equal((await (await fetch(url+'/api/data')).json()).reviews.length,43);
    assert.equal((await fetch(url+'/api/analyze',{method:'POST',headers:{Origin:'https://invalid.example'}})).status,403);
    const first=await (await fetch(url+'/api/analyze',{method:'POST'})).json();
    assert.equal(first.reviews.length,44);assert.equal(first.lastRun.added,1);assert.equal(first.lastRun.status,'partial');
    assert.equal(first.sources.find(s=>s.id==='facebook').status,'unsupported');assert.equal(first.sources.find(s=>s.id==='appstore').status,'error');
    const repeat=await (await fetch(url+'/api/analyze',{method:'POST'})).json();assert.equal(repeat.lastRun.added,0);assert.equal(repeat.reviews.length,44);
    mode='error';const failed=await (await fetch(url+'/api/analyze',{method:'POST'})).json();
    assert.equal(failed.lastRun.status,'error');assert.equal(failed.reviews.length,44);
    mode='wait';const request=fetch(url+'/api/analyze',{method:'POST'});
    while(!release)await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await fetch(url+'/api/analyze',{method:'POST'})).status,409);
    assert.equal((await (await fetch(url+'/api/data')).json()).running,true);release();await request;
    assert.equal((await fetch(url+'/online-data.json')).status,404);
    assert.equal(JSON.parse(await readFile(storagePath,'utf8')).runs.length,4);
    await close();server=await createDashboardServer({storagePath,collector});url=await listen();
    assert.equal((await (await fetch(url+'/api/data')).json()).reviews.length,44);
    const blocked=await new Promise((resolve,reject)=>get(url+'/api/data',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
    assert.equal(blocked,403);
  }finally{if(server.listening)await close();await rm(dir,{recursive:true,force:true});}
});
const rpcFixture = (reviews,cursor=null) => `)]}'\n\n${JSON.stringify([['wrb.fr','oCPfdb',JSON.stringify([reviews,cursor?[null,cursor]:null])]])}\n`;
const googleRow=['unit-test-only',['Fixture'],2,null,'Login gagal',[1792713600,0]];
const listingFixture=`<script type="application/ld+json">${JSON.stringify({'@type':'SoftwareApplication',url:sample.sourceUrl,aggregateRating:{ratingValue:3.9,ratingCount:68}})}</script>`;
test('Google parser distinguishes readable empty query from null RPC and changed structures',()=>{
  assert.equal(parseGoogleListing(listingFixture).ratingCount,68);
  assert.throws(()=>parseGoogleListing(listingFixture.replace('id.bni.wfb','id.bni.wondr')));
  const parsed=parseGoogleReviews(rpcFixture([googleRow],'next'));assert.equal(parsed.cursor,'next');assert.equal(parsed.reviews[0].rating,2);
  assert.deepEqual(parseGoogleReviews(rpcFixture([])).reviews,[]);
  assert.throws(()=>parseGoogleReviews(JSON.stringify([['wrb.fr','oCPfdb',null]])),/rpc_error/);
  assert.throws(()=>parseGoogleReviews('not a response'),/parse_error/);
  assert.throws(()=>parseGoogleReviews(rpcFixture([[...googleRow.slice(0,2),9,...googleRow.slice(3)]])));
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
  const result=await collectGoogle(async()=>{
    requests++;
    if(requests===1)return new Response(listingFixture);
    if(requests===2)return new Response(rpcFixture([googleRow],'next'));
    throw new Error('fixture disconnect');
  });
  assert.equal(result.status,'partial');assert.equal(result.fetched,1);assert.match(result.message,/network_error/);
});
