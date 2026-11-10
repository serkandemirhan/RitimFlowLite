'use strict';
// Explicit replay destinations. The ordinary business handlers remain responsible for
// payload, resource, role, drawing and physical quantity checks on every execution.
const {identifier}=require('./orders-planning');
const {HttpError}=require('./auth');
const reject=()=>{throw new HttpError(400,'INVALID_COMMAND','Unsupported recovery command')};
const inventory=Object.freeze({material:{path:'materials'},location:{path:'locations'},receipt:{path:'receipts'},move:{path:'move'},scrap:{path:'scrap'},pick:{path:'pick'}});
const operations=Object.freeze({
 productionCorrection:{capability:'production.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/production/corrections`,resource:true},
 productionCorrectionDecision:{capability:'planning.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/production/correction-decision`,resource:true},
 operatorHandoff:{capability:'production.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/handoff`,resource:true},
 orderUpdate:{capability:'orders.write',suffix:o=>`/orders/${o}/update`},
 productionBatches:{capability:'planning.write',suffix:o=>`/orders/${o}/production-batches`},
 jobTiming:{capability:'planning.write',suffix:(o,r)=>`/orders/${o}/work-orders/${r}/timing`,resource:true},
 compensationApprove:{capability:'quality.write',suffix:o=>'/orders/'+o+'/compensations'},
 orderClose:{capability:'orders.write',suffix:o=>'/orders/'+o+'/close'},
 rmaAuthorize:{capability:'shipment.write',suffix:o=>`/orders/${o}/rma`},
 rmaReceipt:{capability:'stock.write',suffix:(o,r)=>`/orders/${o}/rma/${r}/receipts`,resource:true},
 rmaInspect:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rma/receipts/${r}/inspections`,resource:true},
 rmaDisposition:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rma/inspections/${r}/dispositions`,resource:true},
 rmaRelease:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rma/dispositions/${r}/releases`,resource:true},
 rmaRework:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rma/dispositions/${r}/rework`,resource:true},
 outsourcingJob:{capability:'planning.write',suffix:o=>`/orders/${o}/outsourcing/jobs`},
 outsourcingDispatch:{capability:'stock.write',suffix:(o,r)=>`/orders/${o}/outsourcing/jobs/${r}/dispatches`,resource:true},
 outsourcingReturn:{capability:'stock.write',suffix:(o,r)=>`/orders/${o}/outsourcing/dispatches/${r}/returns`,resource:true},
 outsourcingPlan:{capability:'planning.write',suffix:(o,r)=>`/orders/${o}/outsourcing/returns/${r}/downstream-work-orders`,resource:true},
 outsourcingInspect:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/outsourcing/returns/${r}/inspections`,resource:true},
 reworkAllocate:{capability:'quality.write',suffix:o=>`/orders/${o}/rework-allocations`},
 reworkRelease:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rework-allocations/${r}/releases`,resource:true},
 reworkWorkOrder:{capability:'quality.write',suffix:(o,r)=>`/orders/${o}/rework-allocations/${r}/work-order`,resource:true},
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
 if(kind==='machineBatch'){if(target!==''||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();require('./machine-queue-moves').input(body.payload);return {capability:'planning.write',suffix:'/machine-planning/move-batch',payload:body.payload}}
 if(kind==='workspacePreference'){if(!['orders','jobs','compensations','machine-planning'].includes(target)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'orders.read',suffix:'/workspace-preferences/'+target,payload:body.payload}}
 if(kind==='routeTemplate'){if(!['create','update','delete'].includes(body.action)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();if(body.action==='create'&&target!=='')reject();return {capability:'planning.write',suffix:'/route-templates'+(body.action==='create'?'':'/'+identifier(target)+'/'+body.action),payload:body.payload}}
 if(kind==='machineCreate'){if(target!==''||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'master.write',suffix:'/machine-planning/machines',payload:body.payload}}
 if(kind==='machinePlanning'){if(target!==''||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'planning.write',suffix:'/machine-planning/move',payload:body.payload}}
 if(kind==='productionSupplier'){if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||!['dispatch','return','complete'].includes(body.action))reject();return {capability:body.action==='complete'?'quality.write':'stock.write',suffix:'/production-orders/'+identifier(target)+'/work-orders/'+identifier(body.workOrderId)+'/supplier/'+body.action,payload:body.payload}}
 if(kind==='siteCalendar'){if(target!==''||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'planning.write',suffix:'/work-calendar',payload:body.payload}}
 if(kind==='machineCalendar'){if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'planning.write',suffix:'/machine-planning/machines/'+identifier(target)+'/calendar',payload:body.payload}}
 if(kind==='productionOrder'){if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||!['create','state','update'].includes(body.action))reject();const id=identifier(target);return {capability:'planning.write',suffix:body.action==='create'?'/orders/'+id+'/production-orders':'/production-orders/'+id+'/'+body.action,payload:body.payload}}
 if(kind==='masterData'){if(!['customers','parts','scrap-reasons','operations'].includes(body.entity)||!['create','update','delete'].includes(body.action)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();const id=body.action==='create'?'':identifier(target);if(body.action==='create'&&target!=='')reject();return {capability:'master.write',suffix:'/master-data/'+body.entity+(id?'/'+id+'/'+body.action:''),payload:body.payload}}
 if(kind==='outsourcing'){if(target!==''||body.command!=='supplier'||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'stock.write',suffix:'/outsourcing/suppliers',payload:body.payload}}
 if(kind==='shipping'){const o=identifier(body.orderId);if(target!==o||!['order','allocate','dispatch','deliver'].includes(body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();const suffix=body.command==='order'?'/orders':`/orders/${identifier(body.shippingOrderId)}/${body.command}`;return {capability:'shipment.write',suffix:`/orders/${o}/shipping${suffix}`,payload:body.payload}}
 if(kind==='inventory'){if(target!==''||!Object.hasOwn(inventory,body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();return {capability:'stock.write',suffix:'/inventory/'+inventory[body.command].path,payload:body.payload}}
 if(kind==='createOrder'){if(target!=='')reject();return {capability:'orders.write',suffix:'/orders',payload:body}}
 if(kind==='defineRoute'||kind==='plan'){const id=identifier(target);return {capability:kind==='plan'?'planning.write':'orders.write',suffix:`/orders/${id}/${kind==='plan'?'work-orders':'route'}`,payload:body}}
 if(kind==='production'||kind==='quality'){
  const o=identifier(body.orderId),j=identifier(body.workOrderId);if(target!==j||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();
  if(kind==='production'&&!['start','pause','resume','complete','results','request-quality'].includes(body.action))reject();
  return {capability:kind==='production'?'production.write':'quality.write',suffix:`/orders/${o}/work-orders/${j}/${kind==='production'?'production/'+body.action:'quality/decisions'}`,payload:body.payload}
 }
 if(kind==='operation'){
  if(!Object.hasOwn(operations,body.command)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))reject();const op=operations[body.command],o=identifier(body.orderId);if(target!==o&&target!==(body.resourceId||''))reject();const resource=op.resource?identifier(body.resourceId):'';return {capability:op.capability,suffix:op.suffix(o,resource),payload:body.payload}
 }
 reject();
}
const allowedKinds=Object.freeze({machineBatch:'planning.write',workspacePreference:'orders.read',routeTemplate:'planning.write',siteCalendar:'planning.write',machineCalendar:'planning.write',machineCreate:'master.write',machinePlanning:'planning.write','productionSupplier:dispatch':'stock.write','productionSupplier:return':'stock.write','productionSupplier:complete':'quality.write',productionOrder:'planning.write',masterData:'master.write',outsourcing:'stock.write',shipping:'shipment.write',inventory:'stock.write',createOrder:'orders.write',defineRoute:'orders.write',plan:'planning.write',production:'production.write',quality:'quality.write',...Object.fromEntries(Object.entries(operations).map(([name,value])=>['operation:'+name,value.capability]))});
function storageKind(command){const d=describe(command),name=command.kind==='productionSupplier'?'productionSupplier:'+command.body.action:command.kind==='operation'?'operation:'+command.body.command:command.kind;if(allowedKinds[name]!==d.capability)reject();return name}
module.exports={describe,allowedKinds,storageKind};
