'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
test('operator recovery keeps the original command identity and returns to the actionable screen',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../integration/premium-api.js'),'utf8');
 const method=source.match(/ async retryOperation\(id\)\{[^\n]+/)[0].trim().replace(/,$/,'');
 const row={id:'original-key',actorId:'actor',tenantId:'tenant',siteId:'site',kind:'production',body:{orderId:'order',workOrderId:'job',action:'results',payload:{quantity:1,kind:'scrap'}}};
 const calls=[],c={page:'operator',scope:row,detail:{id:'order'},journal:{list:()=>[row],execute:async(r,fn)=>fn(r)},run:fn=>fn(),loadDetail:async(...args)=>calls.push(['detail',...args]),loadExtras:async()=>calls.push(['extras']),refreshAssigned:async()=>calls.push(['assigned']),api:{productionCommand:async(...args)=>calls.push(['command',...args]),production:async()=>({consumedQuantity:1}),quality:async()=>({outputs:[]})}};
 vm.createContext(c);await vm.runInContext('({'+method+'}).retryOperation("original-key")',c);
 assert.equal(c.page,'operator');assert.equal(c.operatorJobId,'job');assert.equal(c.productionView.consumedQuantity,1);assert.equal(calls.find(x=>x[0]==='command').at(-1),'original-key');assert.deepEqual(calls.find(x=>x[0]==='detail'),['detail','order',false]);assert(calls.some(x=>x[0]==='assigned'));
});
test('scrap validation stays in dialog; valid submission leaves recovery reachable',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../integration/premium-api.js'),'utf8');
 const method=source.match(/ operatorSubmitScrap\(\)\{[^\n]+/)[0].trim().replace(/,$/,'');
 const browser=await chromium.launch();try{const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.setContent('<button id="retry" onclick="window.retried=true">Retry</button><dialog id="operator-scrap-dialog"><select id="operator-dialog-source"><option value="lot">Lot</option></select><input id="operator-dialog-qty" value="2"><input id="operator-dialog-kind" value="scrap"><p id="operator-scrap-error"></p><button id="save">Save</button></dialog>');
 await p.evaluate(method=>{window.el=id=>document.getElementById(id);window.productionView={lots:[{lotId:'lot',available:1}]};window.actions=eval('({'+method+'})');actions.productionAction=async(action,payload)=>{window.sent={action,payload};window.unknown=true};el('save').onclick=()=>actions.operatorSubmitScrap();el('operator-scrap-dialog').showModal()},method);
 await p.locator('#save').click();assert.equal(await p.locator('dialog').evaluate(d=>d.open),true);assert.equal(await p.evaluate(()=>!!window.sent),false);
 await p.locator('#operator-dialog-qty').fill('1');await p.locator('#save').click();assert.equal(await p.locator('dialog').evaluate(d=>d.open),false);
 await p.locator('#retry').click();assert.equal(await p.evaluate(()=>window.retried),true);assert.deepEqual(await p.evaluate(()=>window.sent),{action:'results',payload:{quantity:1,lotId:'lot',kind:'scrap'}});
 }finally{await browser.close()}
});
