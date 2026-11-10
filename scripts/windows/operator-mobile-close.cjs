'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(h){
 await h.role('operator');const p=h.worker,s=h.state,order=s.steps['drag-order'].id,job=s.steps['drag-plan-0'].workOrders[0].id,out=path.resolve('artifacts/cloud-release/operator-mobile');
 await p.setViewportSize({width:390,height:844});await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),job);
 await p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 await p.screenshot({path:path.join(out,'09-before-finish.png'),fullPage:true});
 if((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status!=='complete')await p.getByRole('button',{name:'İşi bitir',exact:true}).click();
 await p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 assert.equal((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status,'complete');
 s.mobileChecks.push({name:'Finish through mobile UI',time:new Date().toISOString()});h.save();
 await p.screenshot({path:path.join(out,'10-finished-mobile.png'),fullPage:true});await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'10-finished-desktop.png'),fullPage:true});return {finished:true};
};
