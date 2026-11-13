'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async h=>{
 const {page,context,origin,call,base,ta,sa,admin,schema,operator,operatorToken,nextOperator}=h;
 const out=path.resolve(__dirname,'../artifacts/operator-access');fs.mkdirSync(out,{recursive:true});
 const f=await require('../backend/test-support/operator-experience-fixture.cjs')(h),privateJob=crypto.randomUUID(),privateOperation=crypto.randomUUID();
 await admin.query(`INSERT INTO ${schema}.operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) SELECT tenant_id,site_id,order_id,$1,100,'Private operation',kind,production_order_id FROM ${schema}.operations WHERE id=(SELECT operation_id FROM ${schema}.work_orders WHERE id=$2)`,[privateOperation,f.waiting.workOrderId]);
 await admin.query(`INSERT INTO ${schema}.work_orders(tenant_id,site_id,order_id,id,operation_id,work_order_number,planned_qty,production_order_id) SELECT tenant_id,site_id,order_id,$1,$3,'PRIVATE-WORK',planned_qty,production_order_id FROM ${schema}.work_orders WHERE id=$2`,[privateJob,f.waiting.workOrderId,privateOperation]);
 await admin.query(`INSERT INTO ${schema}.work_assignments(tenant_id,site_id,id,work_order_id,user_id) VALUES($1,$2,$3,$4,$5)`,[ta,sa,crypto.randomUUID(),privateJob,nextOperator]);
 const denied=['/orders','/order-workspace','/work-center','/job-worklist','/production-tracking','/production-monitor','/production-orders','/machine-planning','/quality/controls','/inventory/materials','/shipping/ready-orders','/search?q=PRIVATE','/master-data/customers','/master-data/operations','/route-templates','/orders/'+f.order,'/orders/'+f.order+'/work-orders'];
 for(const route of denied){const r=await call('GET',base+route,null,null,operatorToken);assert.equal(r.statusCode,403,route+': '+r.body);}
 for(const suffix of ['production/balances','production/history','quality','quality/history','drawing','drawing/document','handoff','documents']){
  const r=await call('GET',base+'/orders/'+f.order+'/work-orders/'+privateJob+'/'+suffix,null,null,operatorToken);assert.equal(r.statusCode,404,suffix+': '+r.body);
 }
 const allowed=['/operator/work-orders','/operator/notifications','/workspace-preferences','/master-data/scrap-reasons',...['production/balances','production/history','quality','quality/history','drawing'].map(s=>'/orders/'+f.order+'/work-orders/'+f.running.workOrderId+'/'+s)];
 for(const route of allowed){const r=await call('GET',base+route,null,null,operatorToken);assert.equal(r.statusCode,200,route+': '+r.body);}
 const ownList=(await call('GET',base+'/operator/work-orders',null,null,operatorToken)).json().workOrders;assert(!ownList.some(j=>j.id===privateJob));assert.equal((await call('GET',base+'/operator/work-orders?workspace=team',null,null,operatorToken)).statusCode,403);
 const capabilities=(await call('GET',base+'/capabilities',null,null,operatorToken)).json().capabilities;assert(!capabilities.includes('orders.read'));assert(capabilities.includes('production.read'));
 assert.equal((await call('GET',base+'/orders')).statusCode,200,'Managers retain the order workspace');
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push(new URL(r.url()).pathname.replace(base,''))});
 async function ready(){await page.waitForFunction(()=>document.querySelector('.operator-studio')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');assert.equal(await page.locator('#api-alert').innerText(),'');}
 async function enter(view){await page.goto(origin+'/?view='+view);await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.operator-studio'));if(await page.locator('#api-scope').count()){const session=await(await context.request.get(origin+'/api/v1/session')).json(),i=session.memberships.findIndex(x=>x.siteId===sa);await page.locator('#api-scope').selectOption(String(i));await page.getByRole('button',{name:'Devam',exact:true}).click()}await ready();assert.equal(new URL(page.url()).searchParams.get('view'),'operator');}
 for(const view of ['orders','overview','production-monitor','quality-list','shipping','master'])await enter(view);
 await page.evaluate(id=>RitimPremiumAPI.openAssigned(id),f.running.workOrderId);await ready();
 assert.equal(await page.locator('.operator-machine-context strong').innerText(),'CNC-OP-01');assert.equal(await page.locator('.operator-amounts strong').nth(1).innerText(),'2');assert.equal(await page.locator('.operator-records dd').first().innerText(),'OPERATOR-UX');
 for(const width of [1366,393,320]){
  await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const nav=page.locator('.premium-sidebar nav');assert.equal(await nav.getByRole('button',{name:'Siparişler',exact:true}).count(),0);assert.equal(await nav.getByRole('button',{name:'Genel Bakış',exact:true}).count(),0);assert.equal(await nav.locator('button').count(),1);
  assert.equal(await page.locator('.workspace-search').count(),0);if(width<1000){await page.getByRole('button',{name:'Ana menüyü aç'}).count();await page.locator('.api-mobile-menu summary').click();assert.equal(await page.locator('.api-mobile-nav button').count(),1);await page.locator('.api-mobile-menu summary').click();}
  await page.screenshot({path:path.join(out,'operator-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>RitimPremiumAPI.navigate('overview'));await ready();assert.equal(new URL(page.url()).searchParams.get('view'),'operator');
 assert(!requests.some(p=>['/orders','/work-center','/order-workspace','/search','/production-tracking'].includes(p)));assert(!requests.includes('/orders/'+f.order));assert(!requests.includes('/orders/'+f.order+'/work-orders'));assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({status:'PASS',viewsRedirected:6,deniedGeneralEndpoints:denied.length,deniedOtherJobReads:8,ownProductionAvailable:true,managerAccessPreserved:true,viewports:[1366,393,320],errors},null,2));
 console.log('Operator access PASS: only assigned work; direct links, general APIs and other operator jobs are blocked.');
};
