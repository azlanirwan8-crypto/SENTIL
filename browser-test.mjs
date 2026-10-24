import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createDashboardServer } from './server.mjs';
import { seedReviews } from './data.js';
import { clusterStats } from './model.js';

const profile = await mkdtemp(join(tmpdir(),'wondr-browser-test-'));
let collectorMode='baseline', releasePull, pulls=0, waited=false;
const synthetic={id:'qa-browser-only',platform:'play',author:'QA <img src=x onerror="window.__xss=true">',date:null,text:'Login gagal <script>window.__xss=true</script>',rating:null,sourceUrl:'https://play.google.com/store/apps/details?id=id.bni.wfb',provenance:'Synthetic isolated browser fixture'};
const socialBase={platform:'youtube',author:'YouTube test fixture',date:'2026-10-23',publishedAt:'2026-10-23T12:30:00Z',retrievedAt:'2026-10-24T01:00:00Z',rating:null,sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',authorChannelId:'viewer',context:{videoId:'abcdefghijk',channelId:'owner',product:'wondr-merchant',title:'wondr merchant <script>window.__xss=true</script>',description:'Isolated fixture context, not customer sentiment'},provenance:'Synthetic API fixture; never live social data'};
const socialFixtures=[{...socialBase,id:'yt-a',text:'wondr merchant login gagal'},{...socialBase,id:'yt-b',text:'wondr merchant login gagal'},{...socialBase,id:'yt-owner',authorChannelId:'owner',text:'wondr merchant bagus'},{...socialBase,id:'yt-uncertain',text:'Video bagus'}];
async function mockResults(){
  pulls++;
  if(collectorMode==='wait'&&!waited)await new Promise(resolve=>{releasePull=resolve;waited=true;});
  if(collectorMode==='error')return ['play','appstore'].map(id=>({id,status:'error',fetched:0,message:'Koneksi uji gagal; histori dipertahankan.'}));
  return ['play','appstore'].map(id=>{
    const count=seedReviews.filter(r=>r.platform===id).length;
    const truncated=id==='appstore'&&collectorMode==='truncated';
    return {id,status:truncated?'partial':'success',fetched:count,rating:id==='play'?4:4.8,ratingCount:id==='play'?74:17,installs:id==='play'?'10K+':null,
      ratingHistogram:id==='play'?[52,3,2,4,14]:[16,0,0,0,1],ratingHistogramTotal:id==='play'?75:17,
      coverage:id==='play'
        ? {pools:[{hl:'id',gl:'ID',label:'kumpulan bahasa Indonesia',pagesRead:1,rows:38,added:38,complete:true,error:null},{hl:'en',gl:'US',label:'kumpulan bahasa Inggris',pagesRead:1,rows:17,added:17,complete:true,error:null}],pagesRead:2,rows:55,sampleLimit:null}
        : {shelfPages:1,feedPages:1,shelfReviews:9,feedReviews:9,sharedReviews:9,feedOnly:0,sampleLimit:null},
      message:id==='play'
        ? `${count} ulasan tertulis unik dibaca dari Google Play sebagai gabungan 38 ulasan kumpulan bahasa Indonesia dan 17 ulasan kumpulan bahasa Inggris. Paginasi diikuti sampai sumber tidak mengirim halaman berikutnya; kolektor tidak memiliki batas jumlah sampel. Histogram penilaian halaman toko dibaca penuh: 5★=52, 4★=3, 3★=2, 2★=4, 1★=14 (total 75 penilaian). 55 ulasan membawa teks publik dan masuk analisis sentimen; 20 penilaian tanpa teks ikut dihitung sebagai penilaian tetapi tidak dapat dianalisis sentimennya.`
        : `${count} ulasan tertulis unik dibaca dari App Store Indonesia melalui dua jalur publik sekaligus: halaman ulasan resmi dan feed ulasan pelanggan resmi, masing-masing 9 ulasan dikonfirmasi kedua jalur.${truncated?' Hasil belum lengkap; feed resmi masih mengirim penanda halaman lanjutan ketika batas waktu pengambilan tercapai (page_limit). Teks yang sudah terbaca tetap disimpan.':''}`,
      reviews:[...seedReviews.filter(r=>r.platform===id),...(id==='play'&&collectorMode==='new'?[synthetic]:[])]};
  }).concat(collectorMode==='social'?[
    {id:'youtube',status:'success',fetched:socialFixtures.length,message:'Isolated API fixture only',reviews:socialFixtures},
    // Kanal yang menjawab tetapi tidak mengirim satu pun teks: harus tampil sebagai
    // "terhubung tanpa hasil", bukan "Berhasil" dan bukan nol keluhan.
    {id:'facebook',status:'success',fetched:0,reviews:[],
      coverage:{actor:'apify/facebook-pages-scraper',itemsRead:1,emptyResultMarkers:1,identityFiltered:0,sampleLimit:20,sampleLimitField:'maxResult',possiblyTruncated:false},
      message:'0 teks unik dibaca dari Facebook melalui Apify actor apify/facebook-pages-scraper; 1 item dataset diperiksa. Actor mengembalikan 1 penanda tidak ada hasil untuk kueri ini, artinya kanal dapat dihubungi tetapi tidak ada konten publik yang cocok. Hasil dibatasi input actor maxResult=20; 1 item dataset dikembalikan. Item yang dikembalikan belum mencapai batas tersebut.'},
  ]:collectorMode==='social-missing'?[{id:'youtube',status:'needs_setup',fetched:null,message:'YOUTUBE_API_KEY belum dikonfigurasi; data tersimpan dipertahankan.',reviews:[]}]:[]);
}
// Penarikan berjalan satu kanal per permintaan; keduanya di-mock agar pengujian tidak
// pernah mengirim permintaan nyata ke Google, Apple, YouTube, atau Apify.
const unemulatedResult=id=>({id,status:'needs_setup',fetched:null,message:id==='youtube'?'Konektor YouTube Data API tersedia, tetapi YOUTUBE_API_KEY atau GOOGLE_API_KEY belum tersedia pada environment server. Belum ada komentar yang diambil.':'Kanal uji tanpa fixture; tidak ada permintaan nyata dikirim.',reviews:[]});
const server=await createDashboardServer({storagePath:join(profile,'test-data.json'),env:{},collector:mockResults,collectOne:async id=>(await mockResults()).find(result=>result.id===id)??unemulatedResult(id)});
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
    await evaluate('new Promise(resolve=>setTimeout(resolve,900))');
    await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+6000;function check(){if(!document.querySelector('.toast.visible')&&Number(getComputedStyle(document.querySelector('#toast')).opacity)===0)resolve(true);else if(Date.now()>end)reject(Error('Toast did not disappear'));else requestAnimationFrame(check);}check();})`);
    const layout=await send('Page.getLayoutMetrics');
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(full?{clip:{x:0,y:0,width:layout.cssLayoutViewport.clientWidth,height:Math.min(layout.cssContentSize.height,2200),scale:1}}:{})});
    await writeFile(new URL(name,output),Buffer.from(shot.data,'base64'));
  };
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:baseUrl});await ready();
  assert.deepEqual(await metricValues(),['64','64,1%','34,4%','+29,7']);
  assert.equal(await evaluate(`Boolean(document.querySelector('.brand,.workspace-chip'))`),false);
  const navigationLabels=['Dashboard','Analisis sentimen','Review','Platform'];
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#sidebar .nav-item')].map(e=>e.querySelector('span').textContent)`),navigationLabels);
  assert.equal(await evaluate(`document.querySelectorAll('[data-view="methodology"],.profile,.profile-avatar,.avatar-light,.sidebar-bottom,.nav-label,.sidebar-separator').length`),0);
  assert.doesNotMatch(await evaluate(`document.querySelector('#sidebar').textContent+document.querySelector('#topbar').textContent`),/Ringkasan|Ulasan & percakapan|Cakupan platform|Metode & data|Analis Data|Ruang kerja|Data & transparansi/i);
  assert.equal(await evaluate(`document.querySelector('.topbar-brand').textContent`),'WONDR MERCHANT');
  await evaluate(`Promise.all([400,500,600,700].map(weight=>document.fonts.load(weight+' 13px Poppins')))`);
  for (const [view,label] of [['overview','Dashboard'],['sentiment','Analisis sentimen'],['reviews','Review'],['platforms','Platform']]) {
    await click(`[data-view="${view}"]`);
    assert.equal(await evaluate(`document.querySelector('.nav-item[aria-current="page"]').getAttribute('aria-label')`),label);
    assert.equal(await evaluate(`document.querySelector('.breadcrumb strong').textContent`),label);
    assert.doesNotMatch(await evaluate(`document.querySelector('#main').textContent`),/Metode & data/);
    if(view!=='overview')assert.equal(await evaluate(`document.querySelector('h1').textContent`),label);
  }
  await click('[data-view="overview"]');
  completed.push('Renamed navigation, matching page labels and removed methodology menu, workspace and profile');
  assert.doesNotMatch(await evaluate('document.title'),/wondr pulse/i);
  // Teks pemasaran dan footer dihapus atas permintaan pemilik akun; tidak ada lagi eyebrow atau footer.
  assert.equal(await evaluate(`document.querySelectorAll('.eyebrow,.page-footer').length`),0,'eyebrow dan footer tidak boleh tersisa');
  assert.doesNotMatch(await evaluate(`document.body.textContent`),/Analisis pengalaman pelanggan|Analisis pengalaman merchant|Dasbor independen|Bukan produk resmi BNI|Setiap label dapat ditelusuri/);
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sidebar')).width`),'250px');
  assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`),'rgb(243, 243, 249)');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sidebar')).backgroundColor`),'rgb(64, 81, 137)');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.card')).borderRadius`),'4px');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.range-button')).borderRadius`),'4px');
  assert.match(await evaluate(`getComputedStyle(document.body).fontFamily`),/^Poppins/);
  assert.equal(await evaluate(`[400,500,600,700].every(weight=>document.fonts.check(weight+' 13px Poppins'))`),true);
  assert.equal(await evaluate(`performance.getEntriesByType('resource').filter(e=>e.name.includes('.woff2')).length`),4);
  assert.equal(await evaluate(`performance.getEntriesByType('resource').every(e=>new URL(e.name).origin===location.origin)`),true);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
  await screenshot('dashboard-desktop.png');completed.push('Velzon Default visual tokens, locally loaded Poppins and baseline metrics');
  await click('[data-platform="play"]');assert.deepEqual(await metricValues(),['55','58,2%','40,0%','+18,2']);
  await click('[data-platform="appstore"]');assert.deepEqual(await metricValues(),['9','100,0%','0,0%','+100,0']);
  await click('[data-platform="tiktok"]');assert.deepEqual(await metricValues(),['—','—','—','—']);
  completed.push('Store filters and unavailable social empty states');
  await click('[data-platform="all"]');
  await evaluate(`document.querySelector('#period').value='2026-10';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal((await metricValues())[0],'18');
  await evaluate(`document.querySelector('#period').value='custom';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#date-from').value='2026-10-23';document.querySelector('#date-to').value='2026-08-01';`);
  await click('[data-action="apply-dates"]');assert.match(await evaluate(`document.querySelector('#date-error').textContent`),/tanggal awal/);
  await evaluate(`document.querySelector('#date-from').value='2026-10-01';document.querySelector('#date-to').value='2026-10-22';`);
  await click('[data-action="apply-dates"]');assert.equal((await metricValues())[0],'18');
  for(const view of ['overview','sentiment','reviews','platforms']) {
    await click(`[data-view="${view}"]`);
    assert.deepEqual(await evaluate(`[document.querySelector('#period').value,document.querySelector('#date-from').value,document.querySelector('#date-to').value]`),['custom','2026-10-01','2026-10-22']);
    assert.equal(await evaluate(`document.querySelectorAll('.heading-actions #period').length`),1);
    assert.equal(await evaluate(`document.querySelectorAll('[data-action="analyze"]').length`),view==='platforms'?1:0);
    assert.equal(await evaluate(`document.querySelector('.custom-dates').nextElementSibling.classList.contains('filters')`),true);
    if(view==='platforms')assert.equal(await evaluate(`[...document.querySelectorAll('.coverage-stats > div:first-child strong')].reduce((sum,e)=>sum+(Number(e.textContent)||0),0)`),18);
  }
  await evaluate(`document.querySelector('#period').value='all';document.querySelector('#period').dispatchEvent(new Event('change',{bubbles:true}));`);
  completed.push('Header date filter persists across menus, validates custom ranges, and limits pulling to Platform');
  await click('[data-view="sentiment"]');assert.equal(await evaluate(`document.querySelectorAll('.recommendation').length`),6);
  await screenshot('sentiment-analysis.png');
  await click('[data-driver="Pendaftaran belum tuntas"]');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),8);
  await click('[data-review]');assert.equal(await evaluate(`document.querySelector('#detail-dialog').open`),true);
  assert.match(await evaluate(`document.querySelector('.detail-section p').textContent`),/pendaftaran|pengajuan/i);
  // Rincian disusun sebagai kartu metadata dua kolom dengan judul berikon; jejak teknis di footer.
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#detail-dialog .detail-grid')).display`),'grid','rincian memakai kartu metadata dua kolom');
  assert.equal(await evaluate(`document.querySelectorAll('#detail-dialog .detail-section h3 .icon').length>=3`),true,'setiap bagian rincian diberi ikon');
  assert.equal(await evaluate(`document.querySelectorAll('#detail-dialog .detail-author .badge').length`),1,'satu badge sentimen pada kepala');
  assert.equal(await evaluate(`document.querySelector('#detail-dialog .detail-author .platform-label')!==null`),true,'badge platform pada kepala');
  assert.match(await evaluate(`document.querySelector('#detail-dialog .detail-author').textContent`),/★/,'penilaian bintang tampil di kepala');
  assert.match(await evaluate(`document.querySelector('#detail-dialog .action-tag').textContent`),/Perlu (eskalasi layanan pelanggan|penelusuran teknis|ditindaklanjuti)|Masukan untuk produk/,'tag tindakan hasil ABSA');
  assert.match(await evaluate(`[...document.querySelectorAll('#detail-dialog .source-facts dt')].map(e=>e.textContent).join(' | ')`),/Aspek pengalaman/,'aspek target ditampilkan sebagai metadata');
  assert.equal(await evaluate(`document.querySelector('#detail-dialog .detail-section .btn-primary')!==null`),true,'tombol utama membuka sumber asli');
  assert.equal(await evaluate(`/ID ulasan/.test(document.querySelector('#detail-dialog .detail-audit').textContent)`),true,'ID teknis disembunyikan di jejak audit');
  assert.ok((await evaluate(`new Set([...document.querySelectorAll('#detail-dialog .tag')].map(t=>t.getAttribute('style'))).size`))>=2,'chip rincian memakai tinta berbeda');
  await screenshot('review-detail.png',false);
  await click('[data-close="detail-dialog"]');await click('[data-action="clear-group"]');await click('[data-sentiment="all"]');
  assert.match(await evaluate(`document.querySelector('.table-footer').textContent`),/64 ulasan/);
  await click('[data-page="next"]');assert.match(await evaluate(`document.querySelector('.table-footer').textContent`),/11–20/);
  await evaluate(`document.querySelector('#page-size').value='all';document.querySelector('#page-size').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),64,'opsi Semua harus menampilkan seluruh baris tersimpan');
  assert.match(await evaluate(`document.querySelector('.table-footer').textContent`),/Menampilkan 1–64 dari 64 ulasan/);
  assert.equal(await evaluate(`document.querySelector('[data-page="next"]').disabled`),true);
  await evaluate(`document.querySelector('#page-size').value='25';document.querySelector('#page-size').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),25);
  assert.equal(await evaluate(`document.querySelector('.table-footer span').textContent.trim()`),'Menampilkan 1–25 dari 64 ulasan');
  await evaluate(`document.querySelector('#page-size').value='10';document.querySelector('#page-size').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),10);
  // Urutan kolom: kepala tabel dapat diurut naik/turun untuk nama, tanggal, topik, platform, sentimen.
  const defaultFirst=await evaluate(`document.querySelector('tbody [data-review]').dataset.review`);
  assert.equal(await evaluate(`document.querySelectorAll('#main thead th[aria-sort]').length`),4,'empat kepala kolom dapat diurut');
  assert.equal(await evaluate(`document.querySelector('#main thead th[aria-sort]').getAttribute('aria-sort')`),'descending','bawaan urutan: tanggal menurun');
  assert.equal(await evaluate(`document.querySelectorAll('#main thead .th-sort').length`),5,'kolom pengguna menyediakan tombol nama dan tanggal');
  await click('[data-sort="author"]');
  assert.equal(await evaluate(`document.querySelector('#main thead th[aria-sort]').getAttribute('aria-sort')`),'ascending');
  const ascNames=await evaluate(`[...document.querySelectorAll('tbody .review-name')].map(e=>e.textContent)`);
  assert.deepEqual(ascNames,[...ascNames].sort((a,b)=>a.localeCompare(b,'id')),'urut naik nama pengguna');
  await click('[data-sort="author"]');
  const descNames=await evaluate(`[...document.querySelectorAll('tbody .review-name')].map(e=>e.textContent)`);
  assert.deepEqual(descNames,[...descNames].sort((a,b)=>b.localeCompare(a,'id')),'urut turun nama pengguna');
  await click('[data-sort="sentiment"]');
  const sentiments=await evaluate(`[...document.querySelectorAll('tbody .badge')].map(e=>e.textContent.trim())`);
  assert.equal(sentiments[0],'Positif');assert.equal(sentiments.at(-1),'Positif','halaman pertama terisi positif lebih dulu');
  await click('[data-sort="date"]');
  assert.equal(await evaluate(`document.querySelector('tbody [data-review]').dataset.review`),defaultFirst,'urutan tanggal bawaan pulih setelah berpindah kolom');
  // Label berwarna, satu baris nama, dan dropdown berhitung.
  assert.ok((await evaluate(`new Set([...document.querySelectorAll('tbody .tag')].map(t=>t.getAttribute('style'))).size`))>=3,'chip topik dan label metode memakai tinta berbeda');
  assert.equal(await evaluate(`[...document.querySelectorAll('tbody .review-name')].every(e=>e.getBoundingClientRect().height<24)`),true,'nama penulis selalu satu baris');
  assert.equal(await evaluate(`[...document.querySelectorAll('tbody .review-name')].every(e=>e.scrollWidth-e.clientWidth<=1)`),true,'nama pengguna tampil utuh tanpa elipsis');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('tbody .review-text')).webkitLineClamp`),'none','teks ulasan tampil utuh tanpa pemotongan baris');
  await evaluate(`document.querySelector('#page-size').value='all';document.querySelector('#page-size').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate(`Math.max(...[...document.querySelectorAll('tbody .review-tags')].map(e=>e.querySelectorAll('.tag-chip-button').length))`),4,'seluruh chip topik tampil, tidak dibatasi dua');
  assert.equal(await evaluate(`[...document.querySelectorAll('tbody .review-text')].every(e=>e.scrollHeight<=e.clientHeight+1)`),true,'isi teks ulasan tidak terpotong di selnya');
  await evaluate(`document.querySelector('#page-size').value='10';document.querySelector('#page-size').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('tbody td:last-child')).textAlign`),'right','kolom aksi rata kanan');
  assert.match(await evaluate(`[...document.querySelectorAll('#tag-filter option')].map(o=>o.textContent).join('|')`),/Pendaftaran \(\d+\)/,'dropdown topik menampilkan jumlah nyata');
  assert.match(await evaluate(`document.querySelector('#page-size option').textContent`),/^\d+ baris$/);
  assert.deepEqual(await evaluate(`['#tag-filter','#page-size'].map(s=>{const e=document.querySelector(s);return Math.max(0,e.scrollWidth-e.clientWidth);})`),[0,0],'teks dropdown tidak terpotong');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#tag-filter')).getPropertyValue('-webkit-appearance')`),'none','panah dropdown bawaan sistem diganti');
  await evaluate(`document.querySelector('#review-search').value='Bos AteQ';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  assert.match(await evaluate(`document.querySelector('tbody').textContent`),/Bos AteQ/);
  assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/64 teks ulasan tersimpan/);
  assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/Play Store: 55 ulasan tertulis · 74 penilaian halaman toko/);
  for (const author of seedReviews.map(r=>r.author)) {
    await evaluate(`document.querySelector('#review-search').value=${JSON.stringify(author)};document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
    const found=await evaluate(`new Promise(resolve=>{const end=Date.now()+2500;function check(){const body=document.querySelector('tbody');if(body&&body.textContent.includes(${JSON.stringify(author)}))resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check);}check();})`);
    assert.equal(found,true,`Author not searchable: ${author}`);
  }
  completed.push('Analysis drivers, review detail, pagination, data-scope note and all 64 author searches');
  await evaluate(`document.querySelector('#review-search').value='Bos AteQ';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  await evaluate(`window.__downloadText=null;window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{blob.text().then(t=>window.__downloadText=t);return window.__createObjectURL(blob)};window.__anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)window.__anchorClick.call(this)};`);
  await click('[data-action="export"]');
  await evaluate(`new Promise(resolve=>{const check=()=>window.__downloadText!==null?resolve(true):requestAnimationFrame(check);check();})`);
  const csv=await evaluate('window.__downloadText');assert.match(csv,/Bos AteQ/);assert.doesNotMatch(csv,/Tanamo/);
  completed.push('CSV export respects current search and filters');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="import"],input[type="file"],#import-dialog').length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('.heading-actions button').length`),0);
  await click('[data-view="platforms"]');
  assert.equal(await evaluate(`document.querySelectorAll('.heading-actions button').length`),1);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.btn-primary')).borderRadius`),'4px');
  collectorMode='wait';await click('[data-action="analyze"]');
  assert.equal(await evaluate(`document.querySelector('[data-action="analyze"]').disabled`),true);
  // Modal progres: satu baris per kanal yang punya konektor, kanal tanpa konektor tidak ikut.
  assert.equal(await evaluate(`document.querySelector('#pull-dialog').open`),true,'modal progres muncul saat penarikan berjalan');
  assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row').length`),8,'hanya kanal berkonektor yang diantrikan');
  assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row.is-diproses').length`),1,'satu kanal diproses pada satu waktu');
  assert.match(await evaluate(`document.querySelector('#pull-dialog .pull-row.is-diproses').textContent`),/Google Play/);
  assert.equal(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-row')].some(row=>/Forum|Blog|Berita/.test(row.textContent))`),false,'kanal tanpa konektor tidak pernah dilaporkan sebagai nol');
  while(!releasePull)await new Promise(resolve=>setImmediate(resolve));
  await click('[data-view="reviews"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="analyze"]').length`),0);
  assert.match(await evaluate(`document.querySelector('tbody').textContent`),/Bos AteQ/);
  await click('[data-view="platforms"]');
  assert.equal(await evaluate(`document.querySelector('[data-action="analyze"]').disabled`),true);
  assert.equal(pulls,1);releasePull();
  const pullReady=()=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;function check(){if(!document.querySelector('[data-action="analyze"]').disabled)resolve(true);else if(Date.now()>end)reject(Error('Pull did not finish'));else requestAnimationFrame(check);}check();})`);
  await pullReady();
  assert.match(await evaluate(`document.querySelector('#toast').textContent`),/Tarik Analisis selesai sebagian · 0 ulasan baru · 0 diperbarui · 64 tidak berubah\. 2 dari 11 sumber berhasil dibaca/);
  assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row.is-selesai').length`),2,'kanal yang mengembalikan hasil ditandai selesai');
  assert.match(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-row')].find(row=>/Google Play/.test(row.textContent)).textContent`),/55 ulasan tertulis unik/,'baris kanal memuat pesan nyata dari sumber');
  // Kartu per kanal: nama + chip status, pesan nyata, jumlah teks, dan panel metadata dari cakupan sumber.
  assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row.is-selesai .pull-meta').length`),2,'kanal yang selesai menampilkan panel metadata');
  assert.match(await evaluate(`document.querySelector('#pull-dialog .pull-row.is-selesai .pull-meta').textContent`),/Analisis bahasa\s*ID 38 · EN 17/,'metadata menyalin cakupan nyata dari sumber');
  assert.match(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-row')].find(r=>/Google Play/.test(r.textContent)).textContent`),/Ulasan publik:\s*55 teks/);
  assert.match(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-row')].find(r=>/App Store/.test(r.textContent)).textContent`),/Penilaian halaman toko\s*17 · 8 tanpa teks/);
  assert.equal(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-row.is-selesai')].every(r=>r.querySelectorAll('.pull-chip').length===2)`),true,'kepala dan kaki kartu kanal selesai diberi chip status');
  // Diambil tanpa jeda helper karena modal menutup otomatis 2,5 detik setelah selesai.
  { const shot=await send('Page.captureScreenshot',{format:'png'}); await writeFile(new URL('pull-progress.png',output),Buffer.from(shot.data,'base64')); }
  await click('#pull-dialog [data-close="pull-dialog"]');
  await click('[data-view="reviews"]');assert.match(await evaluate(`document.querySelector('tbody').textContent`),/Bos AteQ/);
  assert.equal(await evaluate(`document.querySelectorAll('.data-note,.local-card,.snapshot-indicator').length`),0);
  const pullFromPlatform=async()=>{
    const view=await evaluate(`document.querySelector('.nav-item[aria-current="page"]').dataset.view`);
    await click('[data-view="platforms"]');
    await click('[data-action="analyze"]');
    await pullReady();
    // Modal progres tetap menampilkan hasil tiap kanal, lalu ditutup sebelum pemeriksaan lain.
    assert.equal(await evaluate(`document.querySelector('#pull-dialog').open`),true,'modal tetap terbuka sampai penarikan selesai');
    assert.match(await evaluate(`document.querySelector('#pull-dialog .pull-progress').textContent`),/dari 8 kanal diperiksa/);
    assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row').length`),8,'satu baris per kanal berkonektor');
    assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row.is-diproses').length`),0,'tidak ada kanal yang masih berstatus diproses');
    await click('#pull-dialog [data-close="pull-dialog"]');
    assert.equal(await evaluate(`document.querySelector('#pull-dialog').open`),false,'modal dapat ditutup manual');
    if(view!=='platforms')await click(`[data-view="${view}"]`);
  };
  completed.push('Platform-only online pull, loading lock across navigation and preserved filters');
  await click('[data-view="overview"]');
  const complaintRows=await evaluate(`[...document.querySelectorAll('.complaint-row')].map(r=>({id:r.querySelector('[data-complaint]').dataset.complaint,rank:r.querySelector('.complaint-rank').textContent,count:r.querySelector('.feature-row-label strong').textContent,negative:parseFloat(r.querySelector('.feature-bar .negative').style.width)}))`);
  assert.deepEqual(complaintRows.map(r=>r.id),['onboarding','migration','notifications','login','general','transactions','settlement','features','performance','support']);
  assert.equal(complaintRows[0].rank,'1');assert.match(complaintRows[0].count,/^8 negatif · 8 ulasan$/);
  assert.deepEqual(complaintRows.map(r=>Number(r.negative.toFixed(3))),[100,100,80,100,14.286,42.857,42.857,40,50,66.667],'segmen sentimen memakai proporsi seluruh ulasan pada area yang sama');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.complaint-row')).display`),'grid');
  assert.equal(await evaluate(`document.querySelector('.complaint-row .feature-bar').getBoundingClientRect().width>0`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.complaint-list .legend-swatch').length`),4,'legenda sentimen dipakai ulang pada kartu keluhan');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.sample-rating')).display`),'grid');
  assert.equal(await evaluate(`document.querySelectorAll('.sample-rating .rating-distribution').length`),1,'satu grafik penilaian, tidak ada blok ganda');
  assert.equal(await evaluate(`document.querySelector('.sample-rating h2').textContent`),'Penilaian bintang pada ulasan','filter gabungan lintas platform memakai angka ulasan tertulis');
  await click('[data-platform="play"]');
  assert.equal(await evaluate(`document.querySelectorAll('.sample-rating .rating-distribution').length`),1,'tetap satu grafik saat filter satu platform toko');
  assert.equal(await evaluate(`document.querySelector('.sample-rating h2').textContent`),'Penilaian bintang Play Store','judul kartu menyebut halaman toko yang sedang dibaca');
  assert.match(await evaluate(`document.querySelector('.sample-rating p').textContent`),/^4,0 \/ 5 · 75 penilaian/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.sample-rating .rating-row strong')].map(e=>Number(e.textContent))`),[52,3,2,4,14],'angka tampil persis seperti yang dipublikasikan halaman toko');
  assert.match(await evaluate(`document.querySelector('.sample-rating small').textContent`),/75 penilaian di halaman toko, termasuk 20 tanpa teks publik/);
  assert.match(await evaluate(`document.querySelector('.sample-rating small').textContent`),/Analisis sentimen memakai 55 ulasan berteks/);
  await evaluate(`document.querySelector('.sample-rating').scrollIntoView({block:'center'})`);
  await screenshot('store-rating-play.png');
  await click('[data-platform="all"]');
  assert.equal(await evaluate(`document.querySelectorAll('.grid-complaint > .card').length`),2,'kartu keluhan dan proyeksi berdampingan pada ringkasan');
  assert.equal(await evaluate(`document.querySelector('.projection-card h2').textContent`),'Proyeksi 4 pekan ke depan');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.projection-stats strong')].map(e=>e.textContent)`),['11','-10,0'],'volume negatif dan NSS proyeksi memakai angka hasil perhitungan');
  assert.match(await evaluate(`document.querySelectorAll('.projection-stats small')[0].textContent`),/rentang 4–18 · 11 tercatat pada 4 pekan terakhir/);
  assert.match(await evaluate(`document.querySelectorAll('.projection-stats small')[1].textContent`),/rentang -71,4 s\.d\. \+57,9 · NSS saat ini \+29,7/);
  assert.equal(await evaluate(`document.querySelector('.projection-card .badge').textContent`),'Belum ada perubahan yang dapat dinyatakan','arah hanya dinyatakan bila kemiringan meyakinkan');
  const projections=await evaluate(`[...document.querySelectorAll('.projection-row')].map(r=>({name:r.querySelector('.projection-name').textContent.replace(/[▲▼■]/,'').trim(),count:r.querySelector('.feature-row-label strong').textContent,recorded:parseFloat(r.querySelector('.recorded').style.width),forecast:parseFloat(r.querySelector('.forecast').style.width),meta:r.querySelector('.projection-meta').textContent}))`);
  assert.deepEqual(projections.map(p=>p.name),['Akses & performa aplikasi','Notifikasi & pembaruan laporan','Migrasi kurang jelas','Transaksi dan penerimaan pembayaran','Pendaftaran belum tuntas','Penanganan layanan']);
  assert.equal(projections[0].count,'5 proyeksi · 0–10');
  assert.deepEqual([Number(projections[0].recorded.toFixed(3)),Number(projections[0].forecast.toFixed(3))],[50,50],'batang membandingkan pekan terakhir dan proyeksi pada skala yang sama');
  assert.match(projections[0].meta,/Relatif tetap · laju 1,3 ulasan negatif per pekan · penanggung jawab: Rekayasa · Penjaminan mutu/);
  assert.match(await evaluate(`document.querySelector('.projection-card .note-inline').textContent`),/kemiringan deret positif maupun negatif belum melampaui ambang \|t\| ≥ 2/);
  assert.match(await evaluate(`document.querySelector('.projection-card .chart-notes').textContent`),/regresi kuadrat terkecil/);
  assert.match(await evaluate(`document.querySelector('.projection-card .chart-notes').textContent`),/Poisson/);
  assert.match(await evaluate(`document.querySelector('.projection-card .chart-notes').textContent`),/bukan model bahasa/);
  await click('[data-complaint="general"]');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),3);
  await click('[data-view="overview"]');
  await click('[data-complaint="onboarding"]');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),8);
  await click('[data-view="overview"]');await click('[data-platform="appstore"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-complaint]').length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('.projection-row').length`),0,'proyeksi tidak dibuat dari data yang belum cukup');
  assert.match(await evaluate(`document.querySelector('.projection-card .empty-state p').textContent`),/pekan memuat ulasan bertanggal|masih sedikit|belum ada ulasan bertanggal/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.sample-rating > .rating-distribution .rating-row')].filter(e=>e.querySelector('strong').textContent==='0').map(e=>e.querySelector('.rating-track span').getBoundingClientRect().width)`),[0,0,0],'tiga bintang kosong App Store berukuran nol');
  await click('[data-platform="all"]');completed.push('Complaint chart reusing the topic bar grammar, projection card with Poisson range, exact drilldown and zero-value bars');
  assert.equal(await evaluate(`document.querySelector('.summary-card h2').textContent`),'Ringkasan eksekutif');
  assert.match(await evaluate(`document.querySelector('.summary-main').textContent`),/Dari 64 ulasan berlabel pada pilihan ini, 64,1% bernada positif dan 34,4% negatif dengan skor sentimen neto \+29,7 poin\./,'kalimat ringkasan memakai angka hasil perhitungan');
  assert.match(await evaluate(`document.querySelector('.summary-main').textContent`),/Pendorong negatif utama: Masuk, OTP & keamanan akun \(63,6% dari 22 ulasan negatif\)/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.summary-chips .chip-intent')].map(e=>e.textContent)`),['Laporan bug 5','Permintaan fitur 0','Marah 0','Frustrasi 10','5 klaster keluhan berulang']);
  assert.match(await evaluate(`document.querySelector('.summary-note').textContent`),/bukan model bahasa/,'sumber ringkasan dinyatakan terbuka');
  const expectedClusters=clusterStats(seedReviews,'negative').map(c=>c.id);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.cluster-row [data-cluster]')].map(b=>b.dataset.cluster)`),expectedClusters,'klaster hanya menampilkan frasa yang benar-benar cocok');
  assert.match(await evaluate(`document.querySelector('.cluster-row').textContent`),/\d+ negatif · \d+ teks/);
  await click('[data-cluster="login-blocked"]');
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),1,'drill-down klaster membuka ulasan sumber');
  assert.match(await evaluate(`document.querySelector('.active-filter').textContent`),/Klaster keluhan: Tidak bisa masuk/);
  await click('[data-view="overview"]');
  assert.equal(await evaluate(`document.querySelectorAll('.sov-card .distribution-item').length`),2,'pangsa kanal hanya menampilkan kanal berisi data');
  assert.match(await evaluate(`document.querySelector('.sov-card').textContent`),/85,9%/);
  assert.match(await evaluate(`document.querySelector('.sov-card .note-inline').textContent`),/bukan perbandingan popularitas aplikasi|bukan pangsa seluruh percakapan/,'pangsa kanal diberi batas baca');
  await evaluate(`(() => { const s=document.querySelector('#trend-mode'); s.value='line'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate(`document.querySelectorAll('.chart-body .trend-svg path').length`),1,'garis skor sentimen digambar');
  assert.equal(await evaluate(`document.querySelectorAll('.chart-body .trend-svg circle').length`)>0,true,'titik per periode tersedia dengan nilai pada title');
  assert.equal(await evaluate(`document.querySelectorAll('.chart-body .trend-svg text').length>=5`),true,'sumbu nilai ditandai');
  await evaluate(`(() => { const s=document.querySelector('#trend-mode'); s.value='week'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate(`document.querySelectorAll('.chart-body .trend-svg rect').length>0`),true,'mode batangan kembali tersedia');
  completed.push('Executive summary, keyword clusters with drilldown, share of voice, and NSS line mode');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.card')).animationName`),'none');
  await click('[data-view="overview"]');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.card')).animationName`),'none');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.complaint-row .feature-bar span')).animationName`),'none');
  assert.equal(await evaluate(`new Set([...document.querySelectorAll('.chart-body .legend-swatch')].map(e=>getComputedStyle(e).backgroundColor)).size`),4);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.feature-bar .unclassified')).backgroundColor`),'rgb(41, 156, 219)');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.chart-body .legend-swatch')].map(e=>getComputedStyle(e).backgroundColor)`),['rgb(10, 179, 156)','rgb(240, 101, 72)','rgb(135, 138, 153)','rgb(41, 156, 219)']);
  const noClip=selector=>evaluate(`[...document.querySelectorAll('${selector}')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim().slice(0,40))`);
  assert.deepEqual(await noClip('.metric-label,.card h2,.complaint-row .btn-text,.projection-name,.driver h3,.platform-tab,.badge,.priority-count'),[],'teks terpotong di ringkasan');
  await screenshot('dashboard-desktop.png');
  await click('[data-view="platforms"]');assert.equal(await evaluate(`document.querySelectorAll('.coverage-card').length`),11);
  assert.match(await evaluate(`[...document.querySelectorAll('.coverage-card')].find(c=>c.textContent.includes('Google Play')).textContent`),/Unduhan dipublikasikan\s*10K\+ · rentang Google/);
  assert.match(await evaluate(`[...document.querySelectorAll('.coverage-card')].find(c=>c.textContent.includes('Apple App Store')).textContent`),/Unduhan dipublikasikan\s*Tidak dipublikasikan/);
  assert.deepEqual(await noClip('.coverage-card h3,.source-facts dt,.source-facts dd,.coverage-state,.source-message'),[],'teks terpotong di cakupan platform');
  await click('[data-platform="instagram"]');assert.equal(await evaluate(`document.querySelectorAll('.coverage-card').length`),1);
  assert.match(await evaluate(`document.querySelector('.coverage-card h3').textContent`),/Instagram/);
  await click('[data-platform="youtube"]');
  assert.match(await evaluate(`document.querySelector('.coverage-state').textContent`),/Perlu konfigurasi API/);
  assert.match(await evaluate(`document.querySelector('.source-message').textContent`),/YOUTUBE_API_KEY/);
  assert.equal(await evaluate(`document.querySelector('.coverage-card').classList.contains('is-unavailable')`),true);
  assert.match(await evaluate(`document.querySelector('.coverage-intro').textContent`),/bukan analisis media sosial/);
  await click('[data-view="overview"]');assert.deepEqual(await metricValues(),['—','—','—','—']);
  assert.match(await evaluate(`document.querySelector('.classification-note').textContent`),/Tidak tersedia bukan berarti nol keluhan/);
  await click('[data-view="platforms"]');await click('[data-platform="all"]');await screenshot('platform-coverage.png');
  const storeLayout=await evaluate(`[...document.querySelectorAll('[data-source-card="play"],[data-source-card="appstore"]')].map(card=>({
    metrics:[...card.querySelectorAll('.coverage-stats strong')].map(e=>e.textContent),
    metricsTop:card.querySelector('.coverage-stats').getBoundingClientRect().top,
    titleRight:card.querySelector('.coverage-title').getBoundingClientRect().right,
    statusLeft:card.querySelector('.coverage-state').getBoundingClientRect().left,
    ratingSections:card.querySelectorAll('.coverage-rating-panel > .coverage-rating').length,
    ratings:card.querySelector('.coverage-rating-panel').textContent,
    histogramRows:card.querySelectorAll('.listing-histogram .rating-row').length,
    scoreColor:getComputedStyle(card.querySelector('.coverage-score')).color,
    totalColor:getComputedStyle(card.querySelector('.coverage-stats strong')).color,
    factsSeparated:[...card.querySelectorAll('.source-facts > div')].every(row=>row.querySelector('dt').getBoundingClientRect().right<=row.querySelector('dd').getBoundingClientRect().left)
  }))`);
  assert.deepEqual(storeLayout.map(card=>card.metrics),[['55','+18,2'],['9','+100,0']]);
  assert.ok(Math.abs(storeLayout[0].metricsTop-storeLayout[1].metricsTop)<1,'Store metrics must align across cards');
  for(const card of storeLayout){assert.ok(card.statusLeft>=card.titleRight);assert.equal(card.ratingSections,2);assert.notEqual(card.scoreColor,card.totalColor);assert.equal(card.factsSeparated,true);}
  assert.match(storeLayout[0].ratings,/3,64 \/ 5.*dari 55 ulasan/s);
  assert.match(storeLayout[0].ratings,/4,0 \/ 5.*74 penilaian halaman toko/s);
  assert.equal(storeLayout[0].histogramRows,5,'histogram halaman toko Play Store menampilkan lima baris bintang');
  assert.match(storeLayout[0].ratings,/5 ★\s*52/,'jumlah bintang lima halaman toko tampil apa adanya termasuk yang tanpa teks');
  assert.match(storeLayout[0].ratings,/1 ★\s*14/);
  assert.equal(storeLayout[1].histogramRows,5);
  assert.match(storeLayout[1].ratings,/5 ★\s*16/);
  assert.equal(await evaluate(`document.querySelectorAll('.is-unavailable .coverage-rating-panel').length`),0);
  await evaluate(`document.querySelector('[data-source-card="play"] .coverage-scope summary').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate(`document.querySelector('[data-source-card="play"] .coverage-scope').open`),true);
  assert.equal(await evaluate(`document.querySelector('[data-source-card="play"] .source-message').checkVisibility()`),true);
  assert.match(await evaluate(`document.querySelector('[data-source-card="play"] .source-message').textContent`),/tidak berarti seluruh percakapan di internet/);
  assert.match(await evaluate(`[...document.querySelectorAll('[data-source-card="play"] .source-facts dd')].map(e=>e.textContent).join(' | ')`),/2 halaman, 55 baris, tanpa batas sampel/);
  assert.match(await evaluate(`[...document.querySelectorAll('[data-source-card="appstore"] .source-facts dd')].map(e=>e.textContent).join(' | ')`),/halaman ulasan 1 halaman, feed resmi 1 halaman, 9 ulasan dikonfirmasi dua jalur/);
  await click('[data-source-card="play"] .coverage-scope summary');
  await click('[data-view="overview"]');
  completed.push('Compact Platform cards align headers and metrics, separate ratings, and retain keyboard-accessible source scope');
  completed.push('Unconfigured social access is unavailable, not zero complaints or complete collection');
  for (const width of [1920,1440,1280,1024,768,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
    for (const view of ['overview','sentiment','reviews','platforms']) {
      await click(`[data-view="${view}"]`);
      assert.equal(await evaluate(`document.activeElement.tagName`),'H1');
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,`${view} overflows at ${width}px`);
      assert.equal(await evaluate(`new Set([...document.querySelectorAll('.platform-tab')].map(e=>Math.round(e.getBoundingClientRect().top))).size`),1,`${view}: platform rows at ${width}px`);
      assert.equal(await evaluate(`document.querySelectorAll('.platform-tab').length`),12);
      assert.deepEqual(await noClip('.metric-label,.card h2,.complaint-row .btn-text,.feature-row-label strong,.projection-name,.projection-stats span,.projection-stats strong,.projection-stats small,.driver h3,.source-facts dt,.source-facts dd,.platform-tab,.badge,.priority-count,.distribution-item'),[],`${view}: clipped text at ${width}px`);
      if(width<=480&&(view==='overview'||view==='sentiment'))assert.equal(await evaluate(`(() => {const values=[...document.querySelectorAll('.metric-value')].map(e=>e.offsetTop);return Math.abs(values[0]-values[1])<1&&Math.abs(values[2]-values[3])<1;})()`),true,`${view}: metric alignment at ${width}px`);
      assert.equal(await evaluate(`document.querySelectorAll('#period').length`),1);
      assert.equal(await evaluate(`document.querySelectorAll('.heading-actions #period').length`),1);
      assert.equal(await evaluate(`document.querySelectorAll('[data-action="analyze"]').length`),view==='platforms'?1:0,`${view}: pull action visibility at ${width}px`);
      assert.deepEqual(await noClip('.heading-actions,.range-button,.heading-actions .btn'),[],`${view}: heading controls clipped at ${width}px`);
      assert.equal(await evaluate(`document.querySelector('.range-button').getBoundingClientRect().bottom<=document.querySelector('.platform-filter').getBoundingClientRect().top`),true,`${view}: period belongs above platform tabs at ${width}px`);
      if(view==='platforms') {
        const aligned=await evaluate(`(() => {const period=document.querySelector('.range-button').getBoundingClientRect(),pull=document.querySelector('[data-action="analyze"]').getBoundingClientRect();return {beside:pull.left>=period.right-1&&Math.abs(pull.top-period.top)<1,below:pull.top>=period.bottom};})()`);
        assert.equal(width>480?aligned.beside:aligned.beside||aligned.below,true,`Date and pull action alignment at ${width}px`);
      }
      const selected=await evaluate(`(() => { const last=document.querySelector('.platform-tabs .platform-tab:last-child');const id=last.dataset.platform;last.focus({preventScroll:true});last.click();return id; })()`);
      assert.equal(await evaluate(`document.activeElement.dataset.platform`),selected);
      assert.equal(await evaluate(`(() => {const selected=document.querySelector('.platform-tab.active').getBoundingClientRect(),tabs=document.querySelector('.platform-tabs').getBoundingClientRect();return selected.left>=tabs.left-1&&selected.right<=tabs.right+1;})()`),true,`${view}: selected platform hidden at ${width}px`);
      await click('[data-platform="all"]');
      if(view==='overview')assert.equal(await evaluate(`document.querySelector('.projection-meta').getBoundingClientRect().height>0`),true,`${view}: keterangan proyeksi tidak tersembunyi di ${width}px`);
      if(view==='reviews') {
        assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/kelengkapan seluruh ulasan di internet belum dapat dipastikan/);
        assert.doesNotMatch(await evaluate(`document.querySelector('.scope-note').textContent`),/Seluruh teks publik yang dapat diakses telah dimuat/);
        assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.unfilled-stars')).color`),await evaluate(`getComputedStyle(document.querySelector('.stars')).color`));
        if(width===1440)await screenshot('reviews-desktop.png');
      }
      if(view==='platforms') {
        assert.equal(await evaluate(`[...document.querySelectorAll('.coverage-state')].every(e=>getComputedStyle(e.querySelector('.dot')).backgroundColor===getComputedStyle(e).color)`),true);
        assert.deepEqual(await noClip('.coverage-header,.coverage-title h3,.coverage-state,.coverage-rating-value,.coverage-rating h4,.coverage-stats small,.coverage-stats strong'),[],`Platform card clipping at ${width}px`);
        assert.equal(await evaluate(`[...document.querySelectorAll('.coverage-header')].every(header=>{const title=header.querySelector('.coverage-title').getBoundingClientRect(),status=header.querySelector('.coverage-state').getBoundingClientRect();return status.left>=title.right-1||status.top>=title.bottom-1;})`),true,`Platform header overlap at ${width}px`);
        if(width<=390)assert.equal(await evaluate(`[...document.querySelectorAll('.is-unavailable .coverage-header')].every(header=>header.querySelector('.coverage-state').getBoundingClientRect().top>=header.querySelector('.coverage-title').getBoundingClientRect().bottom)`),true,`Long source status must sit below mobile title at ${width}px`);
      }
    }
  }
  await click('[data-view="overview"]');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click('[data-view="overview"]');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.complaint-row .feature-bar span')).animationName`),'none');
  // Tombol geser dihapus dan scrollbar disembunyikan di seluruh menu; baris platform
  // tetap dapat digulir dengan keyboard.
  assert.equal(await evaluate(`document.querySelectorAll('[data-scroll-platforms]').length`),0,'tombol geser tidak dipakai lagi');
  assert.deepEqual(await evaluate(`['#platform-tabs','.table-wrap','.chart-body'].map(s=>{const e=document.querySelector(s);return e.offsetHeight-e.clientHeight;})`),[0,0,0],'tidak ada scrollbar yang mengambil ruang tampilan');
  // Tanpa tombol geser, tab yang mendapat fokus keyboard tetap ikut terlihat.
  assert.equal(await evaluate(`(()=>{const tabs=document.querySelector('#platform-tabs');tabs.scrollLeft=0;const last=tabs.lastElementChild;last.focus({preventScroll:true});last.scrollIntoView({block:'nearest',inline:'nearest'});const a=last.getBoundingClientRect(),b=tabs.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})()`),true,'tab terakhir ikut terlihat saat mendapat fokus keyboard');
  await evaluate(`document.querySelector('#platform-tabs').scrollLeft=0`);
  assert.equal(await evaluate(`document.querySelector('#platform-tabs').scrollLeft`),0);
  assert.equal(await evaluate(`document.querySelector('.chart-body').tabIndex`),0);
  await evaluate(`document.querySelector('.chart-body').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert.equal(await evaluate(`new Promise(resolve=>{const end=Date.now()+2000;function check(){if(document.querySelector('.chart-body').scrollLeft>0)resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check);}check();})`),true);
  await evaluate(`document.querySelector('[data-platform="all"]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate(`document.activeElement.dataset.platform`),'play');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate(`document.querySelector('.platform-tab.active').dataset.platform`),'play');
  assert.equal(await evaluate(`document.activeElement.dataset.platform`),'play');
  await click('[data-platform="all"]');
  await send('Emulation.setEmulatedMedia',{features:[]});
  completed.push('All four menus at seven widths, single-row platform controls, keyboard operation, semantic colors and reduced motion');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.reload');await ready();
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#sidebar .nav-item')].map(e=>e.getAttribute('aria-label'))`),navigationLabels);
  assert.equal(await evaluate(`document.querySelectorAll('[data-view="methodology"],.profile,.profile-avatar,.avatar-light,.sidebar-bottom').length`),0);
  await click('[data-view="reviews"]');
  assert.equal(await evaluate(`document.querySelector('h1').textContent`),'Review');
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),10);
  await click('[data-view="platforms"]');
  assert.equal(await evaluate(`document.querySelector('h1').textContent`),'Platform');
  assert.equal(await evaluate(`document.querySelectorAll('.coverage-card').length`),11);
  await screenshot('platform-mobile.png');
  await click('[data-view="overview"]');
  assert.equal(await evaluate(`document.querySelector('.breadcrumb strong').textContent`),'Dashboard');
  await click('[data-platform="play"]');
  assert.equal(await evaluate(`document.querySelectorAll('.sample-rating .rating-distribution').length`),1,'tetap satu grafik pada layar sempit');
  assert.equal(await evaluate(`document.querySelectorAll('.sample-rating .rating-row').length`),5,'lima baris bintang tampil di layar sempit');
  assert.equal(await evaluate(`document.documentElement.scrollWidth`),390,'tidak ada overflow horizontal pada layar 390px');
  await click('[data-platform="all"]');
  assert.equal(await evaluate(`document.documentElement.scrollWidth`),390);
  assert.equal(await evaluate(`window.innerWidth`),390);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.complaint-row')).display`),'grid');
  assert.equal(await evaluate(`document.querySelector('.complaint-row .feature-bar').getBoundingClientRect().width>0`),true);
  await screenshot('dashboard-mobile.png');completed.push('Platform coverage and mobile layout without page overflow');
  collectorMode='new';await pullFromPlatform();
  assert.equal((await metricValues())[0],'65');
  await pullFromPlatform();assert.equal((await metricValues())[0],'65');
  await send('Page.reload');await ready();
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;function check(){if(document.querySelector('.metric-value').textContent==='65')resolve(true);else if(Date.now()>end)reject(Error('Stored data not loaded'));else requestAnimationFrame(check);}check();})`);
  await click('[data-view="reviews"]');
  await evaluate(`document.querySelector('#review-search').value='QA <img';document.querySelector('#review-search').dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`new Promise(resolve=>{const check=()=>document.querySelectorAll('tbody tr').length===1?resolve(true):requestAnimationFrame(check);check();})`);
  await click('[data-review]');assert.equal(await evaluate(`document.querySelector('.detail-text').textContent.includes('<script>')`),true);
  assert.equal(await evaluate('Boolean(window.__xss)'),false);assert.equal(await evaluate(`document.querySelectorAll('#detail-dialog script,#detail-dialog img').length`),0);
  assert.match(await evaluate(`document.querySelector('.detail-author').textContent`),/N\/A/);
  await click('[data-close="detail-dialog"]');await click('[data-view="overview"]');
  collectorMode='error';await pullFromPlatform();
  assert.equal((await metricValues())[0],'65');assert.match(await evaluate(`document.querySelector('#toast').textContent`),/Tarik Analisis gagal/);
  await click('[data-view="platforms"]');assert.match(await evaluate(`document.querySelector('.coverage-grid').textContent`),/Koneksi uji gagal/);
  assert.equal(await evaluate(`document.querySelector('[data-source-card="play"] .source-message').checkVisibility()`),true,'Failed source status must not be collapsed');
  await click('[data-view="reviews"]');assert.match(await evaluate(`document.querySelector('.scope-note').textContent`),/Gagal/);
  assert.doesNotMatch(await evaluate(`document.querySelector('.scope-note').textContent`),/Seluruh teks publik yang dapat diakses telah dimuat/);
  completed.push('Online batch deduplication, server persistence, missing metadata, XSS escaping and persistent failed-refresh status');
  collectorMode='social';await pullFromPlatform();
  assert.doesNotMatch(await evaluate(`document.querySelector('#pull-dialog').textContent`),/facebook-pages-scraper|apidojo|run [A-Za-z0-9]{8,}/,'nama actor dan ID run tidak muncul di modal progres');
  assert.match(await evaluate(`[...document.querySelectorAll('#pull-dialog .pull-meta')].map(e=>e.textContent).join(' ')`),/Sumber\s*Hasil kueri publik via Apify/,'metadata kanal memakai label sumber yang dapat dibaca');
  await click('[data-view="overview"]');await click('[data-platform="youtube"]');
  assert.deepEqual(await metricValues(),['4','0,0%','100,0%','-100,0']);
  assert.match(await evaluate(`document.querySelector('.classification-note').textContent`),/1 teks di luar penilaian pelanggan/);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await click('[data-view="platforms"]');
  assert.match(await evaluate(`document.querySelector('.coverage-card').textContent`),/1 teks di luar penilaian pelanggan; 1 komentar belum jelas relevansinya/);
  // Kanal sosial yang menjawab tanpa satu pun teks: label, jejak paginasi, dan status kartu.
  await click('[data-platform="all"]');
  const facebookCard=`[...document.querySelectorAll('[data-source-card="facebook"]')].map(c=>c.textContent).join('')`;
  assert.match(await evaluate(facebookCard),/Terhubung · tanpa hasil/,'kanal tanpa hasil tidak diberi label "Berhasil"');
  assert.match(await evaluate(facebookCard),/batas hasil actor maxResult=20 \(belum tercapai\)/,'batas hasil actor dibaca dari input yang dikirim');
  assert.doesNotMatch(await evaluate(facebookCard),/tanpa batas/,'jejak Apify tidak boleh mengklaim tanpa batas');
  assert.match(await evaluate(`[...document.querySelectorAll('[data-source-card="facebook"] .coverage-rating')].map(e=>e.textContent).join(' ')`),/N\/A/,'kanal tanpa teks tidak mengarang penilaian bintang');
  await click('[data-open-platform="youtube"]');
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),4);
  await click('[data-review="youtube|yt-a"]');
  assert.equal(await evaluate(`document.querySelector('.detail-text').textContent`),'wondr merchant login gagal');
  assert.match(await evaluate(`document.querySelector('.dialog-body').textContent`),/Konteks video, bukan sentimen/);
  assert.match(await evaluate(`document.querySelector('.dialog-body').textContent`),/2026-10-23T12:30:00Z/);
  assert.equal(await evaluate(`document.querySelectorAll('#detail-dialog script').length`),0);
  assert.equal(await evaluate('Boolean(window.__xss)'),false);
  await click('[data-close="detail-dialog"]');
  await click('[data-review="youtube|yt-owner"]');
  assert.match(await evaluate(`document.querySelector('.dialog-body').textContent`),/Di luar penilaian pelanggan/);
  await click('[data-close="detail-dialog"]');
  collectorMode='social-missing';await pullFromPlatform();
  await click('[data-view="platforms"]');
  assert.match(await evaluate(`document.querySelector('.coverage-state').textContent`),/Perlu konfigurasi API/);
  assert.equal(await evaluate(`document.querySelector('.coverage-card').classList.contains('is-unavailable')`),false);
  assert.equal(await evaluate(`document.querySelector('.coverage-stats strong').textContent`),'4');
  await click('[data-view="overview"]');assert.deepEqual(await metricValues(),['4','0,0%','100,0%','-100,0']);
  await click('[data-platform="play"]');assert.equal((await metricValues())[0],'56');
  completed.push('Social fixtures preserve all IDs and context, exclude owner promotion from sentiment, and survive missing API access');
  // Pengambilan terakhir: hasil partial harus tetap terbaca sebagai sebagian, bukan "selesai".
  collectorMode='truncated';await pullFromPlatform();
  assert.equal(await evaluate(`document.querySelectorAll('#pull-dialog .pull-row.is-sebagian').length`),1,'kanal partial memakai status sendiri');
  assert.equal(await evaluate(`document.querySelector('#pull-dialog .pull-row.is-sebagian .pull-chip').textContent`),'Selesai sebagian');
  assert.match(await evaluate(`document.querySelector('#pull-dialog .pull-row.is-sebagian .pull-msg').textContent`),/Hasil belum lengkap; feed resmi masih mengirim penanda halaman lanjutan/,('keterangan pemotongan tidak boleh hilang karena pemenggalan kalimat'));
  await click('#pull-dialog [data-close="pull-dialog"]');
  completed.push('Partial pulls are labelled as incomplete and keep their truncation note');
  assert.deepEqual(errors,[]);completed.push('No browser runtime or console errors');
  console.log(JSON.stringify({passed:completed.length,tests:completed,screenshots:['dashboard-desktop.png','store-rating-play.png','pull-progress.png','sentiment-analysis.png','review-detail.png','reviews-desktop.png','platform-coverage.png','platform-mobile.png','dashboard-mobile.png']},null,2));
  await send('Browser.close',{},null);
} finally {
  if(socket?.readyState===WebSocket.OPEN)socket.close();
  if(chrome.exitCode===null)chrome.kill();
  for(const p of pending.values())clearTimeout(p.timer);
  await new Promise(resolve=>server.close(resolve));
  try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
