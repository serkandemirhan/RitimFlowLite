'use strict';
// Only customer-visible metadata; never return audit payloads or staff identities.
async function summary(c,s){
 const args=[s.tenantId,s.siteId,s.orderId];
 const o=(await c.query(`SELECT created_at "createdAt",status,execution_hold hold,
 COALESCE((SELECT SUM(quantity_pieces) FROM shipments WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0)
 +COALESCE((SELECT SUM(quantity_pieces) FROM effective_shipping_events WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND event_type='dispatch'),0)
 -COALESCE((SELECT SUM(quantity_pieces) FROM customer_returns WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0)
 -COALESCE((SELECT SUM(quantity_pieces) FROM rma_receipts WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0) "netShipped"
 FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3`,args)).rows[0];
 const visibleProduction=s.permissions?.production!==false||s.permissions?.workOrders!==false;
 let productionStatus=null,completedJobs=null,totalJobs=null;
 if(visibleProduction){
  const jobs=(await c.query('SELECT status FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND status<>\'cancelled\'',args)).rows;
  completedJobs=jobs.filter(x=>x.status==='complete').length;totalJobs=jobs.length;
  productionStatus=o.status==='cancelled'?'cancelled':o.hold?'held':o.status==='closed'?'completed':jobs.length&&completedJobs===jobs.length?'completed':jobs.some(x=>x.status==='running')?'running':jobs.some(x=>x.status==='paused')?'paused':jobs.length?'planned':'unplanned';
 }
 const events=(await c.query(`SELECT occurred_at at,'Sipariş güncellendi' label FROM audit_events WHERE tenant_id=$1 AND site_id=$2 AND entity_type='order' AND entity_id=$3 AND event_type=ANY($4::text[]) ORDER BY occurred_at DESC LIMIT 5`,[...args,['order.updated','order.items_changed','order.remainder_closed','order.closed','execution.hold','execution.resume','execution.cancel','execution.reopen','portal.revision_applied']])).rows;
 if(visibleProduction)events.push(...(await c.query("SELECT a.occurred_at at,'Üretim durumu güncellendi' label FROM audit_events a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.entity_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 AND a.entity_type='work_order' AND a.event_type=ANY($4::text[]) ORDER BY a.occurred_at DESC LIMIT 5",[...args,['production.start','production.resume','production.pause','production.complete']])).rows);
 if(await require('./customer-collaboration').available(c)){
  const files=(await c.query(`SELECT created_at at,filename label,category FROM portal_files WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND request_id IS NULL AND revoked_at IS NULL AND ((category='video' AND $4) OR (category='drawing' AND $5) OR (category NOT IN ('video','drawing') AND $6)) ORDER BY created_at DESC LIMIT 5`,[...args,!!s.permissions?.videos,!!s.permissions?.drawings,!!s.includeDocuments])).rows;
  for(const f of files)if(f.category==='video'?s.permissions?.videos:f.category==='drawing'?s.permissions?.drawings:s.includeDocuments)events.push({at:f.at,label:'Dosya paylaşıldı: '+f.label});
 }
 events.push({at:o.createdAt,label:'Sipariş oluşturuldu'});events.sort((a,b)=>new Date(b.at)-new Date(a.at));
 return {createdAt:o.createdAt,publicUpdatedAt:events[0].at,netShipped:Number(o.netShipped),productionStatus,completedJobs,totalJobs,recentActivity:events.slice(0,5)};
}
module.exports={summary};
