'use strict';
// Read-only verification; business writes are blocked in the browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),origin='https://flow.getritim.com',out=path.join(root,'artifacts/shipping-workspace'),state=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),'utf8'));
 const account=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')).admin,browser=await chromium.launch();fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext(),login=await context.request.post(origin+'/auth/login',{data:account,headers:{origin},maxRedirects:0});assert.equal(login.status(),303);
  const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===state.siteId);assert(index>=0);const membership=session.memberships[index],base=origin+`/api/v1/sites/${membership.tenantId}/${membership.siteId}`;
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/v1/**',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){writes.push(route.request().method());return route.abort()}return route.continue()});
  await page.goto(origin+'/?view=shipping');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.clarity-shipping-workspace'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  async function ready(){await page.waitForFunction(()=>document.querySelector('.clarity-shipping-workspace')&&!document.getElementById('api-scope')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');assert.equal(await page.locator('#api-alert').innerText(),'')}
  await ready();await page.evaluate(()=>RitimPremiumAPI.clarityShippingShow());await ready();await page.locator('#shipping-ready-order').waitFor();
  const response=await context.request.get(base+'/shipping/ready-orders');assert.equal(response.status(),200);const choices=await response.json();
  const ids=await page.locator('#shipping-ready-order option').evaluateAll(es=>es.filter(e=>e.value).map(e=>e.value));assert.deepEqual(ids,choices.items.map(i=>i.id));
  for(const item of choices.items){assert(item.readyQuantity>0);const r=await context.request.get(base+'/orders/'+item.id+'/shipping/products');assert.equal(r.status(),200);const p=await r.json();assert.equal(p.products.reduce((n,i)=>n+i.readyQuantity,0),item.readyQuantity)}
  assert.equal(await page.locator('#ship-source').count(),0);
  if(!choices.total)assert(await page.locator('.shipping-no-ready').isVisible());
  for(const width of [1440,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'live-'+width+'.png'),fullPage:true})}
  for(const file of ['integration/premium-api.js','integration/api-adapter.js','integration/visual-clarity.js','assets/css/ux-premium-workspace.css']){const r=await context.request.get(origin+'/'+file);assert.equal(r.status(),200);assert.equal((await r.text()).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'))}
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);fs.writeFileSync(path.join(out,'live.json'),JSON.stringify({status:'PASS',readOnly:true,eligibleOrdersOnly:true,eligibleOrderCount:choices.total,readyProductsReconciled:true,viewports:[1440,390],errors,writes},null,2));console.log('LIVE shipping workspace PASS: eligible-only selector and reconciled product quantities; no business writes.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
