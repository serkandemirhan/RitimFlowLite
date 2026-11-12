'use strict';
// Read existing test-site controls; no inspections, production or repair writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',state=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8'));
 const account=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')).admin,browser=await chromium.launch(),dir=path.join(root,'artifacts/quality-controls');fs.mkdirSync(dir,{recursive:true});
 try{
  const context=await browser.newContext(),response=await context.request.post(origin+'/auth/login',{data:account,headers:{origin},maxRedirects:0});assert.equal(response.status(),303);
  const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===state.siteId);assert(index>=0);
  const page=await context.newPage(),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push({status:r.status(),path:new URL(r.url()).pathname})});
  await page.goto(origin+'/?view=quality-list');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.quality-controls-workspace'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  const ready=async()=>{await page.waitForFunction(()=>document.querySelector('.quality-controls-workspace')&&!document.getElementById('api-scope')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');assert.equal(await page.locator('#api-alert').innerText(),'')};await ready();
  assert.equal(await page.getByRole('button',{name:'Tamir',exact:true}).count(),0);
  assert.equal(await page.locator('.compact-navigation-row>.quality-controls-toolbar').count(),1);
  assert.equal(await page.locator('.quality-controls-workspace.card').count(),0);
  assert.equal(await page.getByRole('combobox',{name:'Sayfadaki kontrol sayısı'}).count(),1);
  const checks=[];
  for(const mode of ['open','completed']){
   await page.getByRole('button',{name:mode==='open'?'Açık Kontroller':'Tamamlanan Kontroller',exact:true}).click();await ready();
   for(const type of ['all','incoming','production','supplier','return']){
    await page.locator('#quality-control-type').selectOption(type);await ready();
    const r=await context.request.get(origin+'/api/v1/sites/'+session.memberships[index].tenantId+'/'+state.siteId+'/quality/controls?state='+mode+'&type='+type);assert.equal(r.status(),200);const data=await r.json();assert(data.items.every(x=>(type==='all'||x.type===type)&&(mode==='open'?x.pending>0:x.pending===0)));assert.equal(await page.locator('.compact-page-count').innerText(),String(data.total));checks.push({state:mode,type,total:data.total});
   }
   await page.locator('#quality-control-type').selectOption('all');await ready();
   for(const [width,height]of [[1920,1080],[1366,768],[390,844],[375,667]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dir,'live-'+mode+'-'+width+'.png'),fullPage:true})}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);const report={status:'PASS',readOnly:true,checks,viewports:4,errors,failures};fs.writeFileSync(path.join(dir,'live.json'),JSON.stringify(report,null,2));console.log('LIVE QUALITY PASS '+checks.length+' state/type combinations, four viewports');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
