'use strict';
const {fail}=require('./orders-planning');
// A closed sales order stays immutable. Only work whose physical loss/return
// provenance leads back to that order's customer return can proceed.
async function compensation(c,s,order,id,seen=new Set()){
 if(!id||seen.has('c'+id)||seen.size>40)return false;seen.add('c'+id);
 const r=(await c.query('SELECT * FROM production_compensations WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[s.tenantId,s.siteId,order,id])).rows[0];
 if(!r)return false;if(r.rma_disposition_id)return (await c.query("SELECT 1 FROM rma_dispositions WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4 AND outcome='scrap'",[s.tenantId,s.siteId,order,r.rma_disposition_id])).rowCount>0;
 const source=(await c.query(`SELECT e.work_order_id FROM production_events e JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(e.tenant_id,e.site_id,e.work_order_id) WHERE e.tenant_id=$1 AND e.site_id=$2 AND w.order_id=$3 AND e.id=$4
 UNION ALL SELECT work_order_id FROM output_dispositions WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$5`,[s.tenantId,s.siteId,order,r.production_event_id,r.disposition_id])).rows[0];
 return source?job(c,s,order,source.work_order_id,seen):false;
}
async function job(c,s,order,id,seen=new Set()){
 if(!id||seen.has('j'+id)||seen.size>40)return false;seen.add('j'+id);
 if((await c.query('SELECT 1 FROM rma_rework_inputs WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND work_order_id=$4',[s.tenantId,s.siteId,order,id])).rowCount)return true;
 const p=(await c.query('SELECT p.compensation_id FROM work_orders w JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 AND w.id=$4',[s.tenantId,s.siteId,order,id])).rows[0];
 return p?compensation(c,s,order,p.compensation_id,seen):false;
}
async function assertJob(c,s,o,id){if(o.status==='open')return;if(o.status!=='closed'||!await job(c,s,o.id,id))fail(409,'ORDER_CLOSED','Kapalı siparişte yalnız iadeye bağlı işler yürütülebilir')}
async function assertProduction(c,s,o,id){if(o.status==='open')return;const p=(await c.query('SELECT compensation_id FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[s.tenantId,s.siteId,o.id,id])).rows[0];if(o.status!=='closed'||!p||!await compensation(c,s,o.id,p.compensation_id))fail(409,'ORDER_CLOSED','Kapalı siparişte yalnız iadeye bağlı telafi üretimi yürütülebilir')}
async function assertShipping(c,s,o){if(o.status==='open')return;if(o.status!=='closed'||!(await c.query('SELECT 1 FROM rma_receipts WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 LIMIT 1',[s.tenantId,s.siteId,o.id])).rowCount)fail(409,'ORDER_CLOSED','Yeniden sevk için kabul edilmiş müşteri iadesi gerekir')}
function jobPredicate(w='w'){return `(EXISTS(SELECT 1 FROM rma_rework_inputs ar WHERE (ar.tenant_id,ar.site_id,ar.order_id,ar.work_order_id)=(${w}.tenant_id,${w}.site_id,${w}.order_id,${w}.id)) OR EXISTS(SELECT 1 FROM production_orders ap JOIN production_compensations ac ON (ac.tenant_id,ac.site_id,ac.id)=(ap.tenant_id,ap.site_id,ap.compensation_id) WHERE (ap.tenant_id,ap.site_id,ap.id)=(${w}.tenant_id,${w}.site_id,${w}.production_order_id) AND ac.rma_disposition_id IS NOT NULL))`}
function productionPredicate(p='p'){return `EXISTS(SELECT 1 FROM production_compensations ac WHERE (ac.tenant_id,ac.site_id,ac.id)=(${p}.tenant_id,${p}.site_id,${p}.compensation_id) AND ac.rma_disposition_id IS NOT NULL)`}
module.exports={job,compensation,assertJob,assertProduction,assertShipping,jobPredicate,productionPredicate};
