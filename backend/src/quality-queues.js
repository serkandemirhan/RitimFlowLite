'use strict';
// Bounded discovery read models. Decisions still use quality-disposition's
// reconciliation, provenance, order locks and quantity checks.
const {data,identifier,number,fail}=require('./orders-planning');
const {inTransaction}=require('./db');
const {authorizeScope}=require('./authorization');
function filters(q={},rework=false){const allowed=['q','orderId','limit','after',...(rework?['state']:[])];if(Object.keys(q).some(k=>!allowed.includes(k)))fail(400,'INVALID_INPUT','Geçersiz kuyruk filtresi');const query=q.q??'',limit=Number(q.limit??25),state=q.state??'all';if(typeof query!=='string'||query.length>120||!Number.isSafeInteger(limit)||limit<1||limit>100||String(limit)!==String(q.limit??25)||rework&&!['active','all'].includes(state))fail(400,'INVALID_INPUT','Geçersiz arama veya sayfa boyutu');return {query:query.trim(),limit,state,orderId:q.orderId?identifier(q.orderId):null,after:q.after?identifier(q.after):null}}
async function cursor(c,s,table,id,extra=''){if(id&&!(await c.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND site_id=$2 AND id=$3 ${extra}`,[s.tenantId,s.siteId,id])).rowCount)fail(400,'INVALID_INPUT','Sayfa konumu bu iş yerinde bulunamadı')}
async function quality(c,s,q={}){const f=filters(q),args=[s.tenantId,s.siteId,f.query,f.orderId];await cursor(c,s,'production_events',f.after,"AND kind IN ('good','pending')");
 const sql=`WITH disposed AS (SELECT production_event_id,SUM(quantity_pieces) quantity FROM output_dispositions WHERE tenant_id=$1 AND site_id=$2 GROUP BY production_event_id), candidates AS MATERIALIZED (
 SELECT e.id,e.work_order_id,w.order_id,e.kind,e.quantity_pieces,COALESCE(d.quantity,0) decided,ol.id output_lot_id,ol.input_lot_id,w.work_order_number,w.status,o.order_number,o.customer,o.part_name,op.name operation
 FROM effective_production_events e JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(e.tenant_id,e.site_id,e.work_order_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(e.tenant_id,e.site_id,w.order_id)
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 LEFT JOIN disposed d ON d.production_event_id=e.id
 LEFT JOIN production_output_lots ol ON (ol.tenant_id,ol.site_id,ol.production_event_id)=(e.tenant_id,e.site_id,e.id)
 WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.kind IN ('good','pending') AND e.quantity_pieces>COALESCE(d.quantity,0) AND (NOT e.separate_quality_request OR EXISTS(SELECT 1 FROM production_quality_requests qr WHERE qr.tenant_id=e.tenant_id AND qr.site_id=e.site_id AND qr.production_event_id=e.id))
 AND ($3='' OR strpos(lower(concat_ws(' ',w.work_order_number,o.order_number,o.customer,o.part_name,op.name,e.id::text)),lower($3))>0)
 AND ($4::uuid IS NULL OR w.order_id=$4)) `;
 const count=(await c.query(sql+`SELECT (SELECT count(*) FROM candidates) total,(SELECT count(DISTINCT work_order_id) FROM candidates) jobs,
 COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM candidates WHERE ($5::uuid IS NULL OR id>$5) ORDER BY id LIMIT $6) p),'[]'::jsonb) page`,[...args,f.after,f.limit+1])).rows[0];
 const rows=count.page;
 const page=rows.slice(0,f.limit);return {items:page.map(x=>({job:{id:x.work_order_id,orderId:x.order_id,workOrderNumber:x.work_order_number,number:x.work_order_number,orderNumber:x.order_number,partName:x.part_name,customer:x.customer,operation:x.operation,status:x.status},output:{eventId:x.id,outputLotId:x.output_lot_id,lotId:x.input_lot_id,kind:x.kind,unresolved:number(number(x.quantity_pieces)-number(x.decided)),provenanceStatus:x.output_lot_id?'linked':'historical_unreconciled'}})),total:number(count.total),workOrderTotal:number(count.jobs),query:f.query,orderId:f.orderId,nextAfter:rows.length>f.limit?page.at(-1).id:null};
}
async function rework(c,s,q={}){const f=filters(q,true),args=[s.tenantId,s.siteId,f.query,f.orderId,f.state];await cursor(c,s,'output_dispositions',f.after,"AND outcome='rework'");
 const sql=`WITH releases AS (SELECT allocation_id,SUM(quantity_pieces) quantity FROM rework_allocation_releases WHERE tenant_id=$1 AND site_id=$2 GROUP BY allocation_id), totals AS (
 SELECT a.decision_id,SUM(a.quantity_pieces-COALESCE(r.quantity,0)) allocated,bool_or(COALESCE(r.quantity,0)>a.quantity_pieces) invalid,
 bool_or(a.quantity_pieces>COALESCE(r.quantity,0) AND (w.id IS NULL OR w.status NOT IN ('complete','cancelled'))) active
 FROM rework_allocations a LEFT JOIN releases r ON r.allocation_id=a.id
 LEFT JOIN rework_inputs i ON (i.tenant_id,i.site_id,i.allocation_id)=(a.tenant_id,a.site_id,a.id)
 LEFT JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(i.tenant_id,i.site_id,i.work_order_id)
 WHERE a.tenant_id=$1 AND a.site_id=$2 GROUP BY a.decision_id), candidates AS (
 SELECT d.*,w.work_order_number,o.order_number,o.part_number,o.part_name,COALESCE(t.allocated,0) allocated,t.invalid
 FROM output_dispositions d JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(d.tenant_id,d.site_id,d.work_order_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(d.tenant_id,d.site_id,d.order_id) LEFT JOIN totals t ON t.decision_id=d.id
 WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.outcome='rework'
 AND ($3='' OR strpos(lower(concat_ws(' ',w.work_order_number,o.order_number,o.customer,o.part_name,o.part_number)),lower($3))>0)
 AND ($4::uuid IS NULL OR d.order_id=$4)
 AND ($5='all' OR COALESCE(t.allocated,0)<d.quantity_pieces OR COALESCE(t.active,false) OR COALESCE(t.invalid,false))) `;
 const total=number((await c.query(sql+'SELECT count(*) total FROM candidates',args)).rows[0].total);
 const rows=(await c.query(sql+'SELECT * FROM candidates WHERE ($6::uuid IS NULL OR id>$6) ORDER BY id LIMIT $7',[...args,f.after,f.limit+1])).rows,page=rows.slice(0,f.limit),grouped=new Map();
 if(page.length){const allocations=await c.query(`SELECT a.id,a.decision_id,a.quantity_pieces,COALESCE(r.quantity,0) released,i.work_order_id,i.input_lot_id,i.source_output_lot_id,w.work_order_number,w.status
 FROM rework_allocations a LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) quantity FROM rework_allocation_releases WHERE tenant_id=a.tenant_id AND site_id=a.site_id AND allocation_id=a.id) r ON true
 LEFT JOIN rework_inputs i ON (i.tenant_id,i.site_id,i.allocation_id)=(a.tenant_id,a.site_id,a.id)
 LEFT JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(i.tenant_id,i.site_id,i.work_order_id)
 WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.decision_id=ANY($3::uuid[]) ORDER BY a.created_at,a.id`,[s.tenantId,s.siteId,page.map(x=>x.id)]);
 for(const a of allocations.rows){const quantity=number(a.quantity_pieces),released=number(a.released);if(released>quantity)fail(409,'INTEGRITY_ERROR','Rework allocation releases exceed allocation');const list=grouped.get(a.decision_id)||[];list.push({id:a.id,quantity,released,outstanding:quantity-released,workOrderId:a.work_order_id,workOrderNumber:a.work_order_number,status:a.status,inputLotId:a.input_lot_id,sourceOutputLotId:a.source_output_lot_id});grouped.set(a.decision_id,list)}}
 const decisions=page.map(x=>{const quantity=number(x.quantity_pieces),allocated=number(x.allocated);if(x.invalid||allocated>quantity||allocated<0)fail(409,'INTEGRITY_ERROR','Rework allocations exceed decision');return {id:x.id,orderId:x.order_id,orderNumber:x.order_number,workOrderId:x.work_order_id,workOrderNumber:x.work_order_number,partNumber:x.part_number,partName:x.part_name,productionEventId:x.production_event_id,inputLotId:x.lot_id,outputLotId:x.output_lot_id,quantity,allocated,available:quantity-allocated,allocations:grouped.get(x.id)||[],decidedAt:x.occurred_at,provenanceStatus:x.output_lot_id?'linked':'historical_unreconciled',reworkExecutionSupported:!!x.output_lot_id}});
 return {decisions,total,query:f.query,state:f.state,orderId:f.orderId,nextAfter:rows.length>f.limit?page.at(-1).id:null};
}
function route(req,kind){const s=data(req);return inTransaction(req.server.pgPool,async c=>{await authorizeScope(c,{...s,capability:'quality.write'});return (kind==='quality'?quality:rework)(c,s,req.query||{})})}
async function history(c,s,q={}){const f=filters(q);await cursor(c,s,'output_dispositions',f.after);const args=[s.tenantId,s.siteId,f.query,f.orderId];
 const sql=`FROM output_dispositions d JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(d.tenant_id,d.site_id,d.work_order_id) JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(d.tenant_id,d.site_id,d.order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND ($3='' OR strpos(lower(concat_ws(' ',w.work_order_number,o.order_number,o.customer,o.part_name,d.evidence)),lower($3))>0) AND ($4::uuid IS NULL OR d.order_id=$4)`;
 const total=number((await c.query('SELECT count(*) total '+sql,args)).rows[0].total),rows=(await c.query(`SELECT ${require('./quality-documents').projection('d')} documents,d.id,d.order_id AS "orderId",d.work_order_id AS "workOrderId",w.work_order_number AS "workOrderNumber",o.order_number AS "orderNumber",o.part_name AS "partName",d.outcome,d.quantity_pieces AS quantity,d.evidence,d.occurred_at AS "decidedAt" ${sql} AND ($5::uuid IS NULL OR (d.occurred_at,d.id)<(SELECT occurred_at,id FROM output_dispositions WHERE tenant_id=$1 AND site_id=$2 AND id=$5)) ORDER BY d.occurred_at DESC,d.id DESC LIMIT $6`,[...args,f.after,f.limit+1])).rows,items=rows.slice(0,f.limit).map(x=>({...x,quantity:number(x.quantity)}));return {items,total,nextAfter:rows.length>f.limit?items.at(-1).id:null};
}
function routes(api){api.get('/sites/:tenantId/:siteId/quality/queue',req=>route(req,'quality'));api.get('/sites/:tenantId/:siteId/quality/history',req=>{const s=data(req);return inTransaction(req.server.pgPool,async c=>{await authorizeScope(c,{...s,capability:'quality.write'});return history(c,s,req.query||{})})})}
module.exports={quality,rework,filters,route,routes};
