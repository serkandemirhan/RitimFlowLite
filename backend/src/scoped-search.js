'use strict';
const {data,fail}=require('./orders-planning');
const {inTransaction}=require('./db');
const {authorizeScope}=require('./authorization');
function routes(api){api.get('/sites/:tenantId/:siteId/search',async req=>{
 const s=data(req),query=req.query||{};if(Object.keys(query).some(k=>!['q','limit'].includes(k)))fail(400,'INVALID_INPUT','Unknown query parameter');
 const q=typeof query.q==='string'?query.q.trim():'';if(q.length<2||q.length>120)fail(400,'INVALID_INPUT','Search requires 2 to 120 characters');const limit=query.limit===undefined?30:Number(query.limit);if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Invalid limit');
 const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';return inTransaction(req.server.pgPool,async c=>{const auth=await authorizeScope(c,{...s,capability:'orders.read'});const logistics=auth.capabilities.some(x=>['stock.write','quality.write','planning.write'].includes(x)),returns=auth.capabilities.some(x=>['shipment.write','stock.write','quality.write'].includes(x));const results=await c.query(`SELECT * FROM (
 SELECT 'order'::text AS kind,o.id,o.id AS order_id,o.order_number AS label,o.customer AS detail FROM orders o WHERE o.tenant_id=$1 AND o.site_id=$2 AND (o.order_number ILIKE $3 ESCAPE '\\' OR o.customer ILIKE $3 ESCAPE '\\' OR o.part_number ILIKE $3 ESCAPE '\\' OR o.part_name ILIKE $3 ESCAPE '\\')
 UNION ALL SELECT 'work_order',w.id,w.order_id,w.work_order_number,o.order_number FROM work_orders w JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.work_order_number ILIKE $3 ESCAPE '\\'
 UNION ALL SELECT 'lot',l.id,l.order_id,l.lot_code,o.order_number FROM lots l JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(l.tenant_id,l.site_id,l.order_id) WHERE l.tenant_id=$1 AND l.site_id=$2 AND (l.lot_code ILIKE $3 ESCAPE '\\' OR l.id::text ILIKE $3 ESCAPE '\\')
 UNION ALL SELECT 'lot',l.id,l.order_id,l.id::text,o.order_number FROM production_output_lots l JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(l.tenant_id,l.site_id,l.order_id) WHERE l.tenant_id=$1 AND l.site_id=$2 AND l.id::text ILIKE $3 ESCAPE '\\'
 UNION ALL SELECT 'material',m.id,NULL::uuid,m.code,m.description FROM inventory_materials m WHERE m.tenant_id=$1 AND m.site_id=$2 AND (m.code ILIKE $3 ESCAPE '\\' OR m.description ILIKE $3 ESCAPE '\\')
 UNION ALL SELECT 'inventory_lot',l.id,NULL::uuid,l.lot_code,m.code FROM inventory_lots l JOIN inventory_materials m ON (m.tenant_id,m.site_id,m.id)=(l.tenant_id,l.site_id,l.material_id) WHERE l.tenant_id=$1 AND l.site_id=$2 AND (l.lot_code ILIKE $3 ESCAPE '\\' OR l.id::text ILIKE $3 ESCAPE '\\')
 UNION ALL SELECT 'shipping',sh.id,sh.order_id,sh.id::text,o.order_number FROM shipping_orders sh JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(sh.tenant_id,sh.site_id,sh.order_id) WHERE sh.tenant_id=$1 AND sh.site_id=$2 AND sh.id::text ILIKE $3 ESCAPE '\\'
 UNION ALL SELECT 'outsourcing',j.id,j.order_id,j.id::text,o.order_number FROM outsourcing_jobs j JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(j.tenant_id,j.site_id,j.order_id) WHERE $5 AND j.tenant_id=$1 AND j.site_id=$2 AND j.id::text ILIKE $3 ESCAPE '\\'
 UNION ALL SELECT 'returns',r.id,r.order_id,r.rma_number,o.order_number FROM rma_authorizations r JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(r.tenant_id,r.site_id,r.order_id) WHERE $6 AND r.tenant_id=$1 AND r.site_id=$2 AND (r.rma_number ILIKE $3 ESCAPE '\\' OR r.id::text ILIKE $3 ESCAPE '\\')
 ) x ORDER BY kind,label,id LIMIT $4`,[s.tenantId,s.siteId,term,limit+1,logistics,returns]);const more=results.rows.length>limit;return {results:results.rows.slice(0,limit).map(x=>({kind:x.kind,id:x.id,orderId:x.order_id,label:x.label,detail:x.detail})),truncated:more,scope:'supported_site_records'};});
 });}
module.exports={routes};
