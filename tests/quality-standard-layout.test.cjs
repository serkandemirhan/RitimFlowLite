const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const source=fs.readFileSync('integration/premium-api.js','utf8'),handlers=['qualityControlsPage','qualityControlsReset'].map(name=>source.split('\n').find(l=>l.startsWith(' async '+name+'('))).join('\n');
test('quality shares production navigation layout, header count and real page controls at desktop and phone sizes',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="app"></div>');await page.addStyleTag({content:fs.readFileSync('index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1]});
  for(const file of ['assets/css/ux-premium-workspace.css','assets/vendor/ui/tabler.scoped.css','assets/css/modern-ui.css','assets/css/compact-workspace.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  for(const file of ['integration/operational-grid.js','integration/quality-controls.js','integration/compact-workspace.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(handlers=>{
   window.busy=false;window.listPaging={};window.qualityQuery='';window.qualityControlType='all';window.loads=0;window.calls=[];
   window.records=Array.from({length:45},(_,i)=>({id:'record-'+i,type:'production',reference:'IE-'+i,description:'Konveyör mili '+i,operation:'CNC torna',unit:'piece',quantity:3,pending:3,decided:0}));window.qualityControlsData={items:records.slice(0,25),total:45,nextAfter:'next'};
   window.loadQualityPage=async more=>{loads++;qualityControlsData={items:more?records:records.slice(0,25),total:45,nextAfter:more?null:'next'};if(!more&&listPaging['quality-controls'])listPaging['quality-controls'].page=1};
   window.draw=()=>{document.getElementById('app').innerHTML='<div class="api-shell ritim-ui"><main class="main"><header class="workspace-header"><h1>Kalite</h1></header><nav class="api-secondary-nav"><button class="btn" aria-pressed="true">Açık Kontroller</button><button class="btn">Tamamlanan Kontroller</button></nav><div id="page">'+RitimQualityControls.render(qualityControlsData,{pagination:listPaging['quality-controls'],query:qualityQuery,type:qualityControlType})+'</div></main></div>';RitimCompactWorkspace.mount({page:'quality-list',qualityControlsTotal:qualityControlsData.total})};window.run=async fn=>{await fn();draw()};
   window.RitimPremiumAPI={openQualityControl:index=>calls.push(index),qualityControlsUrl:()=>calls.push('url'),qualityControlsSearch:()=>{},qualityControlsType:()=>{},...eval('({'+handlers+'})')};draw();
  },handlers);
  assert.equal(await page.locator('.compact-page-count').innerText(),'45');
  assert.equal(await page.locator('.compact-navigation-row>.compact-page-tabs').count(),1);assert.equal(await page.locator('.compact-navigation-row>.quality-controls-toolbar').count(),1);
  assert.equal(await page.locator('.quality-controls-workspace.card').count(),0);assert.equal(await page.locator('.quality-controls-count').count(),0);
  assert.equal(await page.locator('.quality-controls-toolbar').evaluate(bar=>new Set([...bar.querySelectorAll(':scope>button,:scope>details>summary')].filter(n=>n.getClientRects().length).map(n=>Math.round(n.getBoundingClientRect().top))).size),1);
  assert.equal(await page.locator('tbody tr').count(),20);assert.equal(await page.getByRole('button',{name:'Önceki',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Sonraki',exact:true}).click();assert.equal(await page.evaluate(()=>loads),1);assert.equal(await page.locator('tbody tr').count(),20);assert.match(await page.locator('.operational-pagination').innerText(),/21–40 \/ 45/);
  await page.getByRole('button',{name:'Sonraki',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),5);assert.equal(await page.getByRole('button',{name:'Sonraki',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Kontrol et',exact:true}).first().click();assert.deepEqual(await page.evaluate(()=>calls),[40]);
  await page.getByRole('combobox',{name:'Sayfadaki kontrol sayısı'}).selectOption('50');assert.equal(await page.locator('tbody tr').count(),45);assert.match(await page.locator('.operational-pagination').innerText(),/1–45 \/ 45/);
  await page.evaluate(()=>{qualityQuery='Mil';qualityControlType='production';draw()});await page.getByRole('button',{name:'Temizle',exact:true}).click();assert.equal(await page.locator('#quality-control-query').inputValue(),'');assert.equal(await page.locator('#quality-control-type').inputValue(),'all');
  for(const [width,height]of [[1920,1080],[1366,768],[390,844],[375,667]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
