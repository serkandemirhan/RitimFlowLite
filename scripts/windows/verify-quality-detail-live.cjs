'use strict';
// Existing test data only. Preview replaces presentation assets in the browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',preview=process.argv.includes('--preview'),baseline=process.argv.includes('--baseline'),dir=path.join(root,'artifacts/quality-detail-clarity');fs.mkdirSync(dir,{recursive:true});
 const state=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8')),account=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')).admin;
 const browser=await chromium.launch();try{
  const context=await browser.newContext(),response=await context.request.post(origin+'/auth/login',{data:account,headers:{origin},maxRedirects:0});assert.equal(response.status(),303);
  const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===state.siteId);assert(index>=0);
  if(preview)for(const asset of ['integration/quality-controls.js','integration/premium-api.js','integration/workspace-polish.js','integration/transient-panels.js','assets/css/modern-ui.css'])await context.route(origin+'/'+asset+'*',route=>route.fulfill({path:path.join(root,asset),contentType:asset.endsWith('.js')?'text/javascript':'text/css'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?view=orders');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.standard-workspace'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  await page.waitForFunction(()=>document.querySelector('.standard-workspace')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true'&&!document.getElementById('api-scope'));
  await page.goto(origin+'/?view=quality-list&tab=history&controlType=production');await page.getByRole('button',{name:'Kaydı aç',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('.operations-quality')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');
  await page.waitForFunction(()=>!document.getElementById('work-document-list')?.textContent.includes('yükleniyor'));
  assert.equal(await page.locator('#api-alert').innerText(),'');
  if(!baseline){assert.equal(await page.locator('.quality-state-content').count(),1);assert.equal(await page.locator('.quality-records').count(),1);assert.equal(await page.locator('#page>.required-help').count(),0);assert.equal(await page.getByText('Bekliyor',{exact:true}).count(),0)}
  const stage=baseline?'before':preview?'preview':'live';
  for(const [width,height]of [[1920,1080],[1366,768],[390,844],[375,667]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dir,stage+'-'+width+'.png'),fullPage:true})}
  assert.deepEqual(errors,[]);const result={status:'PASS',stage,readOnly:true,viewports:4,errors,summary:await page.locator('.quality-state-content').count()?await page.locator('.quality-state-content').innerText():null};fs.writeFileSync(path.join(dir,stage+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
