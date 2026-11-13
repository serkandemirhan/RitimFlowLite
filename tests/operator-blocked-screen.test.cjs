'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
test('blocked waiting and paused jobs retain their action and visible explanation',async()=>{
 const source=fs.readFileSync('integration/premium-api.js','utf8'),code=source.slice(source.indexOf(' function operatorStudioPanel(j){'),source.indexOf(' function operatorHomeContent(){'));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.setContent('<main></main>');
 for(const status of ['waiting','paused'])for(const executionHeld of [false,true]){
  await page.evaluate(({code,status,executionHeld})=>{
   Object.assign(window,{scope:{roles:['operator']},h:x=>String(x??''),jsArg:JSON.stringify,shortReference:x=>x,outcomeIcon:()=>'',operatorStateIcon:()=>'',drawingPanel:()=>'',poStatus:x=>x,operatorActionReady:()=>false,displayStatus:x=>x,extras:{},qualityView:{outputs:[]},productionView:{lots:[],consumedQuantity:0,remainingUsableInput:0,inputQuantity:0,outputs:{},attention:{reason:executionHeld?'Sipariş durduruldu':'Malzeme teslimi gerekli',executionHeld,blockers:[{code:'material',label:'Malzeme teslimi gerekli'}]}}});
   window.operationsTemplate=html=>{const t=document.createElement('template');t.innerHTML=html;return t};
   window.operatorPanel=()=>'<section class="flow-production-panel"><div class="flow-heading"></div><div class="flow-metrics"></div><button class="flow-primary" disabled>Başlat</button><details class="flow-details"><summary>Kalite özeti</summary></details></section>';
   eval(code+';window.render=operatorStudioPanel');document.querySelector('main').innerHTML=render({id:'j',status,operation:{name:'Torna'},plannedQuantity:5});
  },{code,status,executionHeld});
  assert.equal(await page.locator('.operator-state-primary').count(),1);assert(await page.locator('.operator-state-primary').isDisabled());
  assert.equal(await page.locator('.operator-action-explanation').first().innerText(),executionHeld?'Sipariş durduruldu':'Malzeme teslimi gerekli');
  assert.equal(await page.locator('.operator-resume-check').count(),status==='paused'&&!executionHeld?1:0);
  assert.equal(await page.locator('.operator-state-primary').innerText(),status==='paused'?'Devam et':'İşi başlat');
 }
 }finally{await browser.close()}
});
