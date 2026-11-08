'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const out=path.resolve('artifacts/cloud-release/android-operator-final'),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe'),serial='RFCRC1R150K';
fs.mkdirSync(out,{recursive:true});const report={mode:'Local UI preview on physical Android; production API reads only',device:'Samsung SM-A326B',checks:[],screens:[],requests:[]};
let browser,page;
async function shot(name){const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,scrollWidth:document.documentElement.scrollWidth}));assert(geometry.scrollWidth<=geometry.width+1,'Horizontal overflow: '+name);fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16000000,windowsHide:true}));report.screens.push({name,...geometry});}
async function check(name,fn){const start=Date.now();await fn();report.checks.push({name,ms:Date.now()-start,status:'PASS'});}
(async()=>{try{
 const focus=execFileSync(adb,['-s',serial,'shell','dumpsys','window'],{encoding:'utf8',windowsHide:true});
 if(!/mCurrentFocus=.*com\.android\.chrome/.test(focus)||/mDreamingLockscreen=true/.test(focus))throw Error('Phone must be unlocked with Chrome in the foreground; no screenshots captured.');
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://flow.getritim.com/'));assert(page,'Open the app on the connected phone');
 page.on('response',r=>{if(r.url().includes('/api/v1/'))report.requests.push({path:new URL(r.url()).pathname,status:r.status()})});
 for(const file of ['integration/premium-api.js','integration/api-adapter.js','integration/drawing-viewer.mjs','assets/css/ux-premium-workspace.css'])await page.route('**/'+file+'*',r=>r.fulfill({path:file,contentType:file.endsWith('.css')?'text/css':'application/javascript'}));
 await check('reload',async()=>{await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.RitimPremiumAPI)});
 await check('active job',()=>page.evaluate(()=>RitimPremiumAPI.openAssigned('f916f68e-b516-4848-8085-a5772257cc96')));await page.evaluate(()=>scrollTo(0,0));await shot('01-active-job');
 assert(await page.locator('.operator-quantity-complete').isVisible());assert.equal((await page.locator('.operator-quality-help summary').innerText()).replace(/\s+/g,' '),'ⓘ Bekleyen kararları görüntüle');
 const navigationCount=await page.evaluate(()=>performance.getEntriesByType('navigation').length);const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
 const error=await page.locator('#api-alert').textContent().catch(()=>'');assert(!error?.includes('güvenle devam edemiyor'),error);
 await check('identifiers, quality alignment and waiting help',async()=>{
  await page.locator('.operator-identifiers summary').click();assert(await page.locator('.operator-identifiers dd').first().isVisible());await shot('10-job-identifiers');await page.locator('.operator-identifiers summary').click();
  const ys=await page.locator('.operator-quality-counts strong').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert(Math.max(...ys)-Math.min(...ys)<2,'Quality counts align');
  await page.locator('.operator-quality-help summary').click();assert(await page.locator('.operator-quality-help p').isVisible());await page.locator('.operator-quality-help p').scrollIntoViewIfNeeded();await shot('11-quality-help');await page.locator('.operator-quality-help summary').click();
 });
 await check('pause reason keyboard without saving',async()=>{
  const originalHeight=await page.evaluate(()=>visualViewport.height);
  await page.locator('.operator-pause-trigger').click();
  assert(await page.locator('[data-pause-submit]').isDisabled(),'No pause without a reason');
  await page.locator('.operator-pause-reasons button').filter({hasText:'Malzeme bekleniyor'}).click();
  assert.equal(await page.locator('.operator-pause-reasons [aria-pressed=true]').count(),1);assert(await page.locator('[data-pause-submit]').isEnabled());
  await shot('12-pause-selected');
  const field=page.locator('#api-pause-reason');await field.scrollIntoViewIfNeeded();const rect=await field.boundingBox();assert(rect,'Pause reason field visible');
  const touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await field.fill('Telefon ekran testi');await page.waitForFunction(h=>visualViewport.height<h-100,originalHeight);await page.waitForFunction(()=>{const r=document.querySelector('.operator-pause-footer').getBoundingClientRect();return r.bottom<=visualViewport.offsetTop+visualViewport.height&&r.top>=visualViewport.offsetTop});await shot('09-pause-keyboard');
  execFileSync(adb,['-s',serial,'shell','input','keyevent','KEYCODE_BACK'],{windowsHide:true});await page.locator('#operator-pause-dialog').evaluate(d=>d.close());await touch.detach();
 });
 await check('drawing job',()=>page.evaluate(()=>RitimPremiumAPI.openAssigned('4d66f41a-8d31-488a-80ec-f47990936623')));await page.evaluate(()=>scrollTo(0,0));await shot('02-completed-job');
 assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin,'Switch does not reload document');assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),navigationCount);
 const pdf=require('../../tests/fixtures/technical-pdf.cjs')().toString('base64');
 await check('three-page technical drawing',()=>page.evaluate(async pdf=>{const d=document.getElementById('api-drawing-dialog');if(!d)throw Error('Drawing dialog missing');d.showModal();const {mount}=await import('/integration/drawing-viewer.mjs');await mount(document.getElementById('drawing-renderer'),pdf,()=>{});},pdf));
 assert.equal(await page.locator('.drawing-page').innerText(),'1 / 3');await shot('03-pdf-fit');
 await check('PDF page navigation',async()=>{await page.locator('[data-action=next]').click();await page.waitForFunction(()=>document.querySelector('.drawing-page').textContent==='2 / 3');await page.locator('[data-action=next]').click();await page.waitForFunction(()=>document.querySelector('.drawing-page').textContent==='3 / 3');assert(await page.locator('[data-action=next]').isDisabled());await page.locator('[data-action=prev]').click();await page.waitForFunction(()=>document.querySelector('.drawing-page').textContent==='2 / 3')});await shot('04-pdf-page-two');
 await page.locator('[data-action=expand]').click();await page.waitForFunction(()=>document.querySelector('#api-drawing-dialog').classList.contains('is-expanded'));await shot('05-pdf-expanded');
 const toolbar=await page.locator('.drawing-tools').boundingBox();assert(toolbar.height<=48,'Fullscreen toolbar stays in one row');assert(await page.locator('.drawing-tools [data-action=close]').isVisible());
 const session=await page.context().newCDPSession(page),view=page.locator('.drawing-viewport');const b=await view.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,before=await page.locator('canvas').evaluate(c=>c.width);
 await check('native two-finger pinch',async()=>{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-25-i*14,y,id:1},{x:x+25+i*14,y,id:2}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(w=>document.querySelector('canvas').width>w,before)});await shot('06-pdf-pinched');
 await check('native drawing pan',async()=>{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+65,y:y+70,id:1}]});for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+65-i*20,y:y+70-i*20,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await view.evaluate(v=>v.scrollTop>0||v.scrollLeft>0))});await shot('07-pdf-panned');
 await page.locator('.drawing-zoom').click();await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c.dataset.rendered==='true'&&c.getBoundingClientRect().height<c.parentElement.clientHeight});await shot('08-pdf-refit');
 await page.locator('#api-drawing-dialog').evaluate(d=>d.close());
 report.status='PASS';
 }catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}finally{
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Android operatör doğrulaması</title><style>body{font:16px system-ui;color:#193650;max-width:1000px;margin:30px auto}img{max-width:100%;width:360px}article{display:inline-block;vertical-align:top;margin:12px}</style><h1>Android operatör doğrulaması</h1><p>'+report.status+' · Yerel arayüz, fiziksel Samsung A32; canlı API yalnız okunur.</p><pre>'+JSON.stringify(report.checks,null,2)+'</pre>'+report.screens.map(s=>'<article><h2>'+s.name+'</h2><a href="'+s.name+'.png"><img src="'+s.name+'.png"></a></article>').join(''));
  console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,screens:report.screens.length}));await browser?.close();
 }
})();
