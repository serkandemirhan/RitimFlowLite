const {test}=require('node:test');
const assert=require('node:assert/strict');
const {nextSalesOrderNumber}=require('../src/sales-order-number');
test('sales order allocation scopes its lock and preserves the full customer code',async()=>{
 const calls=[];const client={async query(sql,args){calls.push({sql,args});return {rows:[{next:'42'}]}}};
 assert.equal(await nextSalesOrderNumber(client,{tenantId:'tenant',siteId:'site'},'ABC_01'),'SOABC_01_000042');
 assert.match(calls[0].sql,/pg_advisory_xact_lock/);
 assert.deepEqual(calls[0].args,['sales-order:tenant:site:SOABC_01_']);
 assert.deepEqual(calls[1].args,['tenant','site','SOABC_01_',10]);
});
test('sales order numbers grow beyond six digits without truncation',async()=>{
 const client={async query(){return {rows:[{next:'1000000'}]}}};
 assert.equal(await nextSalesOrderNumber(client,{tenantId:'t',siteId:'s'},'A'),'SOA_1000000');
});
