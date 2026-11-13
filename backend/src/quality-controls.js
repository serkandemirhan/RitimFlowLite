'use strict';
// One row per inspection source. Partial decisions stay open; legacy rework is
// a recorded decision, not an additional quality queue or a new repair command.
const {data,scoped,fail,identifier}=require('./orders-planning');
const types=['all','incoming','production','supplier','return','final'];
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
 WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.kind IN ('good','pending') AND e.quantity_pieces>0 AND NOT(COALESCE(po.final_control_enabled,false) AND op.sequence=(SELECT MAX(x.sequence) FROM operations x WHERE (x.tenant_id,x.site_id,x.production_order_id)=(po.tenant_id,po.site_id,po.id))) AND (NOT e.separate_quality_request OR EXISTS(SELECT 1 FROM production_quality_requests qr WHERE (qr.tenant_id,qr.site_id,qr.production_event_id)=(e.tenant_id,e.site_id,e.id)))`;
const finalControls=`SELECT t.id,'final' type,t.created_at recorded,COALESCE(SUM(e.quantity_pieces),0) quantity,
 COALESCE(SUM(d.decided+COALESCE(b.n,0)),0) decided,COALESCE(SUM(d.approved),0) approved,COALESCE(SUM(d.rejected),0) rejected,COALESCE(SUM(d.rework),0) rework,
 jsonb_build_object('source','final','orderId',t.order_id,'workOrderId',t.work_order_id,'reference',p.number||' · Son kontrol','orderNumber',o.order_number,'customer',o.customer,'operation','Son kalite kontrolü','description',i.part_name,'unit','piece','bypassed',COALESCE(SUM(b.n),0),'controlStatus',CASE WHEN SUM(e.quantity_pieces)>SUM(d.decided+COALESCE(b.n,0)) THEN 'pending' WHEN COALESCE(SUM(b.n),0)>0 AND SUM(d.decided)=0 THEN 'shipped_without_inspection' WHEN COALESCE(SUM(b.n),0)>0 THEN 'completed_with_uninspected_shipping' ELSE 'inspected' END,'decidedAt',MAX(GREATEST(d.last_decision,b.last_bypass))) payload
 FROM final_control_tasks t JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(t.tenant_id,t.site_id,t.id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(t.tenant_id,t.site_id,t.order_id)
 JOIN order_items i ON (i.tenant_id,i.site_id,i.id)=(p.tenant_id,p.site_id,p.order_item_id)
 JOIN effective_production_events e ON (e.tenant_id,e.site_id,e.work_order_id)=(t.tenant_id,t.site_id,t.work_order_id) AND e.kind IN ('good','pending')
 LEFT JOIN LATERAL(SELECT COALESCE(SUM(quantity_pieces),0) decided,COALESCE(SUM(quantity_pieces) FILTER(WHERE outcome='approved'),0) approved,COALESCE(SUM(quantity_pieces) FILTER(WHERE outcome='rejected'),0) rejected,COALESCE(SUM(quantity_pieces) FILTER(WHERE outcome='rework'),0) rework,MAX(occurred_at) last_decision FROM output_dispositions WHERE tenant_id=e.tenant_id AND site_id=e.site_id AND production_event_id=e.id) d ON true
 LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) n,MAX(created_at) last_bypass FROM shipping_quality_bypasses WHERE tenant_id=e.tenant_id AND site_id=e.site_id AND production_event_id=e.id) b ON true
 WHERE t.tenant_id=$1 AND t.site_id=$2 GROUP BY t.id,t.created_at,t.order_id,t.work_order_id,p.number,o.order_number,o.customer,i.part_name`;
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
 const f=filters(q),sql=`WITH sources AS (${sourceSql()}), candidates AS (
 SELECT *,CASE WHEN payload->>'cancelled'='true' THEN 0 ELSE GREATEST(0,quantity-decided) END pending FROM sources WHERE quantity>0), filtered AS (
 SELECT * FROM candidates WHERE ($4='all' OR type=$4) AND (($5='open' AND pending>0) OR ($5='completed' AND pending=0 AND (decided>0 OR payload->>'cancelled'='true')))
 AND ($6='' OR strpos(lower(concat_ws(' ',payload->>'description',payload->>'reference',payload->>'orderNumber',payload->>'customer',payload->>'supplier',payload->>'operation')),lower($6))>0))`;
 const args=[s.tenantId,s.siteId,null,f.type,f.state,f.query];
 const result=(await c.query(sql+`SELECT (SELECT count(*) FROM filtered) total,
 EXISTS(SELECT 1 FROM candidates WHERE id=$7) cursor_valid,
 COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM filtered WHERE ($7::uuid IS NULL OR id>$7) ORDER BY id LIMIT $8) p),'[]'::jsonb) page`,[...args,f.after,f.limit+1])).rows[0];
 if(f.after&&!result.cursor_valid)fail(400,'INVALID_INPUT','Sayfa konumu bu iş yerinde bulunamadı');
 const rows=result.page.slice(0,f.limit),items=rows.map(r=>({...r.payload,id:r.id,type:r.type,state:r.payload.cancelled?'cancelled':f.state,recordedAt:r.recorded,...Object.fromEntries(['quantity','decided','approved','rejected','rework','pending'].map(k=>[k,Number(r[k])]))}));
 return {items,total:Number(result.total),type:f.type,state:f.state,query:f.query,nextAfter:result.page.length>f.limit?items.at(-1).id:null};
}
const sourceSql=()=>`SELECT raw.id,raw.type,raw.recorded,raw.quantity,raw.decided,raw.approved,raw.rejected,raw.rework,
 CASE WHEN skipped.id IS NULL THEN raw.payload ELSE raw.payload||jsonb_build_object('cancelled',true,'cancelReason',skipped.payload->>'reason','cancelMessage',skipped.payload->>'message','cancelledAt',skipped.occurred_at,'cancelledBy',ritim_audit_actor_name(skipped.tenant_id,skipped.site_id,skipped.id),'cancelledQuantity',CASE WHEN raw.payload->>'source'='final' THEN (skipped.payload->>'quantity')::bigint ELSE GREATEST(0,raw.quantity-raw.decided) END) END payload
 FROM (${production} UNION ALL ${finalControls} UNION ALL ${incoming} UNION ALL ${returns} UNION ALL ${supplier}) raw
 LEFT JOIN LATERAL(SELECT sk.* FROM audit_events sk WHERE sk.tenant_id=$1 AND sk.site_id=$2 AND sk.entity_type='work_order' AND sk.entity_id::text=raw.payload->>'workOrderId' AND sk.event_type='production.quality_skipped'
 AND (raw.payload->>'source'='final' OR raw.payload->>'source'='output' AND sk.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',raw.id::text))) ORDER BY sk.occurred_at DESC,sk.id DESC LIMIT 1) skipped ON true`;
const item=r=>({...r.payload,id:r.id,type:r.type,state:r.payload.cancelled?'cancelled':Number(r.pending)>0?'open':'completed',recordedAt:r.recorded,...Object.fromEntries(['quantity','decided','approved','rejected','rework'].map(k=>[k,Number(r[k])])),pending:Number(r.pending)});
async function controlDetail(c,s,source,id,q={}){
 if(!['output','incoming','return','outsourcing','final'].includes(source)||Object.keys(q).some(k=>k!=='after'))fail(400,'INVALID_INPUT','Geçersiz kontrol kaydı');
 id=identifier(id);const after=q.after?identifier(q.after):null;
 const found=(await c.query(`WITH sources AS (${sourceSql()}) SELECT *,CASE WHEN payload->>'cancelled'='true' THEN 0 ELSE GREATEST(0,quantity-decided) END pending FROM sources WHERE id=$4 AND quantity>0 AND payload->>'source'=$5`,[s.tenantId,s.siteId,null,id,source])).rows[0];
 if(!found)fail(404,'NOT_FOUND','Kontrol kaydı bulunamadı');
 const control=item(found),args=[s.tenantId,s.siteId,id];let decisions,action={limit:control.pending},documents=[],availableDocuments=[];
 // Actor names use existing scope-checked display functions, never a users grant.
 const auditActor=(alias,event)=>`(SELECT ritim_audit_actor_name(a.tenant_id,a.site_id,a.id) FROM audit_events a WHERE a.tenant_id=${alias}.tenant_id AND a.site_id=${alias}.site_id AND a.actor_id=${alias}.actor_id AND a.event_type='${event}' AND a.payload->>'id'=${alias}.id::text ORDER BY a.occurred_at,a.id LIMIT 1)`;
 if(source==='final'){
  decisions=`SELECT d.id,d.outcome,d.quantity_pieces quantity,d.evidence note,NULL::text reason,d.occurred_at created_at,ritim_quality_actor_name(d.tenant_id,d.site_id,d.id) actor_name,'[]'::jsonb documents FROM output_dispositions d JOIN final_control_tasks t ON (t.tenant_id,t.site_id,t.work_order_id)=(d.tenant_id,d.site_id,d.work_order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND t.id=$3`;
  availableDocuments=(await c.query("SELECT id,filename FROM work_documents WHERE tenant_id=$1 AND site_id=$2 AND work_order_id=$3 AND context='quality' ORDER BY created_at,id",[s.tenantId,s.siteId,control.workOrderId])).rows;const x=await require('./quality-disposition').source(c,s,control.orderId,control.workOrderId);if(!control.cancelled&&x.rows.reduce((n,r)=>n+r.undisposed,0)!==control.pending)fail(409,'INTEGRITY_ERROR','Son kontrol miktarı doğrulanamadı.');
 }else if(source==='output'){
  if(control.type==='supplier'){const supplier=(await c.query("SELECT s.name FROM production_output_lots l JOIN production_supplier_events r ON (r.tenant_id,r.site_id,r.returned_lot_id)=(l.tenant_id,l.site_id,l.input_lot_id) AND r.kind='return' JOIN production_supplier_events d ON (d.tenant_id,d.site_id,d.id)=(r.tenant_id,r.site_id,r.dispatch_id) JOIN outsourcing_suppliers s ON (s.tenant_id,s.site_id,s.id)=(d.tenant_id,d.site_id,d.supplier_id) WHERE l.tenant_id=$1 AND l.site_id=$2 AND l.production_event_id=$3",args)).rows[0];if(supplier)control.supplier=supplier.name}
  decisions=`SELECT d.id,d.outcome,d.quantity_pieces quantity,d.evidence note,NULL::text reason,d.occurred_at created_at,ritim_quality_actor_name(d.tenant_id,d.site_id,d.id) actor_name,${require('./quality-documents').projection('d')} documents FROM output_dispositions d WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.production_event_id=$3`;
  if(control.pending){try{const v=await require('./quality-disposition').source(c,s,control.orderId,control.workOrderId),output=v.rows.find(x=>x.eventId===id);if(!output||output.undisposed!==control.pending)throw Error('Unreconciled output');action.inputLotId=output.lotId;availableDocuments=(await c.query("SELECT id,filename FROM work_documents WHERE tenant_id=$1 AND site_id=$2 AND work_order_id=$3 AND context='quality' ORDER BY created_at,id",[s.tenantId,s.siteId,control.workOrderId])).rows}catch(e){if(e.statusCode&&e.statusCode>=500||e.code&&String(e.code).match(/^\d/))throw e;action.limit=0;action.notice='Kontrol miktarı doğrulanamadı. Bağlı iş emrini inceleyin.'}}
 }else if(source==='incoming'){
  decisions=`SELECT i.id,i.outcome,i.quantity,i.note,i.reason,i.created_at,ritim_inventory_actor_name(i.tenant_id,i.site_id,i.id) actor_name,'[]'::jsonb documents FROM inventory_lot_inspections i WHERE i.tenant_id=$1 AND i.site_id=$2 AND i.lot_id=$3`;
  documents=(await c.query("SELECT d.id,d.filename,'inventory' kind FROM inventory_documents d JOIN inventory_movements m ON (m.tenant_id,m.site_id,m.id)=(d.tenant_id,d.site_id,d.movement_id) WHERE m.tenant_id=$1 AND m.site_id=$2 AND m.lot_id=$3 AND m.kind='receipt' ORDER BY d.created_at,d.id",args)).rows;
 }else if(source==='outsourcing'){
  decisions=`SELECT i.id,i.outcome,i.quantity_pieces quantity,i.evidence note,NULL::text reason,i.created_at,${auditActor('i','outsourcing.inspected')} actor_name,'[]'::jsonb documents FROM outsourcing_inspections i WHERE i.tenant_id=$1 AND i.site_id=$2 AND i.return_id=$3`;
 }else{
  decisions=`SELECT d.id,d.outcome,d.quantity_pieces quantity,i.evidence note,NULL::text reason,d.created_at,${auditActor('d','rma.disposition')} actor_name,'[]'::jsonb documents FROM rma_dispositions d JOIN rma_inspections i ON (i.tenant_id,i.site_id,i.id)=(d.tenant_id,d.site_id,d.inspection_id) WHERE i.tenant_id=$1 AND i.site_id=$2 AND i.receipt_id=$3`;
  const inspections=(await c.query(`SELECT i.id,i.evidence,i.quantity_pieces-COALESCE((SELECT SUM(d.quantity_pieces) FROM rma_dispositions d WHERE (d.tenant_id,d.site_id,d.inspection_id)=(i.tenant_id,i.site_id,i.id)),0) remaining FROM rma_inspections i WHERE i.tenant_id=$1 AND i.site_id=$2 AND i.receipt_id=$3 ORDER BY i.created_at,i.id`,args)).rows;
  const waiting=inspections.find(i=>Number(i.remaining)>0);action.inspectionIds=inspections.map(i=>i.id);
  if(waiting){action.inspectionId=waiting.id;action.evidence=waiting.evidence;action.limit=Number(waiting.remaining)}
  const reason=(await c.query('SELECT a.reason,i.part_name FROM rma_receipts r JOIN rma_authorizations a ON (a.tenant_id,a.site_id,a.id)=(r.tenant_id,r.site_id,r.rma_id) LEFT JOIN shipping_events e ON (e.tenant_id,e.site_id,e.id)=(a.tenant_id,a.site_id,a.delivery_id) LEFT JOIN production_output_lots l ON (l.tenant_id,l.site_id,l.id)=(e.tenant_id,e.site_id,e.output_lot_id) LEFT JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id) LEFT JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id) LEFT JOIN order_items i ON (i.tenant_id,i.site_id,i.id)=(p.tenant_id,p.site_id,p.order_item_id) WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3',args)).rows[0];control.returnReason=reason.reason;control.description=reason.part_name||control.description;
 }
 const result=(await c.query(`WITH decisions AS (${decisions}) SELECT (SELECT count(*) FROM decisions) total,EXISTS(SELECT 1 FROM decisions WHERE id=$4) cursor_valid,COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at,p.id) FROM (SELECT * FROM decisions WHERE ($4::uuid IS NULL OR (created_at,id)>(SELECT created_at,id FROM decisions WHERE id=$4)) ORDER BY created_at,id LIMIT 51) p),'[]'::jsonb) page`,[...args,after])).rows[0];
 if(after&&!result.cursor_valid)fail(400,'INVALID_INPUT','Karar bu kontrole ait değil');
 return {control,action,documents,availableDocuments,decisions:result.page.slice(0,50).map(d=>({id:d.id,outcome:d.outcome,quantity:Number(d.quantity),note:d.note,reason:d.reason,createdAt:d.created_at,actorName:d.actor_name,documents:d.documents})),decisionTotal:Number(result.total),nextAfter:result.page.length>50?result.page[49].id:null};
}
function routes(api){api.get('/sites/:tenantId/:siteId/quality/controls',req=>scoped(req,(c,s)=>controls(c,s,req.query),'quality.write'));api.get('/sites/:tenantId/:siteId/quality/controls/:source/:id',req=>scoped(req,(c,s)=>controlDetail(c,s,req.params.source,req.params.id,req.query),'quality.write'))}
module.exports={routes,controls,controlDetail,filters,finalControls};
