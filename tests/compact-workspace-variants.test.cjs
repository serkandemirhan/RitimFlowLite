'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
test('compact workspace preserves selected supplier forms and tolerates loading/error layouts without list controls',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.setContent('<div id="app"><div class="api-shell"><main><header class="workspace-header"><h1>Fason</h1><div class="workspace-header-tools"></div></header><div id="api-alert" role="status"></div><div id="page"></div></main></div></div>');
  await page.addScriptTag({content:fs.readFileSync('integration/compact-workspace.js','utf8')});
  for(const scenario of [{page:'outsourcing',html:'<section class="supplier-compact-page"><h2>Kaplama · Fason</h2><form id="return-form"><input name="quantity" value="2.5"><button type="submit">Dönüşü kaydet</button></form></section>'},{page:'jobs',html:'<p role="status">İş emirleri yükleniyor…</p>'},{page:'quality-list',html:'<p role="alert">Kontroller alınamadı.</p>'}]){
   const result=await page.evaluate(s=>{document.getElementById('page').innerHTML=s.html;RitimCompactWorkspace.mount({page:s.page});return {content:document.getElementById('page').innerHTML,owner:document.querySelector('[name=quantity]')?.form?.id,value:document.querySelector('[name=quantity]')?.value}},scenario);
   if(scenario.page==='outsourcing'){assert.equal(result.owner,'return-form');assert.equal(result.value,'2.5');await page.evaluate(()=>{document.getElementById('return-form').onsubmit=e=>{e.preventDefault();window.submitted=document.querySelector('[name=quantity]').value}});await page.getByRole('button',{name:'Dönüşü kaydet'}).click();assert.equal(await page.evaluate(()=>submitted),'2.5')}
   else assert.match(result.content,/yükleniyor|alınamadı/);
  }
 }finally{await browser.close()}
});
