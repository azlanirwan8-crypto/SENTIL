import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createDashboardServer } from './server.mjs';
import { seedReviews } from './data.js';

const profile = await mkdtemp(join(tmpdir(),'wondr-browser-test-'));
let collectorMode='baseline', releasePull, pulls=0;
const synthetic={id:'qa-browser-only',platform:'play',author:'QA <img src=x onerror="window.__xss=true">',date:null,text:'Login gagal <script>window.__xss=true</script>',rating:null,sourceUrl:'https://play.google.com/store/apps/details?id=id.bni.wfb',provenance:'Synthetic isolated browser fixture'};
const server=await createDashboardServer({storagePath:join(profile,'test-data.json'),collector:async()=>{
  pulls++;
  if(collectorMode==='wait')await new Promise(resolve=>{releasePull=resolve;});
  if(collectorMode==='error')return ['play','appstore'].map(id=>({id,status:'error',fetched:0,message:'Koneksi uji gagal; histori dipertahankan.'}));
  return ['play','appstore'].map(id=>({id,status:'success',message:'Data uji lokal untuk pengujian antarmuka.',fetched:seedReviews.filter(r=>r.platform===id).length,reviews:[...seedReviews.filter(r=>r.platform===id),...(id==='play'&&collectorMode==='new'?[synthetic]:[])]}));
}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl=`http://127.0.0.1:${server.address().port}`;
const output = new URL('./test-artifacts/',import.meta.url);
await mkdir(output,{recursive:true});
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank',
],{stdio:['ignore','pipe','pipe']});
let socket, session, nextId=0;
const pending=new Map(), errors=[], completed=[];
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let logs='';const timer=setTimeout(()=>reject(new Error('Browser startup timed out')),20000);
    chrome.stderr.on('data',chunk=>{logs+=chunk;const match=logs.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    chrome.on('error',error=>{clearTimeout(timer);reject(error);});
    chrome.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code));});
  });
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result);}}
    if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text+': '+(data.params.exceptionDetails.exception?.description||''));
    if(data.method==='Log.entryAdded'&&data.params.entry.level==='error')errors.push(data.params.entry.text);
  });
  const send=(method,params={},target=session)=>new Promise((resolve,reject)=>{
    const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));
  });
  const target=await send('Target.createTarget',{url:'about:blank'},null);
  session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const ready=()=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;function check(){if(document.querySelector('.metric-value'))resolve(true);else if(Date.now()>end)reject(Error('App did not render'));else requestAnimationFrame(check);}check();})`);
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const metricValues=()=>evaluate(`[...document.querySelectorAll('.metric-value')].map(e=>e.textContent.trim())`);
  const screenshot=async(name,full=true)=>{
    await evaluate('document.fonts.ready');
    const layout=await send('Page.getLayoutMetrics');
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(full?{clip:{x:0,y:0,width:layout.cssLayoutViewport.clientWidth,height:Math.min(layout.cssContentSize.height,2200),scale:1}}:{})});
    await writeFile(new URL(name,output),Buffer.from(shot.data,'base64'));
  };
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:baseUrl});await ready();
  assert.deepEqual(await metricValues(),['43','60,5%','37,2%','+23,3']);
  assert.equal(await evaluate(`Boolean(document.querySelector('.brand,.workspace-chip'))`),false);
  assert.doesNotMatch(await evaluate('document.title'),/wondr pulse/i);
  assert.doesNotMatch(await evaluate(`document.querySelector('.page-footer').textContent`),/wondr pulse/i);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sidebar')).width`),'230px');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
  await screenshot('dashboard-desktop.png');completed.push('Desktop layout and baseline metrics');
  await click('[data-platform="play"]');assert.deepEqual(await metricValues(),['35','51,4%','45,7%','+5,7']);
  await click('[data-platform="appstore"]');assert.deepEqual(await metricValues(),['8','100,0%','0,0%','+100,0']);
  await click('[data-platform="tiktok"]');assert.deepEqual(await metricValues(),['0','—','—','—']);
  completed.push('Store filters and unavailable social empty states');
  await click('[data-platform="all"]');
  await evaluate(`document.querySelector('#period').value='2026-10';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal((await metricValues())[0],'8');
  await evaluate(`document.querySelector('#period').value='custom';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#date-from').value='2026-10-23';document.querySelector('#date-to').value='2026-08-01';`);
  await click('[data-action="apply-dates"]');assert.match(await evaluate(`document.querySelector('#date-error').textContent`),/tanggal awal/);
  await evaluate(`document.querySelector('#period').value='all';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));`);
  completed.push('Monthly filter and invalid custom date range');
  await click('[data-view="sentiment"]');assert.equal(await evaluate(`document.querySelectorAll('.recommendation').length`),5);
  await screenshot('sentiment-analysis.png');
  await click('[data-driver="Pendaftaran belum tuntas"]');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),6);
  await click('[data-review]');assert.equal(await evaluate(`document.querySelector('#detail-dialog').open`),true);
  assert.match(await evaluate(`document.querySelector('.detail-section p').textContent`),/pendaftaran|pengajuan/i);
  await click('[data-close="detail-dialog"]');await click('[data-action="clear-group"]');await click('[data-sentiment="all"]');
  assert.match(await evaluate(`document.querySelector('.table-footer').textContent`),/43 ulasan/);
  await click('[data-page="next"]');assert.match(await evaluate(`document.querySelector('.table-footer').textContent`),/11–20/);
  await evaluate(`document.querySelector('#review-search').value='Bos AteQ';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  assert.match(await evaluate(`document.querySelector('tbody').textContent`),/Bos AteQ/);
  assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/43 ulasan tertulis unik/);
  assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/35 ulasan tertulis dari 68 penilaian/);
  for (const author of seedReviews.map(r=>r.author)) {
    await evaluate(`document.querySelector('#review-search').value=${JSON.stringify(author)};document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
    const found=await evaluate(`new Promise(resolve=>{const end=Date.now()+2500;function check(){const body=document.querySelector('tbody');if(body&&body.textContent.includes(${JSON.stringify(author)}))resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check);}check();})`);
    assert.equal(found,true,`Author not searchable: ${author}`);
  }
  completed.push('Analysis drivers, review detail, pagination, data-scope note and all 43 author searches');
  await evaluate(`document.querySelector('#review-search').value='Bos AteQ';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  await evaluate(`window.__downloadText=null;window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{blob.text().then(t=>window.__downloadText=t);return window.__createObjectURL(blob)};window.__anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)window.__anchorClick.call(this)};`);
  await click('[data-action="export"]');
  await evaluate(`new Promise(resolve=>{const check=()=>window.__downloadText!==null?resolve(true):requestAnimationFrame(check);check();})`);
  const csv=await evaluate('window.__downloadText');assert.match(csv,/Bos AteQ/);assert.doesNotMatch(csv,/Tanamo/);
  completed.push('CSV export respects current search and filters');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="import"],input[type="file"],#import-dialog').length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('.heading-actions button').length`),1);
  collectorMode='wait';await click('[data-action="analyze"]');
  assert.equal(await evaluate(`document.querySelector('[data-action="analyze"]').disabled`),true);
  while(!releasePull)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pulls,1);releasePull();
  const pullReady=()=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;function check(){if(!document.querySelector('[data-action="analyze"]').disabled)resolve(true);else if(Date.now()>end)reject(Error('Pull did not finish'));else requestAnimationFrame(check);}check();})`);
  await pullReady();assert.match(await evaluate(`document.querySelector('tbody').textContent`),/Bos AteQ/);
  completed.push('Single online pull action, loading lock and preserved filters');
  await click('[data-view="overview"]');
  const complaintRows=await evaluate(`[...document.querySelectorAll('[data-complaint]')].map(b=>({id:b.dataset.complaint,text:b.textContent}))`);
  assert.equal(complaintRows[0].id,'onboarding');assert.match(complaintRows[0].text,/6/);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.complaint-row')).display`),'grid');
  assert.equal(await evaluate(`document.querySelector('.complaint-bar').getBoundingClientRect().width>0`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sample-rating')).display`),'grid');
  await click('[data-complaint="onboarding"]');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),6);
  await click('[data-view="overview"]');await click('[data-platform="appstore"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-complaint]').length`),0);
  await click('[data-platform="all"]');completed.push('Ranked complaint chart, exact drilldown and no-complaint filter');
  await screenshot('dashboard-desktop.png');
  await click('[data-view="platforms"]');assert.equal(await evaluate(`document.querySelectorAll('.coverage-card').length`),11);
  await click('[data-platform="instagram"]');assert.equal(await evaluate(`document.querySelectorAll('.coverage-card').length`),1);
  assert.match(await evaluate(`document.querySelector('.coverage-card h3').textContent`),/Instagram/);
  await click('[data-platform="all"]');await screenshot('platform-coverage.png');await click('[data-view="overview"]');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.reload');await ready();
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth`),390);
  assert.equal(await evaluate(`window.innerWidth`),390);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.complaint-row')).display`),'grid');
  assert.equal(await evaluate(`document.querySelector('.complaint-bar').getBoundingClientRect().width>0`),true);
  await screenshot('dashboard-mobile.png');completed.push('Platform coverage and mobile layout without page overflow');
  collectorMode='new';await click('[data-action="analyze"]');await pullReady();
  assert.equal((await metricValues())[0],'44');
  await click('[data-action="analyze"]');await pullReady();assert.equal((await metricValues())[0],'44');
  await send('Page.reload');await ready();
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;function check(){if(document.querySelector('.metric-value').textContent==='44')resolve(true);else if(Date.now()>end)reject(Error('Stored data not loaded'));else requestAnimationFrame(check);}check();})`);
  await click('[data-view="reviews"]');
  await evaluate(`document.querySelector('#review-search').value='QA <img';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  await click('[data-review]');assert.equal(await evaluate(`document.querySelector('.detail-text').textContent.includes('<script>')`),true);
  assert.equal(await evaluate('Boolean(window.__xss)'),false);assert.equal(await evaluate(`document.querySelectorAll('#detail-dialog script,#detail-dialog img').length`),0);
  assert.match(await evaluate(`document.querySelector('.detail-author').textContent`),/N\/A/);
  await click('[data-close="detail-dialog"]');await click('[data-view="overview"]');
  collectorMode='error';await click('[data-action="analyze"]');await pullReady();
  assert.equal((await metricValues())[0],'44');assert.match(await evaluate(`document.querySelector('#main').textContent`),/gagal/i);
  await click('[data-view="platforms"]');assert.match(await evaluate(`document.querySelector('.coverage-grid').textContent`),/Koneksi uji gagal/);
  completed.push('Online batch deduplication, server persistence, missing metadata, XSS escaping and failed refresh history');
  assert.deepEqual(errors,[]);completed.push('No browser runtime or console errors');
  console.log(JSON.stringify({passed:completed.length,tests:completed,screenshots:['dashboard-desktop.png','sentiment-analysis.png','platform-coverage.png','dashboard-mobile.png']},null,2));
  await send('Browser.close',{},null);
} finally {
  if(socket?.readyState===WebSocket.OPEN)socket.close();
  if(chrome.exitCode===null)chrome.kill();
  for(const p of pending.values())clearTimeout(p.timer);
  await new Promise(resolve=>server.close(resolve));
  try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
