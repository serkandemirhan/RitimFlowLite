'use strict';
// Explicit replay destinations. The ordinary business handlers remain responsible for
// payload, resource, role, drawing and physical quantity checks on every execution.
const {identifier}=require('./orders-planning');
const {HttpError}=require('./auth');
const reject=()=>{throw new HttpError(400,'INVALID_COMMAND','Unsupported recovery command')};
const inventory=Object.freeze({material:{path:'materials'},location:{path:'locations'},receipt:{path:'receipts'},move:{path:'move'},scrap:{path:'scrap'},pick:{path:'pick'}});
const operations=Object.freeze({
 drawingAck:{capability:'production.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/drawing/acknowledge`,resource:true},
 operator:{capability:'orders.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/assignment/operator`,resource:true},
 machine:{capability:'orders.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/assignment/machine`,resource:true},
 handover:{capability:'orders.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/assignment/handover`,resource:true},
 materialReceipt:{capability:'stock.write',suffix:o=>`/orders/${o}/fictional-material-receipts`},
 allocation:{capability:'orders.write',suffix:o=>`/orders/${o}/fictional-material-allocations`},
 physicalReceipt:{capability:'orders.write',suffix:o=>`/orders/${o}/physical-receipts`},
 downstreamPlan:{capability:'planning.write',suffix:o=>`/orders/${o}/downstream-work-orders`},
 reserve:{capability:'planning.write',suffix:o=>`/orders/${o}/output-reservations`},
 release:{capability:'planning.write',suffix:(o,r)=>`/orders/${o}/output-reservations/${r}/releases`,resource:true},
 dispatch:{capability:'stock.write',suffix:(o,r)=>`/orders/${o}/output-reservations/${r}/dispatches`,resource:true},
 receive:{capability:'stock.write',suffix:(o,r)=>`/orders/${o}/operation-dispatches/${r}/receipts`,resource:true}
});
function describe({kind,target,body}){
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof target!=='string')reject();
 if(kind==='shipping'){const o=identifier(body.orderId);if(target!==o||!['order','allocate','dispatch','deliver'].includes(body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();const suffix=body.command==='order'?'/orders':`/orders/${identifier(body.shippingOrderId)}/${body.command}`;return {capability:'shipment.write',suffix:`/orders/${o}/shipping${suffix}`,payload:body.payload}}
 if(kind==='inventory'){if(target!==''||!Object.hasOwn(inventory,body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'stock.write',suffix:'/inventory/'+inventory[body.command].path,payload:body.payload}}
 if(kind==='createOrder'){if(target!=='')reject();return {capability:'orders.write',suffix:'/orders',payload:body}}
 if(kind==='defineRoute'||kind==='plan'){const id=identifier(target);return {capability:kind==='plan'?'planning.write':'orders.write',suffix:`/orders/${id}/${kind==='plan'?'work-orders':'route'}`,payload:body}}
 if(kind==='production'||kind==='quality'){
  const o=identifier(body.orderId),j=identifier(body.workOrderId);if(target!==j||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();
  if(kind==='production'&&!['start','pause','resume','complete','results'].includes(body.action))reject();
  return {capability:kind==='production'?'production.write':'quality.write',suffix:`/orders/${o}/work-orders/${j}/${kind==='production'?'production/'+body.action:'quality/decisions'}`,payload:body.payload}
 }
 if(kind==='operation'){
  if(!Object.hasOwn(operations,body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();const op=operations[body.command],o=identifier(body.orderId);if(target!==o&&target!==(body.resourceId||''))reject();const resource=op.resource?identifier(body.resourceId):'';return {capability:op.capability,suffix:op.suffix(o,resource),payload:body.payload}
 }
 reject();
}
const allowedKinds=Object.freeze({shipping:'shipment.write',inventory:'stock.write',createOrder:'orders.write',defineRoute:'orders.write',plan:'planning.write',production:'production.write',quality:'quality.write',...Object.fromEntries(Object.entries(operations).map(([name,value])=>['operation:'+name,value.capability]))});
function storageKind(command){const d=describe(command),name=command.kind==='operation'?'operation:'+command.body.command:command.kind;if(allowedKinds[name]!==d.capability)reject();return name}
module.exports={describe,allowedKinds,storageKind};
