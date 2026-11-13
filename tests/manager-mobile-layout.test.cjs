'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
test('tracking filters remain usable when changing between phone and desktop',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:393,height:851}});await page.setContent('<link rel="manifest" href="/operator.webmanifest"><div class="api-shell"><main><header class="workspace-header"><div class="workspace-header-tools"></div></header><div id="page"><section class="production-tracking"><form class="tracking-search"><input name="q" aria-label="Ara"><button type="submit">Ara</button></form><div class="tracking-options"><button>Görünüm</button></div></section></div></main></div>');
  await page.addStyleTag({content:fs.readFileSync('assets/css/manager-pwa.css','utf8')});await page.addScriptTag({content:fs.readFileSync('integration/manager-pwa.js','utf8')});await page.evaluate(()=>RitimManagerPWA.mount({scope:{tenantId:'fixture'},page:'production-monitor',area:'production',allowedPages:['production-orders'],pendingCount:0}));
  assert(await page.locator('.mgr-tracking-filters>summary').isVisible());assert(!(await page.locator('.tracking-search input[name=q]').isVisible()));
  await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>!document.body.classList.contains('manager-mobile'));assert(await page.locator('.tracking-search input[name=q]').isVisible());assert(!(await page.locator('.mgr-tracking-filters>summary').isVisible()));
  await page.setViewportSize({width:393,height:851});await page.waitForFunction(()=>document.body.classList.contains('manager-mobile'));await page.locator('.mgr-tracking-filters>summary').click();await page.locator('.tracking-search input[name=q]').fill('Mil');await page.evaluate(()=>document.querySelector('#page').append(document.createElement('span')));await page.waitForTimeout(80);assert(await page.locator('.tracking-search input[name=q]').isVisible());assert.equal(await page.locator('.tracking-search input[name=q]').inputValue(),'Mil');
 }finally{await browser.close()}
});
