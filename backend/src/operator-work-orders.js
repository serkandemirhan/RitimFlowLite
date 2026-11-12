'use strict';
// Operator discovery remains self-only. Explicit team discovery requires a manager
// role verified in this site. This read never authorizes production writes.
const {inTransaction}=require('./db');
const {authorizeScope}=require('./authorization');
const {data,identifier,number,fail}=require('./orders-planning');
const {reconciled}=require('./production-execution');
function routes(api){
 api.get('/sites/:tenantId/:siteId/operator/work-orders',async req=>{
  const s=data(req),q=req.query||{};
  if(Object.keys(q).some(k=>!['limit','after','workOrderId','state','workspace'].includes(k)))fail(400,'INVALID_INPUT','Only limit, after and workOrderId are supported');
  const limit=q.limit===undefined?50:Number(q.limit);
  if(!Number.isInteger(limit)||limit<1||limit>100||String(limit)!==String(q.limit??50))fail(400,'INVALID_INPUT','Limit must be an integer between 1 and 100');
  const workspace=q.workspace||'mine';if(!['mine','team'].includes(workspace))fail(400,'INVALID_INPUT','Invalid workspace');
  const state=q.state||'all';if(!['all','active','finished'].includes(state))fail(400,'INVALID_INPUT','Invalid state');
  const after=q.after===undefined?null:identifier(q.after);
  const workOrderId=q.workOrderId===undefined?null:identifier(q.workOrderId);
  return inTransaction(req.server.pgPool,async c=>{
   await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   const scope=await authorizeScope(c,{...s,capability:'production.write'});
   const team=workspace==='team';if(team&&!scope.roles.some(r=>['manager','tenant_admin','superadmin'].includes(r)))fail(403,'MANAGER_REQUIRED','Manager access required');
   if(!team&&!scope.roles.includes('operator'))fail(403,'OPERATOR_REQUIRED','An active operator membership is required');
   const jobs=await c.query(`SELECT a.user_id assigned_operator_id,w.id,w.order_id,w.purpose,EXISTS(SELECT 1 FROM production_orders cp WHERE (cp.tenant_id,cp.site_id,cp.id)=(w.tenant_id,w.site_id,w.production_order_id) AND cp.compensation_id IS NOT NULL) compensation,w.work_order_number,w.planned_qty,w.status,w.queue_position,COALESCE((SELECT oi.part_name FROM production_orders item_po JOIN order_items oi ON (oi.tenant_id,oi.site_id,oi.id)=(item_po.tenant_id,item_po.site_id,item_po.order_item_id) WHERE (item_po.tenant_id,item_po.site_id,item_po.id)=(w.tenant_id,w.site_id,w.production_order_id)),o.part_name) part_name,o.part_number,op.id operation_id,op.name operation_name,op.sequence,op.kind,m.id machine_id,m.code machine_code,EXISTS(SELECT 1 FROM drawing_revisions d WHERE (d.tenant_id,d.site_id,d.order_id)=(w.tenant_id,w.site_id,w.order_id)) drawing_required FROM work_assignments a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.work_order_id) JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id) JOIN operations op ON (op.tenant_id,op.site_id,op.order_id,op.id)=(w.tenant_id,w.site_id,w.order_id,w.operation_id) LEFT JOIN machines m ON (m.tenant_id,m.site_id,m.id)=(a.tenant_id,a.site_id,a.machine_id) WHERE a.tenant_id=$1 AND a.site_id=$2 AND (a.user_id=$3 OR $8) AND a.released_at IS NULL AND (NOT $8 OR op.kind='internal') AND ($4::uuid IS NULL OR w.id>$4::uuid) AND ($6::uuid IS NULL OR w.id=$6::uuid) AND ($7='all' OR ($7='active' AND w.status NOT IN ('complete','cancelled')) OR ($7='finished' AND w.status IN ('complete','cancelled'))) ORDER BY w.id LIMIT $5`,[s.tenantId,s.siteId,s.identity.userId,after,limit+1,workOrderId,state,team]);
   const more=jobs.rows.length>limit,rows=jobs.rows.slice(0,limit),workOrders=[];
   const operators=team?new Map((await c.query('SELECT user_id,display_name FROM ritim_eligible_operators($1,$2)',[s.tenantId,s.siteId])).rows.map(u=>[u.user_id,u.display_name])):new Map();
   for(const j of rows)j.assignedOperator=j.assigned_operator_id?{id:j.assigned_operator_id,name:operators.get(j.assigned_operator_id)||'Operatör'}:null;
   // The closed-job picker needs identity only. Opening a job still uses the
   // full, reconciled read below; summaries must never authorize an action.
   if(state==='finished'&&!workOrderId)return {workOrders:rows.map(j=>({id:j.id,orderId:j.order_id,workOrderNumber:j.work_order_number,purpose:j.purpose,compensation:j.compensation,assignedOperator:j.assignedOperator,partName:j.part_name,partNumber:j.part_number,status:j.status,plannedQuantity:number(j.planned_qty),operation:{id:j.operation_id,name:j.operation_name,sequence:j.sequence,kind:j.kind},machine:j.machine_id?{id:j.machine_id,code:j.machine_code}:null,summaryOnly:true})),finishedCount:null,nextAfter:more?rows[rows.length-1].id:null};
   const attention=new Map((rows.length?await require('./workflow-summary').facts(c,s,{ids:rows.map(j=>j.id)}):[]).map(j=>[j.id,j]));
   for(const j of rows){
    let produced=null,remaining=null,physical=null,pending=null,warning=null;
    try {
     const b=await reconciled(c,s,j.id); produced=number(Object.values(b.outputs).reduce((a,v)=>a+v,0));const planned=number(j.planned_qty);if(produced>planned)fail(409,'INTEGRITY_ERROR','Production exceeds work order plan');remaining=planned-produced;physical=b.remainingUsableInput;
     const x=await c.query(`SELECT p.id,p.quantity_pieces,COALESCE((SELECT SUM(b.quantity_pieces) FROM shipping_quality_bypasses b WHERE (b.tenant_id,b.site_id,b.production_event_id)=(p.tenant_id,p.site_id,p.id)),0) bypassed,COALESCE(SUM(d.quantity_pieces),0) decided FROM effective_production_events p LEFT JOIN output_dispositions d ON (d.tenant_id,d.site_id,d.work_order_id,d.production_event_id)=(p.tenant_id,p.site_id,p.work_order_id,p.id) WHERE p.tenant_id=$1 AND p.site_id=$2 AND p.work_order_id=$3 AND p.kind IN ('good','pending') GROUP BY p.tenant_id,p.site_id,p.id,p.quantity_pieces`,[s.tenantId,s.siteId,j.id]);pending=0;for(const row of x.rows){const n=number(row.quantity_pieces),decided=number(row.decided)+number(row.bypassed);if(decided>n)fail(409,'INTEGRITY_ERROR','Quality decisions exceed production');pending=number(pending+n-decided)}
    } catch(e){if(!['INTEGRITY_ERROR','PRODUCTION_RECONCILIATION_REQUIRED','OPERATION_UNSUPPORTED'].includes(e.code))throw e;produced=remaining=physical=pending=null;warning=e.code}
    const drawing=await require('./drawing-acknowledgement').current(c,s,j.order_id,j.id);
    workOrders.push({queuePosition:j.queue_position===null?null:Number(j.queue_position),attention:attention.get(j.id)||null,id:j.id,orderId:j.order_id,workOrderNumber:j.work_order_number,purpose:j.purpose,compensation:j.compensation,assignedOperator:j.assignedOperator,partName:j.part_name,partNumber:j.part_number,operation:{id:j.operation_id,name:j.operation_name,sequence:j.sequence,kind:j.kind},machine:j.machine_id?{id:j.machine_id,code:j.machine_code}:null,status:j.status,plannedQuantity:number(j.planned_qty),producedQuantity:produced,remainingQuantity:remaining,physicalInputAvailable:physical,qualityPendingQuantity:pending,drawingRestriction:drawing.required&&!drawing.acknowledged?(drawing.unpublished?'DRAWING_ACKNOWLEDGEMENT_UNSUPPORTED':'DRAWING_ACKNOWLEDGEMENT_REQUIRED'):null,drawing,reconciliationWarning:warning});
   }
   const finishedCount=state==='active'?number((await c.query("SELECT COUNT(*) n FROM work_assignments a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.work_order_id) WHERE a.tenant_id=$1 AND a.site_id=$2 AND (a.user_id=$3 OR $4) AND a.released_at IS NULL AND w.status IN ('complete','cancelled') AND (NOT $4 OR EXISTS(SELECT 1 FROM operations op WHERE op.tenant_id=w.tenant_id AND op.site_id=w.site_id AND op.id=w.operation_id AND op.kind='internal'))",[s.tenantId,s.siteId,s.identity.userId,team])).rows[0].n):null;
   return {workOrders,finishedCount,nextAfter:more?rows[rows.length-1].id:null};
  });
 });
}
module.exports={routes};
