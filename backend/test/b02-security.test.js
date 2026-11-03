'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {migrate}=require('../src/migrate');
const {buildApp}=require('../src/app');
const {makeOidcVerifier}=require('../src/identity');
const {executeCommand}=require('../src/command');
const db=process.env.TEST_DATABASE_URL;
if(!db)throw Error('TEST_DATABASE_URL must point to a disposable PostgreSQL database');
test('B02 PostgreSQL scoped authorization and authenticated API',async t=>{
 const admin=new Pool({connectionString:db}),schema='b02_test_'+crypto.randomBytes(10).toString('hex');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:db,options:`-c search_path=${schema}`});
 const id=()=>crypto.randomUUID(),tenant=id(),other=id(),site=id(),site2=id(),foreign=id(),user=id();
 const issuer='https://identity.example.test',audience='ritim-api';
 const jose=await import('jose'),keys=await jose.generateKeyPair('RS256'),jwk=await jose.exportJWK(keys.publicKey);
 Object.assign(jwk,{kid:'k1',alg:'RS256',use:'sig'});
 const verifier=makeOidcVerifier({issuer,audience,jwksUrl:issuer+'/keys',fetcher:async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}})});
 const sign=async(payload={},opts={})=>new jose.SignJWT(payload).setProtectedHeader({alg:'RS256',kid:'k1',typ:'at+jwt'}).setIssuer(opts.issuer||issuer).setAudience(opts.audience||audience).setSubject('subject').setIssuedAt().setExpirationTime(opts.exp||'10m').sign(keys.privateKey);
 const app=buildApp({pool,verifier});
 try{
  await migrate(pool);
  await pool.query("INSERT INTO tenants(id,name) VALUES($1,'A'),($2,'B')",[tenant,other]);
  await pool.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'s1','S1'),($1,$3,'s2','S2'),($4,$5,'s3','S3')",[tenant,site,site2,other,foreign]);
  await pool.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,$2,'subject','User')",[user,issuer]);
  await pool.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'operator')",[tenant,site,user]);
  const token=await sign({roles:['superadmin'],tenantId:other,siteId:foreign});
  const req=(url,tk=token)=>app.inject({url,headers:{authorization:'Bearer '+tk,'x-role':'superadmin','x-tenant-id':other}});
  await t.test('verified identity, memberships and capabilities ignore frontend role and scope claims',async()=>{
   assert.equal((await app.inject('/api/v1/session')).statusCode,401);
   const r=await req('/api/v1/session');assert.equal(r.statusCode,200);const body=r.json();
   assert.equal(body.identity.id,user);assert.equal(body.memberships.length,1);assert.equal(body.memberships[0].siteId,site);
   assert.deepEqual(body.memberships[0].roles,['operator']);assert(!body.memberships[0].capabilities.includes('platform.manage'));
   assert.equal((await req(`/api/v1/sites/${tenant}/${site}/capabilities`)).statusCode,200);
  });
  await t.test('expired, wrong issuer and audience are denied by HTTP authentication',async()=>{
   for(const tk of [await sign({}, {exp:'-1s'}),await sign({}, {issuer:'https://wrong.example'}),await sign({}, {audience:'wrong'})])assert.equal((await req('/api/v1/session',tk)).statusCode,401);
  });
  await t.test('cross-site and cross-tenant access fail closed, including mismatched ownership',async()=>{
   for(const pair of [[tenant,site2],[other,foreign],[other,site]])assert.equal((await req(`/api/v1/sites/${pair[0]}/${pair[1]}/capabilities`)).statusCode,403);
  });
  const ctx=(tenantId,siteId,key,capability='orders.write')=>({identity:{verified:true,userId:user},tenantId,siteId,key,kind:'test',payload:{quantity:1},capability});
  const action=async()=>({status:201,body:{ok:true}});
  await t.test('operator escalation is rejected inside transaction without a receipt',async()=>{
   await assert.rejects(executeCommand(pool,ctx(tenant,site,'denied'),action),{code:'FORBIDDEN'});
   assert.equal((await pool.query("SELECT count(*)::int n FROM idempotency_records WHERE key='denied'")).rows[0].n,0);
  });
  await t.test('tenant administrators are scoped to their own tenant and revocation is immediate',async()=>{
   await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'tenant_admin')",[tenant,user]);
   assert.equal((await req(`/api/v1/sites/${tenant}/${site2}/capabilities`)).statusCode,200);
   assert.equal((await req(`/api/v1/sites/${other}/${foreign}/capabilities`)).statusCode,403);
   await pool.query('UPDATE tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2',[tenant,user]);
   assert.equal((await req(`/api/v1/sites/${tenant}/${site2}/capabilities`)).statusCode,403);
  });
  await t.test('platform admin requires an actual active database grant',async()=>{
   await pool.query('INSERT INTO platform_admins(user_id) VALUES($1)',[user]);
   const r=await req(`/api/v1/sites/${other}/${foreign}/capabilities`);assert.equal(r.statusCode,200);assert(r.json().capabilities.includes('platform.manage'));
   await pool.query('UPDATE platform_admins SET revoked_at=now() WHERE user_id=$1',[user]);
   assert.equal((await req(`/api/v1/sites/${other}/${foreign}/capabilities`)).statusCode,403);
  });
  await t.test('idempotency receipts are isolated between tenants and retries',async()=>{
   await pool.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'manager'),($4,$5,$3,'manager')",[tenant,site,user,other,foreign]);
   let calls=0;const fn=async()=>{calls++;return action()};
   const a=await executeCommand(pool,ctx(tenant,site,'shared'),fn),b=await executeCommand(pool,ctx(other,foreign,'shared'),fn),c=await executeCommand(pool,ctx(tenant,site,'shared'),fn);
   assert.deepEqual([a.duplicate,b.duplicate,c.duplicate],[false,false,true]);assert.equal(calls,2);
   assert.equal((await pool.query("SELECT count(*)::int n FROM idempotency_records WHERE key='shared'")).rows[0].n,2);
  });
  await t.test('revocation waits for an authorized transaction, then blocks later writes',async()=>{
   let start,finish;const entered=new Promise(r=>start=r),gate=new Promise(r=>finish=r);
   const pending=executeCommand(pool,ctx(tenant,site,'concurrent'),async()=>{start();await gate;return action()});
   await entered;let updated=false;
   const revoke=pool.query("UPDATE site_memberships SET revoked_at=now() WHERE tenant_id=$1 AND site_id=$2 AND user_id=$3 AND role='manager'",[tenant,site,user]).then(()=>{updated=true});
   try{await new Promise(r=>setTimeout(r,150));assert.equal(updated,false);}finally{finish();}
   assert.equal((await pending).status,201);await revoke;assert.equal(updated,true);
   await assert.rejects(executeCommand(pool,ctx(tenant,site,'after-revoke'),action),{code:'FORBIDDEN'});
   assert.equal((await pool.query("SELECT count(*)::int n FROM idempotency_records WHERE key='after-revoke'")).rows[0].n,0);
  });
  await t.test('revoked memberships and disabled user are not returned or authorized',async()=>{
   await pool.query('UPDATE site_memberships SET revoked_at=now() WHERE tenant_id=$1 AND site_id=$2 AND user_id=$3',[tenant,site,user]);
   assert.equal((await req(`/api/v1/sites/${tenant}/${site}/capabilities`)).statusCode,403);
   await pool.query('UPDATE users SET disabled_at=now() WHERE id=$1',[user]);
   assert.equal((await req('/api/v1/session')).statusCode,401);
  });
 }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});
