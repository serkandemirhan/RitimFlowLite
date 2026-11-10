'use strict';
module.exports=async h=>{
 const s=h.state,customer=s.steps.customer,part=s.steps.part;
 const order=await h.post('compact6-order','/orders',{orderNumber:'SAHA-20261108-06',customer:customer.name,customerId:customer.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:3,dueDate:'2026-11-20'});
 const po=await h.post('compact6-po','/orders/'+order.id+'/production-orders',{number:'SAHA-20261108-06-UE1',quantity:3,operations:[{name:'CNC torna',kind:'internal',setupMinutes:5,cycleMinutes:2}]});
 const plan=await h.post('compact6-plan','/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-08'}),job=plan.workOrders[0],base='/orders/'+order.id+'/work-orders/'+job.id;
 await h.post('compact6-machine',base+'/assignment/machine',{machineId:s.steps['machine-CNC-01'].id,reason:'Android cihaz kabul testi'});
 await h.post('compact6-worker',base+'/assignment/operator',{operatorId:h.operatorId,reason:'Android cihaz kabul testi'});
 const location=s.steps['location-container'].id;
 const stock=await h.post('compact6-stock','/inventory/receipts',{materialId:s.steps.material.id,locationId:location,lotCode:'SAHA-20261108-06-LOT',quantity:3,supplierRef:'Celik Merkezi',documentRef:'SAHA-20261108-06-IRS'});
 await h.post('compact6-pick','/inventory/pick',{orderId:order.id,workOrderId:job.id,lotId:stock.lotId,sourceLocationId:location,quantity:3});
 return {order:order.id,job:job.id,base};
};
