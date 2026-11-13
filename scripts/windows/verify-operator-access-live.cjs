'use strict';
// Read-only: authenticate, inspect the UI and probe denied reads. No business writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',out=path.join(root,'artifacts/operator-access');fs.mkdirSync(out,{recursive:true});
 const accounts=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')),state=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8')),b=await chromium.launch();
 try{
  const c=await b.newContext(),login=await c.request.post(origin+'/auth/login',{data:accounts.operator,headers:{origin},maxRedirects:0});assert.equal(login.headers().location,'/');
  const session=await(await c.request.get(origin+'/api/v1/session')).json(),i=session.memberships.findIndex(x=>x.siteId===state.siteId),scope=session.memberships[i];assert(scope);assert(scope.roles.includes('operator'));assert(!scope.capabilities.includes('orders.read'));
  const base=origin+`/api/v1/sites/${scope.tenantId}/${scope.siteId}`;
  const denied=['/orders','/order-workspace','/work-center','/job-worklist','/production-tracking','/production-monitor','/production-orders','/machine-planning','/quality/controls','/inventory/materials','/shipping/ready-orders','/search?q=test','/master-data/customers','/route-templates'];
  for(const endpoint of denied){const r=await c.request.get(base+endpoint);assert.equal(r.status(),403,endpoint);}
  const manager=await b.newContext(),ml=await manager.request.post(origin+'/auth/login',{data:accounts.admin,headers:{origin},maxRedirects:0});assert.equal(ml.headers().location,'/');assert.equal((await manager.request.get(base+'/orders')).status(),200);
  const p=await c.newPage(),errors=[],writes=[],reads=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/api/v1/'))reads.push(new URL(r.url()).pathname)});
  await p.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){writes.push(r.request().method());return r.abort()}return r.continue()});
  async function ready(){await p.waitForFunction(()=>document.querySelector('.operator-studio')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');assert.equal(await p.locator('#api-alert').innerText(),'');}
  for(const view of ['orders','overview','production-monitor','quality-list','shipping','master']){
   await p.goto(origin+'/?view='+view);await p.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.operator-studio'));if(await p.locator('#api-scope').count()){await p.locator('#api-scope').selectOption(String(i));await p.getByRole('button',{name:'Devam',exact:true}).click()}await ready();assert.equal(new URL(p.url()).searchParams.get('view'),'operator');
  }
  const list=await(await c.request.get(base+'/operator/work-orders?state=active&limit=100')).json(),job=list.workOrders.find(j=>!j.reconciliationWarning);
  if(job){await p.evaluate(id=>RitimPremiumAPI.openAssigned(id),job.id);await ready();assert.equal(await p.locator('.operator-records div').count(),3);assert.equal((await c.request.get(base+'/orders/'+job.orderId)).status(),403);}
  for(const width of [1366,393,320]){
   await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.locator('.premium-sidebar nav button').count(),1);assert.equal(await p.locator('.workspace-search').count(),0);
   if(width<1000){if(await p.locator('.operator-pwa').count()){assert.equal(await p.locator('.op-bottom-nav button').count(),4);await p.locator('.op-profile').click();await p.screenshot({path:path.join(out,'live-menu-'+width+'.png'),fullPage:true});await p.locator('[data-op-tab=today]').click();}else{await p.locator('.api-mobile-menu summary').click();assert.equal(await p.locator('.api-mobile-nav button').count(),1);await p.screenshot({path:path.join(out,'live-menu-'+width+'.png'),fullPage:true});await p.locator('.api-mobile-menu summary').click();}}
   await p.screenshot({path:path.join(out,'live-'+width+'.png'),fullPage:true});
  }
  assert(!reads.some(url=>/\/(orders|work-center|production-tracking)$/.test(url)));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const source=await c.request.get(origin+'/integration/premium-api.js');assert.equal((await source.text()).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'integration/premium-api.js'),'utf8').replace(/\r\n/g,'\n'));
  fs.writeFileSync(path.join(out,'live.json'),JSON.stringify({status:'PASS',readOnly:true,deniedEndpoints:denied.length,redirectedViews:6,ownJobOpened:!!job,managerAccessPreserved:true,viewports:[1366,393,320],errors,writes},null,2));
  console.log('LIVE operator isolation PASS: only own production screens; general APIs denied; manager access retained.');
 }finally{await b.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
