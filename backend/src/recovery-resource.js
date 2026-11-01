'use strict';
// Call only inside an authorized transaction with actor/site RLS context established.
const {describe,storageKind}=require('./recovery-catalog');
const {identifier}=require('./orders-planning');
const {HttpError}=require('./auth');
const denied=()=>{throw new HttpError(403,'FORBIDDEN','Recovery resource unavailable')};
async function authorizeRecoveryResource(client,scope,storedKind,command){
 const descriptor=describe(command);if(storageKind(command)!==storedKind)denied();
 if(command.kind==='createOrder')return descriptor;
 if(command.kind==='inventory'){const p=command.body.payload;for(const [field,table] of [['materialId','inventory_materials'],['locationId','inventory_locations'],['lotId','inventory_lots'],['sourceLocationId','inventory_locations'],['destinationLocationId','inventory_locations'],['orderId','orders'],['workOrderId','work_orders']])if(p[field]){const q=await client.query(`SELECT 1 FROM ${table} WHERE tenant_id=$1 AND site_id=$2 AND id=$3`,[scope.tenantId,scope.siteId,identifier(p[field])]);if(!q.rowCount)denied()}if(p.orderId&&p.workOrderId){const q=await client.query('SELECT 1 FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[scope.tenantId,scope.siteId,identifier(p.orderId),identifier(p.workOrderId)]);if(!q.rowCount)denied()}return descriptor}
 const b=command.body,order=command.kind==='defineRoute'||command.kind==='plan'?command.target:b.orderId;
 const exists=await client.query('SELECT 1 FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[scope.tenantId,scope.siteId,identifier(order)]);if(!exists.rowCount)denied();
 if(command.kind==='operation'&&b.command==='reworkAllocate'){const q=await client.query("SELECT 1 FROM output_dispositions WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4 AND outcome='rework' AND output_lot_id IS NOT NULL",[scope.tenantId,scope.siteId,order,identifier(b.payload.decisionId)]);if(!q.rowCount)denied()}
 if(command.kind==='operation'&&b.command==='reworkRelease'){const q=await client.query('SELECT 1 FROM rework_allocations WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[scope.tenantId,scope.siteId,order,identifier(b.resourceId)]);if(!q.rowCount)denied()}
 if(command.kind==='shipping'&&b.command!=='order'){
  const sh=await client.query('SELECT 1 FROM shipping_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[scope.tenantId,scope.siteId,order,identifier(b.shippingOrderId)]);if(!sh.rowCount)denied();
  const p=b.payload;if(b.command==='allocate'){const q=await client.query('SELECT 1 FROM production_output_lots WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[scope.tenantId,scope.siteId,order,identifier(p.outputLotId)]);if(!q.rowCount)denied()}
  else {const ref=b.command==='dispatch'?p.allocationId:p.dispatchId,type=b.command==='dispatch'?'allocate':'dispatch';const q=await client.query('SELECT 1 FROM shipping_events WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND shipping_order_id=$4 AND id=$5 AND event_type=$6',[scope.tenantId,scope.siteId,order,b.shippingOrderId,identifier(ref),type]);if(!q.rowCount)denied()}
 }
 let job=null;
 if(command.kind==='production'||command.kind==='quality')job=b.workOrderId;
 if(command.kind==='operation'&&['drawingAck','operator','machine','handover'].includes(b.command))job=b.resourceId;
 if(job){const result=await client.query('SELECT 1 FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[scope.tenantId,scope.siteId,order,identifier(job)]);if(!result.rowCount)denied()}
 if(command.kind==='production'||(command.kind==='operation'&&b.command==='drawingAck')){
  const assignments=await client.query('SELECT * FROM ritim_lock_assignments($1,$2,$3)',[scope.tenantId,scope.siteId,job]);
  if(assignments.rowCount!==1||assignments.rows[0].user_id!==scope.identity.userId)denied();
 }
 if(command.kind==='operation'&&['release','dispatch','receive'].includes(b.command)){
  const table=b.command==='receive'?'operation_dispatches':'output_reservation_events';
  const r=await client.query(`SELECT 1 FROM ${table} WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4`,[scope.tenantId,scope.siteId,order,identifier(b.resourceId)]);if(!r.rowCount)denied();
 }
 return descriptor;
}
module.exports={authorizeRecoveryResource};
