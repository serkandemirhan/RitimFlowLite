'use strict';
// Scoped discovery only. Existing command and ledger services remain authoritative.
const {authorizeScope}=require('./authorization');
const {inTransaction}=require('./db');
const {data,identifier,number,fail}=require('./orders-planning');
const queues=Object.freeze({
 shipping:{table:'shipping_orders',fields:'q.id,q.order_id,o.order_number,q.created_at',allowed:null},
 outsourcing:{table:'outsourcing_jobs',fields:'q.id,q.order_id,o.order_number,q.created_at',allowed:['stock.write','quality.write','planning.write']},
 returns:{table:'rma_authorizations',fields:'q.id,q.order_id,o.order_number,q.created_at,q.rma_number,q.quantity_pieces',allowed:['shipment.write','stock.write','quality.write']}
});
function routes(api){api.get('/sites/:tenantId/:siteId/logistics/queues/:kind',async req=>{
 const scope=data(req),definition=queues[req.params.kind];if(!definition)fail(404,'NOT_FOUND','Unknown logistics queue');
 const query=req.query||{};if(Object.keys(query).some(k=>!['limit','after'].includes(k)))fail(400,'INVALID_INPUT','Unknown query parameter');
 const limit=query.limit===undefined?50:Number(query.limit);if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Invalid limit');const after=query.after===undefined?null:identifier(query.after);
 return inTransaction(req.server.pgPool,async c=>{const auth=await authorizeScope(c,{...scope,capability:'orders.read'});if(definition.allowed&&!auth.capabilities.some(x=>definition.allowed.includes(x)))fail(403,'FORBIDDEN','Logistics capability required');
 const result=await c.query(`SELECT ${definition.fields} FROM ${definition.table} q JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(q.tenant_id,q.site_id,q.order_id) WHERE q.tenant_id=$1 AND q.site_id=$2 AND ($3::uuid IS NULL OR q.id>$3::uuid) ORDER BY q.id LIMIT $4`,[scope.tenantId,scope.siteId,after,limit+1]);
 const more=result.rows.length>limit,rows=result.rows.slice(0,limit);return {items:rows.map(x=>({id:x.id,orderId:x.order_id,orderNumber:x.order_number,createdAt:x.created_at,...(req.params.kind==='returns'?{rmaNumber:x.rma_number,authorizedQuantity:number(x.quantity_pieces)}:{})})),nextAfter:more?rows[rows.length-1].id:null};
 });
 });}
module.exports={routes};
