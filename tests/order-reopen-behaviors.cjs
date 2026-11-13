'use strict';
const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto'),path=require('node:path');
module.exports=async h=>{
 const {call,base,customer,product,browser,origin,session,sa,shots,out,completedOrder,completedJob}=h;
 const get=async p=>{const r=await call('GET',base+p);assert.equal(r.statusCode,200,r.body);return r.json()};
 const post=async(p,b,status=201,key=id())=>{const r=await call('POST',base+p,b,key);assert.equal(r.statusCode,status,r.body);return r.json()};
 const control=async(order,action)=>{const s=await get('/orders/'+order+'/execution-control');return post('/orders/'+order+'/execution-control',{action,reason:'Test: '+action,token:s.token},200)};
 const order=await post('/orders',{customerId:customer.id,items:[{partId:product.id,quantity:20}]});
 async function planned(){const p=await post('/orders/'+order.id+'/production-orders',{quantity:5,orderItemId:order.items[0].id,operations:[{name:'Torna',kind:'internal'}]});const plan=await post('/production-orders/'+p.id+'/state',{action:'plan',version:p.version,plannedDate:'2026-12-01'},200);return {p,job:plan.workOrders[0].id}}
 const first=await planned(),independent=await planned();let state=await get('/orders/'+order.id+'/execution-control?productionId='+independent.p.id);
 await post('/orders/'+order.id+'/execution-control',{productionId:independent.p.id,action:'cancel',reason:'Bağımsız üretim iptali',token:state.token},200);
 await control(order.id,'cancel');
 const context=await browser.newContext();await context.addCookies([{name:'pages_session',value:session,url:origin,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();
 try{
  await page.goto(origin+'/?view=orders');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.workspace-orders'));
  if(await page.locator('#api-scope').count()){const s=await(await context.request.get(origin+'/api/v1/session')).json();await page.locator('#api-scope').selectOption(String(s.memberships.findIndex(m=>m.siteId===sa)));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  await page.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true'&&window.RitimPremiumAPI);await page.evaluate(id=>RitimPremiumAPI.openOrder(id),order.id);
  await page.getByRole('button',{name:'Yeniden aç ve düzenle',exact:true}).click();await page.locator('#execution-control-form').waitFor();assert.equal(await page.locator('#execution-action').inputValue(),'reopen');
  await page.locator('#execution-reason').fill('Sipariş yanlışlıkla iptal edilmişti');await page.locator('#execution-control-form input[type=checkbox]').check();
  for(const width of [360,393,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const file='target-order-reopen-'+width+'.png';await page.screenshot({path:path.join(out,file),fullPage:false});shots.push(file)}
  await page.locator('#execution-control-form [type=submit]').click();await page.locator('.order-edit-panel').waitFor();assert.equal((await get('/orders/'+order.id+'/editing')).status,'open');
  await page.locator('#edit-reason').fill('Yeniden açılan siparişin termin düzeltmesi');await page.locator('#edit-due').fill('2026-12-10');await page.getByRole('button',{name:'Değişiklikleri kaydet',exact:true}).click();await page.locator('.order-actionbar').waitFor();assert.equal((await get('/orders/'+order.id+'/editing')).dueDate,'2026-12-10');
 }finally{await context.close()}
 const jobs=(await get('/orders/'+order.id+'/work-orders')).workOrders;assert.equal(jobs.find(j=>j.id===first.job).status,'waiting');assert.equal(jobs.find(j=>j.id===independent.job).status,'cancelled');
 const reopened=await get('/orders/'+order.id+'/execution-control');assert(reopened.history.some(e=>e.event_type==='execution.cancel'));assert(reopened.history.some(e=>e.event_type==='execution.reopen'));
 await post('/orders/'+order.id+'/execution-control',{action:'reopen',reason:'Zaten açık',token:reopened.token},409);
 await control(completedOrder,'cancel');const cancelled=await get('/orders/'+completedOrder+'/execution-control'),key=id(),body={action:'reopen',reason:'Geçmiş korunarak yeniden aç',token:cancelled.token};await post('/orders/'+completedOrder+'/execution-control',body,200,key);await post('/orders/'+completedOrder+'/execution-control',body,200,key);
 assert.equal((await get('/orders/'+completedOrder+'/work-orders')).workOrders.find(j=>j.id===completedJob).status,'complete');
 const stale=await get('/orders/'+order.id+'/execution-control');await control(order.id,'cancel');await post('/orders/'+order.id+'/execution-control',{action:'reopen',reason:'Eski token',token:stale.token},409);
 console.log('Order reopen PASS: UI editing, audit history, paused recovery, independent cancellations, completed jobs, idempotency and stale token.');
};
