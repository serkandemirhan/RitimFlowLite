const test=require('node:test'),assert=require('node:assert/strict'),{catalogRoute}=require('../src/catalog-route');
test('catalog route derives name and kind, scopes the lookup and preserves timing',async()=>{
 let params;const c={query:async(sql,args)=>{params=args;assert.match(sql,/deleted_at IS NULL/);assert.match(sql,/FOR SHARE/);return {rows:[{id:'a',name:'Kaplama',kind:'external',requested_name:'kaplama'}]}}};
 const rows=await catalogRoute(c,{tenantId:'t',siteId:'s'},[{name:'kaplama',kind:'internal',setupMinutes:3}]);assert.deepEqual(params,['t','s',['kaplama']]);assert.deepEqual(rows,[{name:'Kaplama',kind:'external',setupMinutes:3}]);
});
test('missing or inactive catalog operation cannot be inserted as a free route entry',async()=>{
 await assert.rejects(catalogRoute({query:async()=>({rows:[]})},{tenantId:'t',siteId:'s'},[{name:'Unknown',kind:'internal'}]),e=>e.code==='MASTER_OPERATION_UNAVAILABLE');
});
