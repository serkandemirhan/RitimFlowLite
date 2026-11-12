'use strict';
const {identifier,number,fail}=require('./orders-planning');
async function list(c,s,q={}){
 if(Object.keys(q).some(k=>!['q','source','state','after','limit'].includes(k)))fail(400,'INVALID_INPUT','Invalid filter');
 const search=q.q??'',source=q.source||'all',state=q.state||'all',after=q.after?identifier(q.after):null,limit=Number(q.limit??50);
 if(typeof search!=='string'||search.length>120||!['all','production_event','disposition','rma_disposition','legacy'].includes(source)||!['all','active','available','partial','allocated','running','completed','closed','legacy'].includes(state)||!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Invalid compensation filter');
 const rows=`SELECT a.id,a.order_id,o.order_number,o.customer,o.part_name,o.part_number,a.quantity,a.reason,a.source,
 coalesce(p.allocated,0) allocated,CASE WHEN a.source='legacy' OR o.status<>'open' AND a.source<>'rma_disposition' THEN 0 ELSE greatest(0,a.quantity-coalesce(p.allocated,0)) END remaining,
 CASE WHEN o.status='closed' AND a.source<>'rma_disposition' THEN 'closed' WHEN a.source='legacy' THEN 'legacy' WHEN coalesce(p.allocated,0)=0 THEN 'available' WHEN p.allocated<a.quantity THEN 'partial' WHEN p.incomplete=0 THEN 'completed' WHEN p.running>0 THEN 'running' ELSE 'allocated' END state
 FROM (SELECT tenant_id,site_id,id,order_id,quantity_pieces quantity,reason,'legacy' source FROM compensations UNION ALL SELECT tenant_id,site_id,id,order_id,quantity,reason,CASE WHEN production_event_id IS NOT NULL THEN 'production_event' WHEN disposition_id IS NOT NULL THEN 'disposition' ELSE 'rma_disposition' END FROM production_compensations) a
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(a.tenant_id,a.site_id,a.order_id)
 LEFT JOIN LATERAL(SELECT sum(p.quantity) allocated,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM work_orders w WHERE (w.tenant_id,w.site_id,w.production_order_id)=(p.tenant_id,p.site_id,p.id)) OR EXISTS(SELECT 1 FROM work_orders w WHERE (w.tenant_id,w.site_id,w.production_order_id)=(p.tenant_id,p.site_id,p.id) AND w.status<>'complete')) incomplete,(SELECT count(*) FROM work_orders w JOIN production_orders x ON (x.tenant_id,x.site_id,x.id)=(w.tenant_id,w.site_id,w.production_order_id) WHERE (x.tenant_id,x.site_id,x.compensation_id)=(a.tenant_id,a.site_id,a.id) AND w.status='running') running FROM production_orders p WHERE (p.tenant_id,p.site_id,p.compensation_id)=(a.tenant_id,a.site_id,a.id) AND p.cancelled_at IS NULL) p ON true
 WHERE a.tenant_id=$1 AND a.site_id=$2`;
 const filter=` FROM (${rows}) x WHERE strpos(lower(concat_ws(' ',order_number,customer,part_name,part_number,reason)),lower($3))>0 AND ($4='all' OR source=$4) AND ($5='all' OR $5='active' AND state NOT IN ('completed','closed','legacy') OR state=$5)`;
 const args=[s.tenantId,s.siteId,search.trim(),source,state];
 const summary=(await c.query('SELECT count(*) total,coalesce(sum(quantity),0) quantity,coalesce(sum(allocated),0) allocated,coalesce(sum(remaining),0) remaining'+filter,args)).rows[0];
 const r=await c.query('SELECT *'+filter+' AND ($6::uuid IS NULL OR id>$6) ORDER BY id LIMIT $7',[...args,after,limit+1]);
 return {items:r.rows.slice(0,limit).map(x=>({id:x.id,orderId:x.order_id,orderNumber:x.order_number,customer:x.customer,partName:x.part_name,partNumber:x.part_number,quantity:number(x.quantity),allocated:number(x.allocated),remaining:number(x.remaining),source:x.source,state:x.state,reason:x.reason})),total:number(summary.total),totals:{quantity:number(summary.quantity),allocated:number(summary.allocated),remaining:number(summary.remaining)},nextAfter:r.rows.length>limit?r.rows[limit-1].id:null};
}
module.exports={list};
