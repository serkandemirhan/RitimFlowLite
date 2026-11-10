'use strict';
const assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,p=s.prefix;
 const customer=s.steps.customer,part=s.steps.part;
 const order=await h.post('flow-order','/orders',{orderNumber:p+'-AKIS',customer:customer.name,customerId:customer.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:5,dueDate:'2026-11-20'});
 const po=await h.post('flow-po','/orders/'+order.id+'/production-orders',{number:p+'-AKIS-UE',quantity:5,operations:[{name:'Pilot kesim',kind:'internal',setupMinutes:5,cycleMinutes:2},{name:'Pilot paketleme',kind:'internal',setupMinutes:2,cycleMinutes:1}]});
 const planned=await h.post('flow-plan','/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-11'});
 s.flow={orderId:order.id,po:planned};h.save();
 for(const [i,j]of planned.workOrders.entries()){
  const b='/orders/'+order.id+'/work-orders/'+j.id;
  await h.post('flow-assign-'+i,b+'/assignment/operator',{operatorId:s.operatorId,reason:'Pilot akış'});
  await h.post('flow-machine-'+i,b+'/assignment/machine',{machineId:s.machines[i+1].id,reason:'Pilot akış'});
  if(i===0)await h.post('flow-pick','/inventory/pick',{orderId:order.id,workOrderId:j.id,lotId:s.stock.lotId,sourceLocationId:s.locationId,quantity:5});
  else {
   const flow=await h.read('/production-orders/'+po.id+'/flow');const o=flow.outputs.find(x=>x.destinationWorkOrderId===j.id);
   const r=await h.post('flow-reserve','/orders/'+order.id+'/output-reservations',{outputLotId:o.lotId,destinationWorkOrderId:j.id,quantity:5});
   const d=await h.post('flow-dispatch','/orders/'+order.id+'/output-reservations/'+r.id+'/dispatches',{quantity:5});
   await h.post('flow-receive','/orders/'+order.id+'/operation-dispatches/'+d.id+'/receipts',{quantity:5});
   assert.equal((await h.read(b+'/production/balances')).inputQuantity,5);
   h.check('Ic operasyon arasi sevk kabul','PASS','5 onaylı parça ayırma → sevk → kabul; ikinci işte fiziksel girdi 5.','Authenticated API flow');
  }
  await h.post('flow-start-'+i,b+'/production/start',{},'operatorDesktop');
  const balance=await h.read(b+'/production/balances');
  const body={lotId:balance.lots[0].lotId,kind:'pending',quantity:5,separateQualityRequest:true};
  await h.post('flow-result-'+i,b+'/production/results',body,'operatorDesktop');
  const replay=await h.raw(h.pages.operatorDesktop,b+'/production/results',body,p+'-flow-result-'+i);assert(replay.status<300);assert.equal((await h.read(b+'/production/balances')).consumedQuantity,5);
  h.check('Ayni islem tekrari miktari cogaltmaz','PASS','Aynı idempotency anahtarıyla üretim tekrar gönderildi; tüketim 5 kaldı. Ağ kesintisi arayüz testi değildir.','Authenticated API replay');
  const q=await h.read(b+'/quality');const output=q.outputs[0];
  await h.post('flow-request-'+i,b+'/production/request-quality',{eventIds:[output.eventId]},'operatorDesktop');
  await h.post('flow-approve-'+i,b+'/quality/decisions',{eventId:output.eventId,lotId:output.lotId,outputLotId:output.outputLotId,outcome:'approved',quantity:5,evidence:'Pilot 5 adet uygun'},'qualityDesktop');
  await h.post('flow-complete-'+i,b+'/production/complete',{},'operatorDesktop');
 }
 const ship=await h.read('/orders/'+order.id+'/shipping');const lot=ship.lots.find(l=>l.availableToShip===5);assert(lot);
 const shipment=await h.post('flow-shipment','/orders/'+order.id+'/shipping/orders',{}),base='/orders/'+order.id+'/shipping/orders/'+shipment.id;
 const a=await h.post('flow-ship-allocate',base+'/allocate',{outputLotId:lot.lotId,quantity:5});
 const d=await h.post('flow-ship-dispatch',base+'/dispatch',{allocationId:a.id,quantity:5});
 await h.post('flow-ship-deliver',base+'/deliver',{dispatchId:d.id,quantity:5});
 assert.equal((await h.read('/orders/'+order.id+'/closing')).netDelivered,5);
 await h.post('flow-close','/orders/'+order.id+'/close',{reason:'Pilot test: 5 adet teslim edildi'});
 assert.equal((await h.read('/orders/'+order.id+'/closing')).status,'closed');
 await h.navigate('admin','shipping');await h.shot('12-shipping');await h.pages.admin.evaluate(id=>RitimPremiumAPI.openOrder(id),order.id);await h.idle(h.pages.admin);await h.shot('13-closed-order');
 h.check('Uretimden sevkiyata kapali akis','PASS','5 adet / 2 operasyon: stok teslim, üretim, kalite onayı, iç sevk-kabul, ikinci üretim, kalite, müşteri sevk-teslim ve sipariş kapatma. Net teslim 5.','Authenticated API flow + desktop rendered evidence');
 return {order:order.orderNumber,status:'closed',netDelivered:5};
};
