'use strict';
const {scoped,identifier,number,fail}=require('./orders-planning');
// A bounded, searchable selector. It never depends on the legacy first-200 list.
async function choices(c,s,q={}){
 if(Object.keys(q).some(k=>!['q','after','limit','include'].includes(k)))fail(400,'INVALID_INPUT','Geçersiz seçim filtresi');
 const term=q.q??'',limit=q.limit===undefined?30:Number(q.limit),after=q.after?identifier(q.after):null,include=q.include?identifier(q.include):null;
 if(typeof term!=='string'||term.length>120||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Geçersiz seçim filtresi');
 const where=`FROM orders o WHERE o.tenant_id=$1 AND o.site_id=$2 AND ($3='' OR strpos(lower(concat_ws(' ',o.order_number,o.customer,o.part_name,o.part_number)),lower($3))>0)`;
 const args=[s.tenantId,s.siteId,term.trim()];
 const total=number((await c.query('SELECT count(*) n '+where,args)).rows[0].n);
 const rows=(await c.query('SELECT o.id,o.order_number,o.customer,o.part_name,o.status '+where+' AND ($4::uuid IS NULL OR o.id>$4) ORDER BY o.id LIMIT $5',[...args,after,limit+1])).rows;
 const map=x=>({id:x.id,orderNumber:x.order_number,customer:x.customer,partName:x.part_name,status:x.status});
 const selected=include?(await c.query('SELECT id,order_number,customer,part_name,status FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,include])).rows[0]:null;
 return {items:rows.slice(0,limit).map(map),total,nextAfter:rows.length>limit?rows[limit-1].id:null,selected:selected?map(selected):null};
}
function routes(api){api.get('/sites/:tenantId/:siteId/order-choices',req=>scoped(req,(c,s)=>choices(c,s,req.query||{})))}
module.exports={routes,choices};
