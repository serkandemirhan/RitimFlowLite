const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const {unavailable}=require('../backend/src/production-entry-edits');
test('five-minute limit belongs to the original event and never overrides completion or ownership',()=>{
 const s={identity:{userId:'own'}},e={actor_id:'own',kind:'scrap',job_status:'running',order_status:'open',server_time:'2026-11-13T10:04:59.999Z',expires_at:'2026-11-13T10:05:00Z'};
 assert.equal(unavailable(e,s,['operator']),null);
 assert.equal(unavailable({...e,server_time:new Date(e.server_time),expires_at:new Date(e.expires_at)},s,['operator']),null);
 assert.match(unavailable({...e,server_time:e.expires_at},s,['operator']),/5 dakika/);
 assert.equal(unavailable({...e,server_time:e.expires_at},s,['manager']),null);
 assert.match(unavailable({...e,actor_id:'other'},s,['operator']),/kendi/);
 for(const job_status of ['complete','cancelled'])assert.match(unavailable({...e,job_status},s,['operator']),/Bitirilmiş/);
 assert.match(unavailable({...e,dependent:true},s,['manager']),/bağlı kalite/);
});
test('history edits preserve original entry identity, confirm the change and send its version',async()=>{
 const source=fs.readFileSync('integration/premium-api.js','utf8'),helper=source.split('\n').find(s=>s.includes('function entryEditButton(')),start=source.indexOf(' async editProductionEntry('),end=source.indexOf(' async productionAction(',start),method=source.slice(start,end);
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:393,height:844}});await page.setContent('<div id="history"></div>');
 await page.evaluate(({helper,method})=>{
  const entry={eventId:'entry',kind:'scrap',quantity:4,edit:{canEdit:true,version:'version-1',expiresAt:null}};
  Object.assign(window,{busy:false,detail:{id:'order'},jobSelected:'job',page:'operator',extras:{productionHistory:{events:[entry]}},h:x=>String(x??'').replaceAll('"','&quot;'),jsArg:x=>'\''+x+'\'',displayStatus:x=>x,workflowDialog:(title,body)=>{const d=document.createElement('dialog');d.innerHTML=body;document.body.append(d);d.showModal();return d},run:async fn=>fn(),sendOperation:async(...args)=>{window.sent=args},refreshOperatorResult:async()=>{window.refreshed=true}});
  eval(helper+';document.getElementById("history").innerHTML=entryEditButton(extras.productionHistory.events[0]);');window.RitimPremiumAPI=eval('({'+method+'})');
 },{helper,method});
 await page.getByRole('button',{name:'Düzenle',exact:true}).click();await page.locator('[name=quantity]').fill('2');await page.locator('[name=reason]').fill('Yanlış adet');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Düzeltmeyi kaydet'}).click();assert.equal(await page.evaluate(()=>!!window.sent),false);assert(await page.locator('dialog[open]').isVisible());
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Düzeltmeyi kaydet'}).click();assert.deepEqual(await page.evaluate(()=>sent),['productionEntryEdit','job',{eventId:'entry',version:'version-1',quantity:2,reason:'Yanlış adet'}]);assert(await page.evaluate(()=>refreshed));
 }finally{await browser.close()}
});
