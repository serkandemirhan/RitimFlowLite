'use strict';
// One row per inspection source. Partial decisions stay open; legacy rework is
// a recorded decision, not an additional quality queue or a new repair command.
const {data,scoped,fail,identifier}=require('./orders-planning');
const types=['all','incoming','production','supplier','return'];
function filters(q={}){
 if(Object.keys(q).some(k=>!['q','type','state','limit','after'].includes(k)))fail(400,'INVALID_INPUT','Geçersiz kontrol filtresi');
 const type=q.type||'all',state=q.state||'open',query=q.q??'',limit=Number(q.limit??25),after=q.after?identifier(q.after):null;
 if(!types.includes(type)||!['open','completed'].includes(state)||typeof query!=='string'||query.length>120||!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Geçersiz kontrol filtresi');
 return {type,state,query:query.trim(),limit,after};
}
const production=`SELECT e.id,CASE WHEN op.kind='external' THEN 'supplier' ELSE 'production' END type,e.occurred_at recorded,
 e.quantity_pieces quantity,COALESCE(d.decided,0) decided,COALESCE(d.approved,0) approved,COALESCE(d.rejected,0) rejected,COALESCE(d.rework,0) rework,
 jsonb_build_object('source','output','orderId',w.order_id,'workOrderId',w.id,'reference',w.work_order_number,'orderNumber',o.order_number,'customer',o.customer,'operation',op.name,
 'description',COALESCE(oi.part_name,o.part_name),'lotId',ol.id,'unit','piece','decidedAt',d.last_decision) payload
 FROM effective_production_events e JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(e.tenant_id,e.site_id,e.work_order_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id)
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 LEFT JOIN production_orders po ON (po.tenant_id,po.site_id,po.id)=(w.tenant_id,w.site_id,w.production_order_id)
 LEFT JOIN order_items oi ON (oi.tenant_id,oi.site_id,oi.id)=(po.tenant_id,po.site_id,po.order_item_id)
 LEFT JOIN production_output_lots ol ON (ol.tenant_id,ol.site_id,ol.production_event_id)=(e.tenant_id,e.site_id,e.id)
 LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) decided,SUM(quantity_pieces) FILTER(WHERE outcome='approved') approved,SUM(quantity_pieces) FILTER(WHERE outcome='rejected') rejected,SUM(quantity_pieces) FILTER(WHERE outcome='rework') rework,MAX(occurred_at) last_decision FROM output_dispositions WHERE tenant_id=e.tenant_id AND site_id=e.site_id AND production_event_id=e.id) d ON true
 WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.kind IN ('good','pending') AND e.quantity_pieces>0 AND (NOT e.separate_quality_request OR EXISTS(SELECT 1 FROM production_quality_requests qr WHERE (qr.tenant_id,qr.site_id,qr.production_event_id)=(e.tenant_id,e.site_id,e.id)))`;
const incoming=`SELECT l.id,'incoming' type,COALESCE(receipt.created_at,d.last_decision) recorded,
 q.approved+q.rejected+GREATEST(0,q.physical-GREATEST(0,q.approved+q.returned-q.used_approved)-GREATEST(0,q.rejected-q.used_rejected)) quantity,
 q.approved+q.rejected decided,q.approved,q.rejected,0 rework,
 jsonb_build_object('source','incoming','lotId',l.id,'reference',l.lot_code,'description',m.description,'unit',m.base_unit,'supplier',s.name,'decidedAt',d.last_decision) payload
 FROM (${require('./inventory-quality').projection}) q
 JOIN inventory_lots l ON (l.tenant_id,l.site_id,l.id)=($1,$2,q.id)
 JOIN inventory_materials m ON (m.tenant_id,m.site_id,m.id)=(l.tenant_id,l.site_id,l.material_id)
 LEFT JOIN outsourcing_suppliers s ON (s.tenant_id,s.site_id,s.id)=(l.tenant_id,l.site_id,l.supplier_id)
 LEFT JOIN LATERAL(SELECT MIN(mv.occurred_at) created_at FROM inventory_movements mv WHERE mv.tenant_id=l.tenant_id AND mv.site_id=l.site_id AND mv.lot_id=l.id AND mv.kind='receipt') receipt ON true
 LEFT JOIN LATERAL(SELECT MAX(created_at) last_decision FROM inventory_lot_inspections WHERE tenant_id=l.tenant_id AND site_id=l.site_id AND lot_id=l.id) d ON true WHERE q.required`;
const returns=`SELECT r.id,'return' type,r.created_at recorded,r.quantity_pieces quantity,COALESCE(d.decided,0) decided,COALESCE(d.approved,0) approved,COALESCE(d.rejected,0) rejected,COALESCE(d.rework,0) rework,
 jsonb_build_object('source','return','rmaId',a.id,'orderId',r.order_id,'reference',a.rma_number,'description',o.part_name,'orderNumber',o.order_number,'customer',o.customer,'unit','piece','decidedAt',d.last_decision) payload
 FROM rma_receipts r JOIN rma_authorizations a ON (a.tenant_id,a.site_id,a.id)=(r.tenant_id,r.site_id,r.rma_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(r.tenant_id,r.site_id,r.order_id)
 LEFT JOIN LATERAL(SELECT SUM(x.quantity_pieces) decided,SUM(x.quantity_pieces) FILTER(WHERE x.outcome='approved') approved,SUM(x.quantity_pieces) FILTER(WHERE x.outcome='scrap') rejected,SUM(x.quantity_pieces) FILTER(WHERE x.outcome='rework') rework,MAX(x.created_at) last_decision FROM rma_inspections i JOIN rma_dispositions x ON (x.tenant_id,x.site_id,x.inspection_id)=(i.tenant_id,i.site_id,i.id) WHERE i.tenant_id=r.tenant_id AND i.site_id=r.site_id AND i.receipt_id=r.id) d ON true WHERE r.tenant_id=$1 AND r.site_id=$2`;
const supplier=`SELECT r.id,'supplier' type,r.created_at recorded,r.quantity_pieces quantity,COALESCE(i.decided,0) decided,COALESCE(i.approved,0) approved,COALESCE(i.rejected,0) rejected,0 rework,
 jsonb_build_object('source','outsourcing','orderId',r.order_id,'reference',o.order_number,'orderNumber',o.order_number,'description',o.part_name,'customer',o.customer,'supplier',s.name,'operation',op.name,'unit','piece','decidedAt',i.last_decision) payload
 FROM outsourcing_returns r JOIN outsourcing_dispatches dp ON (dp.tenant_id,dp.site_id,dp.id)=(r.tenant_id,r.site_id,r.dispatch_id)
 JOIN outsourcing_jobs j ON (j.tenant_id,j.site_id,j.id)=(dp.tenant_id,dp.site_id,dp.job_id)
 JOIN outsourcing_suppliers s ON (s.tenant_id,s.site_id,s.id)=(j.tenant_id,j.site_id,j.supplier_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(r.tenant_id,r.site_id,r.order_id)
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(j.tenant_id,j.site_id,j.operation_id)
 LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) decided,SUM(quantity_pieces) FILTER(WHERE outcome='approved') approved,SUM(quantity_pieces) FILTER(WHERE outcome='rejected') rejected,MAX(created_at) last_decision FROM outsourcing_inspections WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND return_id=r.id) i ON true WHERE r.tenant_id=$1 AND r.site_id=$2`;
async function controls(c,s,q={}){
 const f=filters(q),sql=`WITH sources AS (${production} UNION ALL ${incoming} UNION ALL ${returns} UNION ALL ${supplier}), candidates AS (
 SELECT *,GREATEST(0,quantity-decided) pending FROM sources WHERE quantity>0), filtered AS (
 SELECT * FROM candidates WHERE ($4='all' OR type=$4) AND (($5='open' AND pending>0) OR ($5='completed' AND pending=0 AND decided>0))
 AND ($6='' OR strpos(lower(concat_ws(' ',payload->>'description',payload->>'reference',payload->>'orderNumber',payload->>'customer',payload->>'supplier',payload->>'operation')),lower($6))>0))`;
 const args=[s.tenantId,s.siteId,null,f.type,f.state,f.query];
 const result=(await c.query(sql+`SELECT (SELECT count(*) FROM filtered) total,
 EXISTS(SELECT 1 FROM candidates WHERE id=$7) cursor_valid,
 COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM filtered WHERE ($7::uuid IS NULL OR id>$7) ORDER BY id LIMIT $8) p),'[]'::jsonb) page`,[...args,f.after,f.limit+1])).rows[0];
 if(f.after&&!result.cursor_valid)fail(400,'INVALID_INPUT','Sayfa konumu bu iş yerinde bulunamadı');
 const rows=result.page.slice(0,f.limit),items=rows.map(r=>({...r.payload,id:r.id,type:r.type,state:f.state,recordedAt:r.recorded,...Object.fromEntries(['quantity','decided','approved','rejected','rework','pending'].map(k=>[k,Number(r[k])]))}));
 return {items,total:Number(result.total),type:f.type,state:f.state,query:f.query,nextAfter:result.page.length>f.limit?items.at(-1).id:null};
}
function routes(api){api.get('/sites/:tenantId/:siteId/quality/controls',req=>scoped(req,(c,s)=>controls(c,s,req.query),'quality.write'))}
module.exports={routes,controls,filters};
