'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {provider,email,username}=require('../src/workspace-users');
const p={userId:'df304cdf-6bed-46c3-b56f-a9880010da82',tenantId:'tenant',name:'Operator'},url='https://example.supabase.co';
test('managed provider creates confirmed password credentials without sending mail',async()=>{
 const calls=[],create=provider({url,secretKey:'test-secret',fetcher:async(u,o)=>{calls.push({u,...o});return new Response(JSON.stringify(o.method==='GET'?{}:{id:p.userId}),{status:o.method==='GET'?404:200})}});
 await create(p,'Temporary-Password-123');assert.equal(calls.length,2);const b=JSON.parse(calls[1].body);assert.equal(b.email_confirm,true);assert.equal(b.email,email(p.userId));assert.equal(b.id,p.userId);assert.equal(b.app_metadata.ritim_tenant,p.tenantId);assert(!calls.some(c=>c.u.includes('invite')));
});
test('retry after uncertain create reuses only the managed identity and saves the supplied password',async()=>{
 const calls=[],create=provider({url,secretKey:'test-secret',fetcher:async(u,o)=>{calls.push({u,...o});return new Response(JSON.stringify(o.method==='GET'?{id:p.userId,email:email(p.userId),app_metadata:{ritim_tenant:p.tenantId}}:{}))}});
 await create(p,'New-Temporary-Password-123');assert.equal(calls[1].method,'PUT');assert.equal(JSON.parse(calls[1].body).password,'New-Temporary-Password-123');assert(!calls.some(c=>c.method==='POST'));
});
test('provider never adopts a conflicting account, treats timeout as unknown and validates usernames',async()=>{
 let writes=0;const create=provider({url,secretKey:'test-secret',fetcher:async(u,o)=>{if(o.method!=='GET')writes++;return new Response(JSON.stringify({id:p.userId,email:email(p.userId),app_metadata:{ritim_tenant:'other'}}))}});
 await assert.rejects(create(p,'Temporary-Password-123'),{code:'IDENTITY_CONFLICT'});assert.equal(writes,0);
 await assert.rejects(provider({url,secretKey:'test-secret',fetcher:async()=>{throw Error('timeout')}})(p,'Temporary-Password-123'),{code:'USERS_UNKNOWN'});
 assert.equal(username(' Worker.One '),'worker.one');for(const value of ['ab','a@b.com','../abc','a'.repeat(41),null])assert.throws(()=>username(value),{code:'INVALID_USERNAME'});
});
