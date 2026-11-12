const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
test('View directly exposes Compact and Standard and preserves the existing density preference',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();page.setDefaultTimeout(10000);await page.route('http://ritim.test/',r=>r.fulfill({body:'<div id="app"></div>',contentType:'text/html'}));await page.goto('http://ritim.test/');
  for(const file of ['assets/css/modern-ui.css','assets/css/production-tracking.css','assets/css/compact-workspace.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  for(const file of ['integration/production-tracking.js','integration/compact-workspace.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(()=>{window.draw=()=>{document.getElementById('app').innerHTML='<div class="api-shell"><main><header class="workspace-header"><h1>Üretim Takibi</h1></header><div id="page">'+RitimProductionTracking.render({orders:[],total:0,page:1,pageSize:10},'density-test')+'</div></main></div>';RitimProductionTracking.mount({draw,load:()=>{throw Error('Density must not reload production data')}});RitimCompactWorkspace.mount({page:'production-monitor'})};draw()});
  async function open(){const menu=page.locator('.compact-view-preferences>summary');if(!await menu.isVisible())await page.locator('.compact-secondary-actions>summary').click();await menu.click()}
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:844});await page.waitForFunction(w=>document.querySelector('.compact-secondary-actions').hidden===(w>700),width);await open();assert.equal(await page.getByRole('radio',{name:'Kompakt',exact:true}).isVisible(),true);assert.equal(await page.getByRole('radio',{name:'Standart',exact:true}).isVisible(),true);assert.equal(await page.locator('select[data-setting=density]').isVisible(),false);assert.equal(await page.getByText('Satırlar',{exact:true}).count(),0);
   await page.getByRole('radio',{name:'Kompakt',exact:true}).click();assert.equal(await page.locator('.production-tracking.density-compact').count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('ritim-tracking-density:density-test')),'compact');
   await open();assert.equal(await page.getByRole('radio',{name:'Kompakt',exact:true}).isChecked(),true);await page.getByRole('radio',{name:'Standart',exact:true}).click();assert.equal(await page.locator('.production-tracking.density-normal').count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('ritim-tracking-density:density-test')),'normal');
  }
 }finally{await browser.close()}
});
