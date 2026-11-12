'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',out=path.join(root,'artifacts/cloud-release/operator-refinement');
 const accounts=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8'));
 const browser=await chromium.launch();fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext();const login=await context.request.post(origin+'/auth/login',{data:accounts.operator,headers:{origin},maxRedirects:0});assert.equal(login.status(),303);
  const session=await(await context.request.get(origin+'/api/v1/session')).json();assert(session.memberships.length>0);
  const checkpoint=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8'));
  let index=session.memberships.findIndex(m=>m.siteId===checkpoint.siteId);if(index<0)index=0;
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){writes.push(route.request().method()+' '+new URL(route.request().url()).pathname);return route.abort()}return route.continue()});
  await page.goto(origin+'/?view=operator');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.operator-studio'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  await page.waitForFunction(()=>document.querySelector('.operator-studio')&&!document.getElementById('api-scope')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');
  assert.equal(await page.locator('#api-alert').innerText(),'');
  const jobs=page.locator('[onclick*="openAssigned("]');const jobCount=await jobs.count();if(jobCount){await jobs.first().click();await page.waitForFunction(()=>document.querySelector('.operator-focus-heading')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true')}
  for(const width of [390,1366]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('[data-quality=rework],#ux05-ir,#ux05-rg,#ux05-rs,[data-quantity=repairPending]').count(),0);assert.equal(await page.locator('option[value=rework]').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'live-no-repair-'+width+'.png'),fullPage:true})}
  for(const file of ['integration/premium-api.js','integration/consistency-ui.js','integration/workspace-polish.js','assets/js/ux-operator.js','assets/css/ux-premium-workspace.css']){const response=await context.request.get(origin+'/'+file);assert.equal(response.status(),200);assert.equal((await response.text()).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),file+' matches release')}
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync(path.join(out,'live-no-repair.json'),JSON.stringify({status:'PASS',readOnly:true,viewports:[390,1366],assignedJobButtons:jobCount,detailVerified:jobCount>0,errors,writes},null,2));console.log('LIVE PASS: operator without repair entry; '+jobCount+' assigned job buttons, assets match release');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
