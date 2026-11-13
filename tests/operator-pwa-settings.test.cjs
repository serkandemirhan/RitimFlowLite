'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('operator settings detect installed PWA windows and iOS, and keep notifications only in the header',async()=>{
 const browser=await chromium.launch();try{for(const mode of ['browser','standalone','ios']){
  const page=await browser.newPage({viewport:{width:393,height:851}});
  await page.addInitScript(mode=>{if(mode==='ios')Object.defineProperty(navigator,'standalone',{value:true,configurable:true});if(mode==='standalone'){const original=window.matchMedia;window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,addEventListener(){}}:original.call(window,query);}},mode);
  await page.route('http://operator.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="app"><div class="api-shell"><main><header class="workspace-header"><button id="operator-notifications" aria-label="Bildirimler">Bildirimler</button></header><div id="page"><section class="operator-studio"></section></div></main></div></div>'}));await page.goto('http://operator.test/');await page.addStyleTag({path:'assets/css/operator-pwa.css'});await page.evaluate(()=>{window.RitimPremiumAPI={openAssigned:async()=>{},refreshAssigned(){},logout(){}};});await page.addScriptTag({path:'integration/operator-pwa.js'});await page.evaluate(()=>{RitimOperatorPWA.mount({page:'operator',scope:{tenantId:'t',siteId:'s',actorId:'a'},assignedJobs:[]});RitimOperatorPWA.select('more');});
  assert.equal(await page.locator('[data-op-site]').count(),0);assert.equal(await page.locator('[data-op-notifications]').count(),0);assert(await page.getByRole('button',{name:'Bildirimler',exact:true}).isVisible());assert(await page.getByRole('link',{name:'Şifremi değiştir',exact:true}).isVisible());assert(await page.getByRole('button',{name:'Çıkış yap',exact:true}).isVisible());
  assert.equal(await page.locator('[data-op-install]').isVisible(),mode==='browser',mode);if(mode!=='browser')assert.equal(await page.locator('.op-install-help').innerText(),'Uygulama kurulu.');
  if(mode==='browser'){await page.evaluate(()=>dispatchEvent(new Event('appinstalled')));assert(!(await page.locator('[data-op-install]').isVisible()));assert.match(await page.locator('.op-install-help').innerText(),/kurulu|yüklendi/);}
  await page.close();
 }}finally{await browser.close();}
});
