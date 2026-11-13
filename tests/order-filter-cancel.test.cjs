const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const source=fs.readFileSync('integration/premium-api.js','utf8');
test('date presets keep dates together and allow explicit filter application',async()=>{
 const b=await chromium.launch();try{const p=await b.newPage();await p.clock.install({time:new Date('2026-11-11T12:00:00Z')});await p.setContent('<div class="api-shell"><details open><summary>Filtreler</summary><div class="formgrid"><label><input id="orders-dueFrom" type="date"></label><label><input id="orders-dueTo" type="date"></label></div><button type="submit">Apply</button><button type="button">Clear</button></details></div>');
 await p.addStyleTag({content:fs.readFileSync('assets/css/modern-ui.css','utf8')});
 const helper=source.slice(source.indexOf(' function arrangeOrderFilters('),source.indexOf(' function refineShipping('));
 await p.evaluate(helper=>{window.el=id=>document.getElementById(id);window.changes=0;document.addEventListener('input',()=>changes++);eval(helper+';arrangeOrderFilters(document.querySelector("details"));')},helper);
 await p.getByRole('button',{name:'Son 2 ay',exact:true}).click();assert.equal(await p.locator('#orders-dueFrom').inputValue(),'2026-09-11');assert.equal(await p.locator('#orders-dueTo').inputValue(),'2026-11-11');assert.equal(await p.getByRole('button',{name:'Son 2 ay',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await p.evaluate(()=>changes),1);assert(await p.locator('.order-filter-actions .primary').isEnabled());
 for(const width of [1280,390]){await p.setViewportSize({width,height:850});const a=await p.locator('#orders-dueFrom').boundingBox(),c=await p.locator('#orders-dueTo').boundingBox();assert(Math.abs(a.y-c.y)<2)}
 await p.getByRole('button',{name:'Tüm tarihler'}).click();assert.equal(await p.locator('#orders-dueFrom').inputValue(),'');assert.equal(await p.locator('#orders-dueTo').inputValue(),'');
 }finally{await b.close()}
});
test('cancellation requires final confirmation before creating any command',async()=>{
 const b=await chromium.launch();try{const p=await b.newPage();await p.setContent('<main></main>');
 const method=source.split('\n').find(l=>l.includes('async openExecutionControl(orderId,' )).trim().replace(/,$/,'');
 await p.evaluate(method=>{window.el=id=>document.getElementById(id);window.h=String;window.capable=()=>true;window.scope={};window.sent=0;window.api={executionControl:async()=>({label:'SOABC_000001',running:1,active:2,status:'open',token:'token'})};window.journal={begin:async x=>{sent++;return x},execute:async()=>{}};window.workflowDialog=(title,body)=>{const d=document.createElement('dialog');d.innerHTML=body;document.body.append(d);d.showModal();return d};window.RitimPremiumAPI=eval('({'+method+'})');RitimPremiumAPI.openOrder=async()=>{}},method);
 await p.evaluate(()=>RitimPremiumAPI.openExecutionControl('order',null,'cancel'));await p.locator('#execution-reason').fill('Customer cancelled');await p.locator('input[type=checkbox]').check();assert(await p.locator('button[type=submit]').isEnabled());
 let warning='';p.once('dialog',async d=>{warning=d.message();await d.dismiss()});await p.locator('button[type=submit]').click();assert.match(warning,/geçmişi korunur/);assert.match(warning,/2 açık iş emri/);assert.equal(await p.evaluate(()=>sent),0);
 p.once('dialog',d=>d.accept());await p.locator('button[type=submit]').click();assert.equal(await p.evaluate(()=>sent),1);
 }finally{await b.close()}
});
