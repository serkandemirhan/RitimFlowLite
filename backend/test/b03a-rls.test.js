'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{buildApp}=require('../src/app'),{executeCommand}=require('../src/command');
const db=process.env.TEST_DATABASE_URL;if(!db)throw Error('TEST_DATABASE_URL must point to disposable privileged PostgreSQL');
test('B03A isolation on real PostgreSQL with actual restricted login',async t=>{
 const admin=new Pool({connectionString:db}),suffix=crypto.randomBytes(8).toString('hex'),schema='b03_'+suffix,owner='b03_owner_'+suffix,runtime='b03_app_'+suffix;
 let migrations,appPool,app;const {roleUrl,createRole}=require('../test-support/roles.cjs').roleConnections(db);const id=()=>crypto.randomUUID(),ta=id(),tb=id(),sa=id(),sa2=id(),sb=id(),u=id(),userA=id(),orderA=id(),orderB=id();
 try{
  await createRole(admin,owner);
  await createRole(admin,runtime);
  await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}"`);
  migrations=new Pool({connectionString:roleUrl(owner),options:`-c search_path=${schema}`});assert.deepEqual(await migrate(migrations),['001','002','003','004','005','006','007','008','009','010','011','012','013','014','015','016','017','018','019','020','021','022','023','024','025','026','027','028','029','030','031','032','033','034','035','036','037','038','039','040','041','042','043','044','045','046','047','048','049','050','051','052','053','054','055']);
  const c=await migrations.connect();try{await c.query('BEGIN');await provisionRuntime(c,schema,runtime);await c.query('COMMIT')}finally{c.release()}
  const seed=new Pool({connectionString:db,options:`-c search_path=${schema}`});try{
   await seed.query("INSERT INTO tenants(id,name) VALUES($1,'A'),($2,'B')",[ta,tb]);
   await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'A','A'),($1,$3,'A2','A2'),($4,$5,'B','B')",[ta,sa,sa2,tb,sb]);
   await seed.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,'https://issuer.example','subject','A'),($2,'https://issuer.example','subject-a','A only')",[u,userA]);
   await seed.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'manager'),($4,$5,$3,'manager'),($1,$2,$6,'operator')",[ta,sa,u,tb,sb,userA]);
   await seed.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'A','A','A',10),($4,$5,$6,'B','B','B',10)",[ta,sa,orderA,tb,sb,orderB]);
  }finally{await seed.end()}
  appPool=new Pool({connectionString:roleUrl(runtime),options:`-c search_path=${schema}`,max:1});
  app=buildApp({pool:appPool,verifier:{verify:async()=>({issuer:'https://issuer.example',subject:'subject'})}});
  const auth={verified:true,userId:u},ctx=(tenantId,siteId,key)=>({identity:auth,tenantId,siteId,key,kind:'test',payload:{x:1},capability:'orders.write'}),action=async()=>({status:201,body:{ok:true}}),headers={authorization:'Bearer a.b.c'};
  await t.test('real runtime login lacks elevated rights and schema/membership modification',async()=>{
   const r=await appPool.query('SELECT current_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit FROM pg_roles WHERE rolname=current_user');assert.equal(r.rows[0].current_user,runtime);for(const k of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit'])assert.equal(r.rows[0][k],false);
   for(const sql of ['CREATE SCHEMA forbidden','CREATE TABLE forbidden(id int)','CREATE ROLE forbidden','UPDATE schema_migrations SET checksum=checksum','UPDATE site_memberships SET revoked_at=now()','ALTER TABLE orders DISABLE ROW LEVEL SECURITY','SELECT * FROM users'])await assert.rejects(appPool.query(sql),{code:'42501'});
  });
  await t.test('all 31 business tables enforce RLS and runtime does not own them',async()=>{
   const r=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`,[schema,['orders','operations','machines','work_orders','work_assignments','lots','material_receipts','reservations','physical_transfers','transfer_events','production_events','quality_decisions','rework_tasks','external_dispatches','external_returns','shipments','customer_returns','stock_movements','drawing_revisions','idempotency_records','audit_events','compensations','flow_transfers','physical_ledger','production_ledger','output_dispositions','production_output_lots','output_reservation_events','operation_dispatches','operation_receipts','demo_material_sources']]);
   assert.equal(r.rowCount,31);for(const x of r.rows){assert.equal(x.relrowsecurity,true,x.relname);assert.equal(x.relforcerowsecurity,true,x.relname);assert.equal(x.owner,owner,x.relname)}
  });
  await t.test('missing context fails closed and runtime cannot write domain rows',async()=>{
   assert.equal((await appPool.query('SELECT * FROM orders')).rowCount,0);
   await assert.rejects(appPool.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'X','X','X',1)",[tb,sb,id()]),{code:'42501'});
  });
  await t.test('authenticated API restricts sites, ignores forged headers and role escalation',async()=>{
   assert.equal((await app.inject({url:`/api/v1/sites/${ta}/${sa}/capabilities`,headers})).statusCode,200);
   assert.equal((await app.inject({url:`/api/v1/sites/${ta}/${sa2}/capabilities`,headers:{...headers,'x-role':'superadmin'}})).statusCode,403);
   assert.equal((await app.inject({url:`/api/v1/sites/${tb}/${sa}/capabilities`,headers})).statusCode,403);
   const limited=buildApp({pool:appPool,verifier:{verify:async()=>({issuer:'https://issuer.example',subject:'subject-a'})}});try{assert.equal((await limited.inject({url:`/api/v1/sites/${tb}/${sb}/capabilities`,headers})).statusCode,403);assert.equal((await limited.inject({method:'POST',url:'/api/v1/orders',headers,payload:{tenantId:tb,siteId:sb}})).statusCode,404)}finally{await limited.close()}
   const session=await app.inject({url:'/api/v1/session',headers});assert.equal(session.statusCode,200);assert.equal(session.json().memberships.length,2);
   await assert.rejects(executeCommand(appPool,{...ctx(ta,sa,'escalate'),capability:'platform.manage'},action),{code:'FORBIDDEN'});
  });
  await t.test('real HTTP listener serves health and verified session using restricted pool',async()=>{
   const address=await app.listen({host:'127.0.0.1',port:0});const ready=await fetch(address+'/health/ready');assert.equal(ready.status,200);const session=await fetch(address+'/api/v1/session',{headers});assert.equal(session.status,200);assert.equal((await session.json()).identity.id,u);
  });
  await t.test('readiness fails for missing runtime grants or migration version',async()=>{
   await migrations.query(`REVOKE INSERT ON idempotency_records FROM "${runtime}"`);try{assert.equal((await app.inject('/health/ready')).statusCode,503)}finally{await migrations.query(`GRANT INSERT ON idempotency_records TO "${runtime}"`)}
   const deleted=await migrations.query("DELETE FROM schema_migrations WHERE version='004' RETURNING version,checksum");try{assert.equal((await app.inject('/health/ready')).statusCode,503)}finally{await migrations.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[deleted.rows[0].version,deleted.rows[0].checksum])}
   await migrations.query("UPDATE schema_migrations SET checksum=$1 WHERE version='004'",['f'.repeat(64)]);try{assert.equal((await app.inject('/health/ready')).statusCode,503)}finally{await migrations.query("UPDATE schema_migrations SET checksum=$1 WHERE version='004'",[deleted.rows[0].checksum])}
   assert.equal((await app.inject('/health/ready')).statusCode,200);
  });
  await t.test('workflow readiness rejects missing document and execution grants and disabled document RLS',async()=>{
   const c=await migrations.connect();try{await provisionRuntime(c,schema,runtime,{isolatedDevelopment:true})}finally{c.release()}
   const workflow=buildApp({pool:appPool,workflowEnabled:true});
   try{
    assert.equal((await workflow.inject('/health/ready')).statusCode,200);
    for(const [revoke,restore] of [
     [`REVOKE INSERT ON quality_document_links FROM "${runtime}"`,`GRANT INSERT ON quality_document_links TO "${runtime}"`],
     [`REVOKE EXECUTE ON FUNCTION ritim_audit_actor_name(uuid,uuid,uuid) FROM "${runtime}"`,`GRANT EXECUTE ON FUNCTION ritim_audit_actor_name(uuid,uuid,uuid) TO "${runtime}"`],
     [`REVOKE UPDATE(execution_hold) ON orders FROM "${runtime}"`,`GRANT UPDATE(execution_hold) ON orders TO "${runtime}"`],
     ['ALTER TABLE quality_document_links NO FORCE ROW LEVEL SECURITY','ALTER TABLE quality_document_links FORCE ROW LEVEL SECURITY']
    ]){await migrations.query(revoke);try{assert.equal((await workflow.inject('/health/ready')).statusCode,503)}finally{await migrations.query(restore)}}
    assert.equal((await workflow.inject('/health/ready')).statusCode,200);
   }finally{await workflow.close();const c=await migrations.connect();try{await provisionRuntime(c,schema,runtime)}finally{c.release()}}
  });
  await t.test('RLS filters accidental missing tenant filters in a scoped transaction',async()=>{
   const c=await appPool.connect();try{await c.query('BEGIN');await c.query('SELECT ritim_open_scope($1,$2,$3)',[u,ta,sa]);const rows=await c.query('SELECT id FROM orders');assert.deepEqual(rows.rows.map(x=>x.id),[orderA]);await c.query('COMMIT');assert.equal((await c.query('SELECT * FROM orders')).rowCount,0);}finally{c.release()}
  });
  await t.test('RLS blocks cross-tenant idempotency writes in a scoped transaction',async()=>{
   const c=await appPool.connect();try{await c.query('BEGIN');await c.query('SELECT ritim_open_scope($1,$2,$3)',[u,ta,sa]);await assert.rejects(c.query("INSERT INTO idempotency_records(tenant_id,site_id,actor_id,key,request_hash,status) VALUES($1,$2,$3,'escape',$4,'pending')",[tb,sb,u,'0'.repeat(64)]),{code:'42501'});await c.query('ROLLBACK')}finally{c.release()}
  });
  await t.test('transaction rollback and pool reuse discard context',async()=>{
   const c=await appPool.connect();try{await c.query('BEGIN');await c.query('SELECT ritim_open_scope($1,$2,$3)',[u,ta,sa]);await c.query('ROLLBACK');assert.equal((await c.query('SELECT * FROM orders')).rowCount,0);await c.query('BEGIN');await c.query('SELECT ritim_open_scope($1,$2,$3)',[u,tb,sb]);assert.equal((await c.query('SELECT id FROM orders')).rows[0].id,orderB);await c.query('COMMIT');}finally{c.release()}
  });
  await t.test('idempotency receipts are isolated and failed authorization rolls back',async()=>{
   const a=await executeCommand(appPool,ctx(ta,sa,'same'),action),b=await executeCommand(appPool,ctx(tb,sb,'same'),action),retry=await executeCommand(appPool,ctx(ta,sa,'same'),action);assert.deepEqual([a.duplicate,b.duplicate,retry.duplicate],[false,false,true]);await assert.rejects(executeCommand(appPool,ctx(ta,sa2,'no'),action),{code:'FORBIDDEN'});
  });
  await t.test('definer search path ignores malicious temporary tables; PUBLIC execute revoked',async()=>{
   const c=await appPool.connect();try{await c.query('CREATE TEMP TABLE users(id uuid,issuer text,subject text,display_name text,disabled_at timestamptz)');await c.query("INSERT INTO users VALUES($1,'https://issuer.example','subject','Attacker',null)",[id()]);assert.equal((await c.query("SELECT display_name FROM ritim_identity('https://issuer.example','subject')")).rows[0].display_name,'A');}finally{c.release()}
   assert.equal((await admin.query("SELECT has_function_privilege('public', $1, 'EXECUTE') AS allowed",[`${schema}.ritim_open_scope(uuid,uuid,uuid)`])).rows[0].allowed,false);
  });
  await t.test('concurrent revocation waits for active command and blocks subsequent command',async()=>{
   let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const pending=executeCommand(appPool,ctx(ta,sa,'race'),async()=>{entered();await gate;return action()});await started;
   let done=false;const revoke=admin.query(`UPDATE "${schema}".site_memberships SET revoked_at=now() WHERE tenant_id=$1 AND site_id=$2 AND user_id=$3`,[ta,sa,u]).then(()=>done=true);
   try{await new Promise(r=>setTimeout(r,150));assert.equal(done,false)}finally{release()}await pending;await revoke;await assert.rejects(executeCommand(appPool,ctx(ta,sa,'after'),action),{code:'FORBIDDEN'});
  });
  await t.test('negative probe: arbitrary SQL as compromised runtime can forge mutable context',async()=>{
   const c=await appPool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('ritim.tenant',$1,true),set_config('ritim.site',$2,true)",[tb,sb]);assert.equal((await c.query('SELECT id FROM orders')).rows[0].id,orderB);await c.query('ROLLBACK')}finally{c.release()}
  });
 }finally{if(app)await app.close();if(appPool)await appPool.end();if(migrations)await migrations.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.query(`DROP ROLE IF EXISTS "${runtime}"`);await admin.query(`DROP ROLE IF EXISTS "${owner}"`);await admin.end()}
});
