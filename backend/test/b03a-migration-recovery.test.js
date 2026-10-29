'use strict';
// Explicitly disposable DB only: creates and drops a random schema and restore database.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{Pool}=require('pg');
const source=process.env.TEST_DATABASE_URL;if(!source)throw Error('TEST_DATABASE_URL must point to a disposable privileged PostgreSQL database');
const root=path.join(__dirname,'..');
test('existing database upgrade, failed migration and isolated backup/restore',async t=>{
 const suffix=crypto.randomBytes(8).toString('hex'),schema='recovery_'+suffix,restoreDb='recovery_'+suffix,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ritim-b03a-test-'));
 const admin=new Pool({connectionString:source});let original,restored,createdSchema=false,createdDb=false;
 try{
  const testRoot=path.join(tmp,'fixture');fs.mkdirSync(path.join(testRoot,'src'),{recursive:true});fs.mkdirSync(path.join(testRoot,'migrations'));
  fs.copyFileSync(path.join(root,'src/migrate.js'),path.join(testRoot,'src/migrate.js'));
  for(const file of ['db','config'])fs.writeFileSync(path.join(testRoot,'src',file+'.js'),`module.exports=require(${JSON.stringify(path.join(root,'src',file+'.js'))});\n`);
  for(const file of ['001_foundation.sql','002_authorization.sql'])fs.copyFileSync(path.join(root,'migrations',file),path.join(testRoot,'migrations',file));
  const {migrate}=require(path.join(testRoot,'src/migrate.js'));
  await admin.query(`CREATE SCHEMA "${schema}"`);createdSchema=true;
  original=new Pool({connectionString:source,options:`-c search_path=${schema}`});
  await t.test('historical 001/002 data upgrades to 010 without changing records',async()=>{
   assert.deepEqual(await migrate(original),['001','002']);const tenant=crypto.randomUUID(),site=crypto.randomUUID(),order=crypto.randomUUID();
   await original.query("INSERT INTO tenants(id,name) VALUES($1,'fictional')",[tenant]);await original.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'S','Site')",[tenant,site]);await original.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'old-order','fictional','P',42)",[tenant,site,order]);
   const before=(await original.query('SELECT tenant_id,site_id,id,order_number,customer,part_number,ordered_qty,status,created_at FROM orders')).rows;
   for(const file of ['003_scope_rls.sql','004_readiness.sql','005_orders_planning.sql','006_physical_flow.sql','007_production_execution.sql','008_quality_disposition.sql','009_production_output_lots.sql','010_output_reservations.sql'])fs.copyFileSync(path.join(root,'migrations',file),path.join(testRoot,'migrations',file));
   assert.deepEqual(await migrate(original),['003','004','005','006','007','008','009','010']);assert.deepEqual((await original.query('SELECT tenant_id,site_id,id,order_number,customer,part_number,ordered_qty,status,created_at FROM orders')).rows,before);assert.deepEqual(await migrate(original),[]);
  });
  await t.test('failed migration rolls back its DDL and version record',async()=>{
   fs.writeFileSync(path.join(testRoot,'migrations/011_injected_failure.sql'),'CREATE TABLE partial_should_rollback(id int); SELECT 1/0;');
   await assert.rejects(migrate(original),{code:'22012'});
   assert.equal((await original.query("SELECT to_regclass('partial_should_rollback') AS name")).rows[0].name,null);
   assert.equal((await original.query("SELECT count(*)::int AS n FROM schema_migrations WHERE version='011'")).rows[0].n,0);
   assert.equal((await original.query("SELECT ordered_qty::int AS qty FROM orders WHERE order_number='old-order'")).rows[0].qty,42);
  });
  await t.test('backup restores into a separate fictional database with data and schema version intact',async()=>{
   await admin.query(`CREATE DATABASE "${restoreDb}"`);createdDb=true;
   const url=new URL(source),env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.searchParams.get('user')||url.username||process.env.PGUSER||''),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGPASSWORD:decodeURIComponent(url.password||'')};
   if(url.searchParams.has('sslmode'))env.PGSSLMODE=url.searchParams.get('sslmode');
   const dump=path.join(tmp,'fictional.dump');execFileSync('pg_dump',['--format=custom','--schema',schema,'--no-owner','--no-privileges','--file',dump],{env,stdio:'pipe'});
   const backupHash=crypto.createHash('sha256').update(fs.readFileSync(dump)).digest('hex');assert.match(backupHash,/^[a-f0-9]{64}$/);
   execFileSync('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname',restoreDb,dump],{env,stdio:'pipe'});
   const target=new URL(source);target.pathname='/'+restoreDb;restored=new Pool({connectionString:target.toString(),options:`-c search_path=${schema}`});
   assert.equal((await restored.query("SELECT ordered_qty::int AS qty FROM orders WHERE order_number='old-order'")).rows[0].qty,42);
   assert.deepEqual((await restored.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version),['001','002','003','004','005','006','007','008','009','010']);
   assert.equal((await restored.query("SELECT relrowsecurity AND relforcerowsecurity AS rls FROM pg_class WHERE oid='orders'::regclass")).rows[0].rls,true);
   console.log('# fictional backup sha256 '+backupHash);
  });
 }finally{if(original)await original.end();if(restored)await restored.end();if(createdSchema)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);if(createdDb)await admin.query(`DROP DATABASE "${restoreDb}"`);await admin.end();fs.rmSync(tmp,{recursive:true,force:true})}
});
