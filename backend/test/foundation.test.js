'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildApp}=require('../src/app');
const {loadConfig}=require('../src/config');
const {inTransaction}=require('../src/db');
const {requireIdentity}=require('../src/auth');
test('environment configuration validates port, connection URL and TLS mode',()=>{
 assert.equal(loadConfig({}).port,3000);assert.equal(loadConfig({PORT:'8123',DB_SSL:'verify'}).ssl,'verify');
 for(const env of [{PORT:'-1'},{PORT:'x'},{DATABASE_URL:'http://wrong'},{DB_SSL:'insecure'}]) assert.throws(()=>loadConfig(env));
});
test('public health distinguishes process and database availability without exposing errors',async()=>{
 const app=buildApp({pool:{query:async()=>{throw Error('secret database address')}}});
 try {const live=await app.inject('/health/live'),ready=await app.inject('/health/ready');assert.equal(live.statusCode,200);assert.equal(ready.statusCode,503);assert.equal(ready.json().error.code,'DATABASE_UNAVAILABLE');assert(!ready.body.includes('secret'));}finally{await app.close()}
});
test('session fails closed even with spoofed user and role headers',async()=>{
 const app=buildApp({pool:{query:async()=>({rows:[]})}});
 try {const r=await app.inject({url:'/api/v1/session',headers:{'x-user':'administrator','x-role':'manager'}});assert.equal(r.statusCode,401);assert.equal(r.json().error.code,'UNAUTHENTICATED');}finally{await app.close()}
});
test('identity must be verified by the server',async()=>{
 await assert.rejects(requireIdentity({}),{statusCode:401});
 await assert.rejects(requireIdentity({auth:{verified:false,roles:['manager']}}),{statusCode:401});
 await requireIdentity({auth:{verified:true}});
});
test('no business mutations are exposed',async()=>{
 const app=buildApp({pool:{query:async()=>({rows:[]})}});
 try {for(const url of ['/api/v1/orders','/api/v1/shipments','/api/v1/production']){const r=await app.inject({method:'POST',url,payload:{}});assert.equal(r.statusCode,404);assert.equal(r.json().error.code,'NOT_FOUND');}}finally{await app.close()}
});
test('transaction commits once on one client and rolls back on failure',async()=>{
 const calls=[];const c={query:async sql=>calls.push(sql),release:()=>calls.push('release')};const pool={connect:async()=>c};
 assert.equal(await inTransaction(pool,async client=>{assert.equal(client,c);await client.query('WORK');return 3}),3);assert.deepEqual(calls,['BEGIN','WORK','COMMIT','release']);
 calls.length=0;await assert.rejects(inTransaction(pool,async()=>{throw Error('failed')}));assert.deepEqual(calls,['BEGIN','ROLLBACK','release']);
});
test('command canonicalization is deterministic and unauthenticated commands never access storage',async()=>{
 const {canonical,executeCommand}=require('../src/command');
 assert.equal(canonical({b:1,a:2}),canonical({a:2,b:1}));
 assert.throws(()=>canonical({amount:NaN}),{code:'INVALID_COMMAND'});
 let connected=false;const pool={connect:async()=>{connected=true;throw Error('must not connect')}};
 await assert.rejects(executeCommand(pool,{identity:{verified:false,userId:'x'}},async()=>{}),{code:'UNAUTHENTICATED'});
 assert.equal(connected,false);
});
