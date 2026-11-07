'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
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
