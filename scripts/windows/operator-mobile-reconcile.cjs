'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(h){
 const p=h.worker,s=h.state,order=s.steps['drag-order'].id,job=s.steps['drag-plan-1'].workOrders[0].id,base='/orders/'+order+'/work-orders/'+job,out=path.resolve('artifacts/cloud-release/operator-mobile');
 const idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 const jobs=(await h.read('/orders/'+order+'/work-orders')).workOrders;assert.equal(jobs.find(x=>x.id===s.steps['drag-plan-0'].workOrders[0].id).status,'complete');
 if(!s.mobileChecks.some(x=>x.name==='Finish through mobile UI')){s.mobileChecks.push({name:'Finish through mobile UI',time:new Date().toISOString()});h.save();}
 await p.setViewportSize({width:390,height:844});await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),job);await idle();
 assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);
 const retry=p.getByRole('button',{name:'Aynı işlemle tekrar dene',exact:true});if(await retry.count()){await retry.first().click();await idle();}
 assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);assert.equal((await h.read('/recovery',p)).commands.length,0);
 s.mobileChecks.push({name:'Scrap response lost after commit and retried once',consumed:1,time:new Date().toISOString()});h.save();
 await p.screenshot({path:path.join(out,'11-recovered.png'),fullPage:true});
 await p.getByRole('button',{name:'İşi bitir',exact:true}).click();await idle();assert.equal((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status,'complete');
 s.mobileChecks.push({name:'Scrap job finished on mobile',time:new Date().toISOString()});h.save();
 await p.screenshot({path:path.join(out,'12-scrap-finished.png'),fullPage:true});await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'10-finished-desktop.png'),fullPage:true});
 return {checks:s.mobileChecks,pending:0};
};
