'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(h){
 await h.role('operator');const p=h.worker,s=h.state,order=s.steps['drag-order'].id,job=s.steps['drag-plan-1'].workOrders[0].id,base='/orders/'+order+'/work-orders/'+job,out=path.resolve('artifacts/cloud-release/operator-mobile');
 const idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 const click=async name=>{await p.getByRole('button',{name,exact:true}).click();await idle()};
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Bildirimler',exact:true}).waitFor({timeout:90000});await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),job);await idle();
 if(!(await h.read(base+'/drawing',p)).acknowledged){await click('Güncel Çizimi Aç');await p.waitForFunction(()=>!document.querySelector('[onclick="RitimPremiumAPI.ackDrawing()"]')?.disabled,null,{timeout:45000});await p.locator('#api-drawing-dialog').getByRole('button',{name:'Kapat',exact:true}).click();await click('Bu çizimi inceledim');}
 if((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status==='waiting')await click('İşi başlat');
 let lost=false,committedStatus=null;
 const pattern='**/recovery/*/retry';const intercept=async route=>{if(lost)return route.continue();const response=await route.fetch();committedStatus=response.status();if(response.ok()){lost=true;await route.abort('connectionfailed')}else await route.fulfill({response})};
 try{
  assert.equal((await h.read(base+'/production/balances')).consumedQuantity,0);
  await click('Hurda gir');await p.locator('#operator-dialog-qty').fill('1');
  await p.route(pattern,intercept);await click('Hurdayı kaydet');await p.unroute(pattern,intercept);
  assert(lost);assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);
  await p.screenshot({path:path.join(out,'11-response-lost.png'),fullPage:true});
  await p.getByRole('button',{name:'Aynı işlemle tekrar dene',exact:true}).first().click();await idle();
  assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);assert.equal((await h.read('/recovery',p)).commands.length,0);
  s.mobileChecks.push({name:'Scrap response lost after commit and retried once',consumed:1,committedStatus,time:new Date().toISOString()});h.save();
  await click('İşi bitir');assert.equal((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status,'complete');
  s.mobileChecks.push({name:'Scrap job finished on mobile',time:new Date().toISOString()});h.save();await p.screenshot({path:path.join(out,'12-scrap-finished.png'),fullPage:true});
  return s.mobileChecks;
 }catch(e){await p.screenshot({path:path.join(out,'scrap-failure.png'),fullPage:true});throw e}finally{await p.unroute(pattern,intercept)}
};
