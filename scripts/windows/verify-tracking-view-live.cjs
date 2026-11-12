'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',state=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8'));
 const account=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')).admin,browser=await chromium.launch(),dir=path.join(root,'artifacts/tracking-view-preferences');fs.mkdirSync(dir,{recursive:true});
 try{
  const context=await browser.newContext(),login=await context.request.post(origin+'/auth/login',{data:account,headers:{origin},maxRedirects:0});assert.equal(login.status(),303);
  const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===state.siteId);assert(index>=0);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?mode=demo&view=production-monitor');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.production-tracking'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  await page.waitForFunction(()=>document.querySelector('.production-tracking')&&!document.getElementById('api-scope')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');assert.equal(await page.locator('#api-alert').innerText(),'');
  async function open(){const summary=page.locator('.compact-view-preferences>summary');if(!await summary.isVisible())await page.locator('.compact-secondary-actions>summary').click();await summary.click()}
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:844});await page.waitForFunction(w=>document.querySelector('.compact-secondary-actions').hidden===(w>700),width);await open();
   assert(await page.getByRole('radio',{name:'Kompakt',exact:true}).isVisible());assert(await page.getByRole('radio',{name:'Standart',exact:true}).isVisible());assert.equal(await page.locator('select[data-setting=density]').isVisible(),false);
   await page.screenshot({path:path.join(dir,'menu-'+width+'.png'),fullPage:false});await page.getByRole('radio',{name:'Kompakt',exact:true}).click();assert.equal(await page.locator('.production-tracking.density-compact').count(),1);
   await open();assert(await page.getByRole('radio',{name:'Kompakt',exact:true}).isChecked());await page.getByRole('radio',{name:'Standart',exact:true}).click();assert.equal(await page.locator('.production-tracking.density-normal').count(),1);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'live.json'),JSON.stringify({status:'PASS',readOnly:true,url:origin+'/?mode=demo&view=production-monitor',viewports:[1366,390],directOptions:['Kompakt','Standart'],errors},null,2));console.log('LIVE PASS direct tracking view options, density changes and selected state');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
