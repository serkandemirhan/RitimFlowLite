'use strict';
// Allocate inside the order transaction, including its idempotency handling.
async function nextSalesOrderNumber(c,s,customerCode){
 const prefix='SO'+customerCode+'_';
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['sales-order:'+s.tenantId+':'+s.siteId+':'+prefix]);
 const result=await c.query(`SELECT COALESCE(MAX(substring(order_number FROM $4::integer)::numeric),0)+1 AS next
 FROM orders WHERE tenant_id=$1 AND site_id=$2 AND left(order_number,length($3))=$3
 AND substring(order_number FROM $4::integer) ~ '^[0-9]+$'`,[s.tenantId,s.siteId,prefix,prefix.length+1]);
 return prefix+String(result.rows[0].next).padStart(6,'0');
}
module.exports={nextSalesOrderNumber};
