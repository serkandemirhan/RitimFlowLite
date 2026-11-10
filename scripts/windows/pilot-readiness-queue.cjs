'use strict';
const assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,p=s.prefix,c=s.steps.customer,part=s.steps.part,jobs=[];
 for(let i=0;i<2;i++){
  const order=await h.post('queue-order-'+i,'/orders',{orderNumber:p+'-KUYRUK-'+i,customer:c.name,customerId:c.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:1,dueDate:'2026-11-20'});
  const po=await h.post('queue-po-'+i,'/orders/'+order.id+'/production-orders',{number:p+'-Q-UE-'+i,quantity:1,operations:[{name:'Pilot zamanlama',kind:'internal',setupMinutes:5,cycleMinutes:2}]});
  const planned=await h.post('queue-plan-'+i,'/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-11'}),j=planned.workOrders[0],base='/orders/'+order.id+'/work-orders/'+j.id;
  jobs.push({id:j.id,orderId:order.id,base});
  await h.post('queue-operator-'+i,base+'/assignment/operator',{operatorId:s.operatorId,reason:'Pilot kuyruk'});
  await h.post('queue-machine-'+i,base+'/assignment/machine',{machineId:s.machines[1].id,reason:'Pilot kuyruk'});
  await h.post('queue-pick-'+i,'/inventory/pick',{orderId:order.id,workOrderId:j.id,lotId:s.stock.lotId,sourceLocationId:s.locationId,quantity:1});
  const b=await h.read('/machine-planning');await h.post('queue-place-'+i,'/machine-planning/move',{workOrderId:j.id,machineId:s.machines[1].id,beforeId:null,revision:b.revision,reason:'Pilot sıralama'});
 }
 const before=await h.read('/machine-planning'),first=before.jobs.find(j=>j.id===jobs[0].id),next=before.jobs.find(j=>j.id===jobs[1].id);
 await h.post('queue-duration',jobs[0].base+'/timing',{version:first.timing.version,setupMinutes:5,cycleMinutes:22});
 const after=await h.read('/machine-planning'),nextAfter=after.jobs.find(j=>j.id===jobs[1].id);
 s.queueEvidence={jobs,before:before.jobs.filter(j=>jobs.some(x=>x.id===j.id)),after:after.jobs.filter(j=>jobs.some(x=>x.id===j.id))};h.save();
 assert(next.schedule.start&&nextAfter.schedule.start);assert.equal(new Date(nextAfter.schedule.start)-new Date(next.schedule.start),20*60000);
 await h.navigate('admin','machine-planning');await h.shot('18-queue-duration');
 h.check('Sure degisince kuyruk kayar','PASS','İki hazır iş aynı makinede. İlkinin çevrim süresi 2→22 dk değişince ikincinin başlangıcı tam 20 dk ileri taşındı.','Authenticated API + desktop screenshot');
 const extra=await h.post('second-container','/inventory/locations',{kind:'container',code:p+'-RAF2',parentId:s.steps['location-region'].id});
 await h.post('stock-transfer','/inventory/move',{lotId:s.stock.lotId,sourceLocationId:s.locationId,destinationLocationId:extra.id,quantity:2});
 const bad=await h.raw(h.pages.admin,'/inventory/move',{lotId:s.stock.lotId,sourceLocationId:extra.id,destinationLocationId:s.locationId,quantity:3});assert.equal(bad.status,409);
 await h.post('stock-transfer-back','/inventory/move',{lotId:s.stock.lotId,sourceLocationId:extra.id,destinationLocationId:s.locationId,quantity:2});
 h.check('Depo ici tasima','PASS','Aynı depoda iki konum arasında 2 adet taşıma ve geri taşıma; 2 mevcutken 3 taşıma 409 ile engellendi.','Authenticated API');
 return {queueShiftMinutes:20,stockTransfer:2};
};
