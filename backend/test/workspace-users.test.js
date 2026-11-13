'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{makeSupabaseBff}=require('../src/supabase-auth'),{buildApp}=require('../src/app');

test('managed users: username login, scoped creation, replay, suspension of active sessions and reactivation',async()=>{
 const db=process.env.TEST_DATABASE_URL;if(!db)throw Error('Disposable PostgreSQL required');
 const admin=new Pool({connectionString:db}),suffix=crypto.randomBytes(6).toString('hex'),schema='users_'+suffix,role='users_app_'+suffix;
 const {roleUrl,createRole}=require('../test-support/roles.cjs').roleConnections(db),id=()=>crypto.randomUUID(),tenant=id(),other=id(),site=id(),otherSite=id(),manager=id(),operator=id(),outsider=id();
 const origin='https://app.example',url='https://example.supabase.co',issuer=url+'/auth/v1',password='Worker-Test-Password-123';let seed,pool,app;
 try{
  await createRole(admin,role);await admin.query(`CREATE SCHEMA ${schema}`);seed=new Pool({connectionString:db,options:'-c search_path='+schema});await migrate(seed);await provisionRuntime(seed,schema,role,{isolatedDevelopment:true});
  await seed.query("INSERT INTO tenants(id,name) VALUES($1,'Company'),($2,'Other')",[tenant,other]);await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'MAIN','Main'),($3,$4,'OTHER','Other')",[tenant,site,other,otherSite]);
  await seed.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,$4,'manager','Manager'),($2,$4,'operator','Operator'),($3,$4,'outsider','Outsider')",[manager,operator,outsider,issuer]);
  await seed.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'tenant_admin'),($3,$4,'tenant_admin')",[tenant,manager,other,outsider]);await seed.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'operator')",[tenant,site,operator]);
  pool=new Pool({connectionString:roleUrl(role),options:'-c search_path='+schema});const providerUsers=new Map(),calls=[];
  const verifier={verify:async token=>{const subject=token?.split('.')[1];if(!subject)throw Error();return {issuer,subject}}};
  const fetcher=async(address,options)=>{
   const u=new URL(address),body=options.body?JSON.parse(options.body):null;calls.push({path:u.pathname,method:options.method});
   if(u.pathname.endsWith('/token')){const found=[...providerUsers.values()].find(x=>x.email===body?.email&&x.password===body?.password);return new Response(JSON.stringify(found?{access_token:'access.'+found.id+'.token',refresh_token:'refresh-'+found.id,expires_in:3600}:{}),{status:found?200:400});}
   const target=u.pathname.split('/').at(-1);
   if(options.method==='GET'){const found=providerUsers.get(target);return new Response(JSON.stringify(found||{}),{status:found?200:404});}
   if(options.method==='POST'){assert.equal(body.email_confirm,true);providerUsers.set(body.id,body);return new Response(JSON.stringify(body));}
   if(options.method==='PUT'){Object.assign(providerUsers.get(target),body);return new Response(JSON.stringify(providerUsers.get(target)));}
   throw Error('Unexpected provider call');
  };
  const bff=makeSupabaseBff({url,publishableKey:'public',secretKey:'secret-fixture',appOrigin:origin,pool,verifier,fetcher});app=buildApp({pool,verifier,bff,isolatedDevelopment:true});app.addHook('onError',async(req,reply,e)=>{if(!e.statusCode||e.statusCode>=500)console.log('Managed fixture error:',e.code,e.message)});await app.ready();
  const cookie=subject=>'__Host-ritim_access=access.'+subject+'.token';
  const read=async()=>require('../src/workspace-administration').read(pool,{identity:{verified:true,userId:manager},tenantId:tenant,siteId:site});
  const version=async()=>(await read()).version;
  const post=(body,subject='manager')=>app.inject({method:'POST',url:'/auth/team',headers:{origin,cookie:cookie(subject)},payload:{tenantId:tenant,siteId:site,key:id(),...body}});
  const body={action:'create-user',username:'Worker.One',name:'Worker One',password,confirmation:password,destinationSiteId:site,role:'operator',version:await version(),key:id()};
  assert.equal((await post({...body,role:'tenant_admin'})).statusCode,400);
  assert.equal((await post({...body,destinationSiteId:otherSite})).statusCode,403);
  assert.equal((await post(body,'operator')).statusCode,403);assert.equal(calls.length,0);
  let r=await post(body);assert.equal(r.statusCode,303,r.body);assert.equal(calls.length,2);assert.equal((await post(body)).statusCode,303);assert.equal(calls.length,2,'Replay never repeats credential creation');
  const worker=(await read()).members.find(x=>x.username==='worker.one');assert(worker);assert.equal(worker.assignments[0].role,'operator');
  await assert.rejects(pool.query('SELECT * FROM managed_usernames'),{code:'42501'});await assert.rejects(pool.query("SELECT ritim_managed_users('read','{}')"),{code:'42501'});
  assert.equal((await post({...body,version:await version(),key:id()})).statusCode,409);assert.equal(providerUsers.size,1);
  const login=(name,pw)=>app.inject({method:'POST',url:'/auth/login',headers:{origin},payload:{email:name,password:pw}});
  r=await login('WORKER.ONE',password);assert.equal(r.statusCode,303);assert.equal(r.headers.location,'/');const workerCookies=r.headers['set-cookie'].map(x=>x.split(';')[0]).join('; ');
  assert.equal((await login('worker.one','wrong-password')).headers.location,'/auth/login?failed=1');assert.equal((await login('missing.user',password)).headers.location,'/auth/login?failed=1');
  assert.equal((await app.inject({url:'/api/v1/session',headers:{cookie:workerCookies}})).statusCode,200);
  assert.equal((await post({action:'suspend',userId:manager,version:await version()})).statusCode,403,'Manager cannot freeze own account');
  assert.equal((await post({action:'suspend',userId:outsider,version:await version()})).statusCode,403,'Cannot freeze foreign account');
  r=await post({action:'suspend',userId:worker.id,version:await version()});assert.equal(r.statusCode,303,r.body);
  assert.equal((await app.inject({url:'/api/v1/session',headers:{cookie:workerCookies}})).statusCode,401,'Previously issued session is immediately refused');
  assert.equal((await app.inject({url:`/api/v1/sites/${tenant}/${site}/operator/work-orders`,headers:{cookie:workerCookies}})).statusCode,401);
  assert.equal((await login('worker.one',password)).headers.location,'/auth/login?failed=1');assert((await read()).members.find(x=>x.id===worker.id).disabled);
  assert.equal((await post({action:'activate',userId:worker.id,version:await version()})).statusCode,303);assert.equal((await login('worker.one',password)).headers.location,'/');
  // Shared identities must not be frozen globally by one workspace owner.
  await seed.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'viewer')",[other,otherSite,worker.id]);assert.equal((await post({action:'suspend',userId:worker.id,version:await version()})).statusCode,403);
  // Existing identity gets an alias; no identity-provider write or history replacement.
  providerUsers.set('operator',{id:'operator',email:'existing.operator@example.test',password});
  const usersBefore=(await seed.query('SELECT * FROM users WHERE id=$1',[operator])).rows;
  const membershipsBefore=(await seed.query('SELECT * FROM site_memberships WHERE user_id=$1 ORDER BY site_id,role',[operator])).rows;
  const historical=id();await seed.query("INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,'fixture.history','user',$4,'{}')",[tenant,site,historical,operator]);
  assert.equal((await login('existing.operator@example.test',password)).headers.location,'/');
  const alias={action:'assign-username',userId:operator,username:'Legacy.Operator',version:await version(),key:id()};
  assert.equal((await post(alias,'operator')).statusCode,403);
  assert.equal((await post({...alias,userId:outsider})).statusCode,403);
  assert.equal((await post({...alias,userId:manager})).statusCode,403);
  assert.equal((await post({...alias,username:'bad name'})).statusCode,400);
  assert.equal((await post({...alias,username:'worker.one'})).statusCode,409);
  const callsBeforeAlias=calls.length;r=await post(alias);assert.equal(r.statusCode,303,r.body);assert.equal(calls.length,callsBeforeAlias,'Assigning an alias never changes identity credentials');
  assert.equal((await post(alias)).statusCode,303,'Exact command replay succeeds without rebinding');
  assert.equal((await read()).members.find(x=>x.id===operator).username,'legacy.operator');
  assert.deepEqual((await seed.query('SELECT * FROM users WHERE id=$1',[operator])).rows,usersBefore);
  assert.deepEqual((await seed.query('SELECT * FROM site_memberships WHERE user_id=$1 ORDER BY site_id,role',[operator])).rows,membershipsBefore);
  assert.equal((await seed.query('SELECT actor_id FROM audit_events WHERE id=$1',[historical])).rows[0].actor_id,operator);
  assert.equal((await post({...alias,key:id(),username:'other.alias',version:await version()})).statusCode,409,'Existing usernames cannot be overwritten');
  r=await login('LEGACY.OPERATOR',password);assert.equal(r.headers.location,'/');const legacyCookies=r.headers['set-cookie'].map(x=>x.split(';')[0]).join('; ');
  assert.equal((await login('legacy.operator','wrong-password')).headers.location,'/auth/login?failed=1');
  assert.equal((await login('existing.operator@example.test',password)).headers.location,'/','Previous email login remains available');
  assert.equal((await app.inject({url:'/api/v1/session',headers:{cookie:legacyCookies}})).statusCode,200);
  assert.equal((await post({action:'suspend',userId:operator,version:await version()})).statusCode,303);
  assert.equal((await login('legacy.operator',password)).headers.location,'/auth/login?failed=1');
  assert.equal((await app.inject({url:'/api/v1/session',headers:{cookie:legacyCookies}})).statusCode,401);
  assert.equal((await post({action:'activate',userId:operator,version:await version()})).statusCode,303);
  assert.equal((await login('legacy.operator',password)).headers.location,'/');
  const audit=await seed.query('SELECT payload::text FROM audit_events');assert(!JSON.stringify(audit.rows).includes(password));const replay=await seed.query('SELECT response_body::text FROM idempotency_records');assert(!JSON.stringify(replay.rows).includes(password));
 }finally{if(app)await app.close();if(pool)await pool.end();if(seed)await seed.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();}
});
