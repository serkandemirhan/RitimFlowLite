'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,c=s.steps.customer,p=s.steps.part,steps=[];
 const order=await h.post('perf4-order','/orders',{orderNumber:'SAHA-20261107-04',customer:c.name,customerId:c.id,partName:p.name,partNumber:p.code,partId:p.id,orderedQuantity:1,dueDate:'2026-11-20'});
 const po=await h.post('perf4-po','/orders/'+order.id+'/production-orders',{number:'SAHA-20261107-04-UE1',quantity:1,operations:[{name:'CNC torna',kind:'internal',setupMinutes:5,cycleMinutes:2}]});
 const plan=await h.post('perf4-plan','/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-07'}),job=plan.workOrders[0],base='/orders/'+order.id+'/work-orders/'+job.id;
 await h.post('perf4-machine',base+'/assignment/machine',{machineId:s.steps['machine-CNC-01'].id,reason:'Performans kabul testi'});
 await h.post('perf4-worker',base+'/assignment/operator',{operatorId:h.operatorId,reason:'Performans kabul testi'});
 const location=s.steps['location-container'].id,stock=await h.post('perf4-stock','/inventory/receipts',{materialId:s.steps.material.id,locationId:location,lotCode:'SAHA-20261107-04-LOT',quantity:1,supplierRef:'Celik Merkezi',documentRef:'SAHA-20261107-04-IRS'});
 await h.post('perf4-pick','/inventory/pick',{orderId:order.id,workOrderId:job.id,lotId:stock.lotId,sourceLocationId:location,quantity:1});
 const w=h.worker,out='artifacts/cloud-release/operator-performance';fs.mkdirSync(out,{recursive:true});await w.setViewportSize({width:384,height:721});
 const save=()=>fs.writeFileSync(out+'/live-actions.json',JSON.stringify({method:'Live authenticated desktop Chrome at mobile viewport; app command handlers, not real phone touch timings',order:order.orderNumber,steps},null,2));
 const measure=async(name,fn)=>{const t=Date.now();await fn();steps.push({name,ms:Date.now()-t});save();console.log(JSON.stringify(steps.at(-1)));const error=(await w.locator('#api-alert').textContent()).trim();if(error&&!/başlatıldı|duraklatıldı|devam ediliyor|kaydedildi|tamamlandı/.test(error))throw Error(error);await w.screenshot({path:out+'/'+name+'.png',fullPage:true})};
 await measure('open',()=>w.evaluate(id=>RitimPremiumAPI.openAssigned(id),job.id));
 // Notifications are polled asynchronously; they are not a precondition for
 // production checks (compact banner geometry has its own browser test).
 await measure('start',()=>w.evaluate(()=>RitimPremiumAPI.productionAction('start')));
 assert.equal((await h.read(base+'/production/balances')).status,'running');
 await measure('pause',()=>w.evaluate(async()=>{RitimPremiumAPI.operatorPauseReason('Takım değişimi');await RitimPremiumAPI.productionAction('pause')}));
 assert.equal((await h.read(base+'/production/balances')).status,'paused');
 await measure('resume',()=>w.evaluate(()=>RitimPremiumAPI.productionAction('resume')));
 await measure('scrap',()=>w.evaluate(lotId=>RitimPremiumAPI.productionAction('results',{lotId,kind:'scrap',quantity:1}),stock.lotId));
 assert.equal((await h.read(base+'/production/balances')).outputs.scrap,1);
 await measure('finish',()=>w.evaluate(()=>RitimPremiumAPI.productionAction('complete')));
 const balance=await h.read(base+'/production/balances');assert.equal(balance.status,'complete');assert.equal(balance.consumedQuantity,1);assert.equal((await h.read('/recovery',w)).commands.length,0);
 assert.equal(await w.locator('.operator-list-panel>summary').isVisible(),false);assert.equal(await w.locator('.operator-completed-list>summary').isVisible(),true);
 return {status:'PASS',steps};
};
