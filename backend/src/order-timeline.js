'use strict';
const {scoped,identifier,lockedOrder,number}=require('./orders-planning');
const iso=x=>x?new Date(x).toISOString():null;
async function read(c,s,id){
 const order=await lockedOrder(c,s,id);
 const items=await require('./order-items').items(c,s,id);
 const parents=(await c.query('SELECT id,order_item_id,number,quantity,planning_state,planned_date::text,cancelled_at,compensation_id FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY created_at,id',[s.tenantId,s.siteId,id])).rows;
 const operations=(await c.query(`SELECT op.id operation_id,op.production_order_id,op.name,op.kind,op.sequence,
 w.id,w.work_order_number,w.status,w.planned_qty,w.purpose,
 (SELECT min(a.occurred_at) FROM audit_events a WHERE (a.tenant_id,a.site_id,a.entity_id)=(w.tenant_id,w.site_id,w.id) AND a.entity_type='work_order' AND a.event_type='production.start') actual_start,
 (SELECT max(a.occurred_at) FROM audit_events a WHERE (a.tenant_id,a.site_id,a.entity_id)=(w.tenant_id,w.site_id,w.id) AND a.entity_type='work_order' AND a.event_type IN ('production.complete','production_supplier.complete')) actual_end
 FROM operations op LEFT JOIN work_orders w ON (w.tenant_id,w.site_id,w.operation_id)=(op.tenant_id,op.site_id,op.id)
 WHERE op.tenant_id=$1 AND op.site_id=$2 AND op.order_id=$3 ORDER BY op.sequence,w.created_at,w.id`,[s.tenantId,s.siteId,id])).rows;
 const dispatches=(await c.query(`SELECT e.id,e.work_order_id,e.quantity,e.created_at,e.expected_return_date::text,su.name,
 COALESCE((SELECT SUM(r.quantity) FROM production_supplier_events r WHERE (r.tenant_id,r.site_id,r.dispatch_id)=(e.tenant_id,e.site_id,e.id) AND r.kind='return'),0) returned,
 (SELECT max(r.created_at) FROM production_supplier_events r WHERE (r.tenant_id,r.site_id,r.dispatch_id)=(e.tenant_id,e.site_id,e.id) AND r.kind='return') last_return
 FROM production_supplier_events e JOIN outsourcing_suppliers su ON (su.tenant_id,su.site_id,su.id)=(e.tenant_id,e.site_id,e.supplier_id)
 WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.order_id=$3 AND e.kind='dispatch' ORDER BY e.created_at,e.id`,[s.tenantId,s.siteId,id])).rows;
 const facts=await require('./workflow-summary').facts(c,s,{orderId:id});
 const board=await require('./machine-planning').board(c,s);
 const estimates=new Map(board.jobs.map(j=>[j.id,j.schedule])),attention=new Map(facts.map(j=>[j.id,j]));
 const rows=operations.map(r=>{const f=attention.get(r.id),outside=dispatches.filter(d=>d.work_order_id===r.id).map(d=>({id:d.id,supplier:d.name,quantity:number(d.quantity),returned:number(d.returned),sentAt:iso(d.created_at),expectedReturnDate:d.expected_return_date,lastReturnAt:iso(d.last_return)}));return {id:r.id||r.operation_id,workOrderId:r.id,operation:r.name,kind:r.kind,sequence:r.sequence,productionOrderId:r.production_order_id,number:r.work_order_number,purpose:r.purpose,status:r.status||'unplanned',quantity:r.planned_qty===null?null:number(r.planned_qty),machine:f?.machineCode||null,reason:f?.reason||null,held:f?.executionHeld||false,produced:f?.produced||0,schedule:estimates.get(r.id)||null,actualStart:iso(r.actual_start),actualEnd:iso(r.actual_end),dispatches:outside}});
 const productionOrders=parents.map(p=>({id:p.id,orderItemId:p.order_item_id,number:p.number,quantity:number(p.quantity),planningState:p.planning_state,plannedDate:p.planned_date,cancelled:!!p.cancelled_at,compensation:!!p.compensation_id,operations:rows.filter(r=>r.productionOrderId===p.id)}));
 const legacy=rows.filter(r=>!r.productionOrderId);if(legacy.length)productionOrders.push({id:'legacy',orderItemId:items.length===1?items[0].id:null,number:'Önceki üretim kayıtları',quantity:null,planningState:'planned',operations:legacy});
 return {orderId:id,orderNumber:order.order_number,dueDate:items.map(i=>i.dueDate).filter(Boolean).sort()[0]||null,items,productionOrders,generatedAt:new Date().toISOString()};
}
function routes(api){api.get('/sites/:tenantId/:siteId/orders/:orderId/timeline',req=>scoped(req,(c,s)=>read(c,s,identifier(req.params.orderId))))}
module.exports={routes,read};
