'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {migrate}=require('../src/migrate');
const {inTransaction}=require('../src/db');
const {buildApp}=require('../src/app');
const {executeCommand}=require('../src/command');
const database=process.env.TEST_DATABASE_URL;
if (!database) throw new Error('TEST_DATABASE_URL must point to a disposable PostgreSQL database');
test('real PostgreSQL migrations, referential boundaries, rollback and append-only history',async()=>{
 const admin=new Pool({connectionString:database});const schema='b01_test_'+crypto.randomBytes(10).toString('hex');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:database,options:`-c search_path=${schema}`});
 const id=()=>crypto.randomUUID();const t=id(),t2=id(),s=id(),o=id(),op=id(),wo=id(),lot=id(),u=id(),event=id();
 try{
  const results=await Promise.all([migrate(pool),migrate(pool)]);assert.deepEqual(results.flat(),['001','002','003','004','005','006','007','008','009','010','011','012','013','014','015','016','017','018','019','020','021','022','023','024','025','026','027']);assert.deepEqual(await migrate(pool),[]);
  assert.equal((await pool.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,27);
  await pool.query("INSERT INTO tenants(id,name) VALUES($1,'A'),($2,'B')",[t,t2]);
  await pool.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'site','Site')",[t,s]);
  await pool.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,'issuer','subject','User')",[u]);
  // Warehouse scaffolding has no runtime grants yet; verify hierarchy and immutable history as setup role.
  const material=id(),plant=id(),warehouse=id(),region=id(),container=id(),warehouseLot=id(),move=id();
  await pool.query("INSERT INTO inventory_materials(tenant_id,site_id,id,code,description,base_unit) VALUES($1,$2,$3,'M','fixture','piece')",[t,s,material]);
  await pool.query("INSERT INTO inventory_locations(tenant_id,site_id,id,kind,code) VALUES($1,$2,$3,'plant','P')",[t,s,plant]);
  await assert.rejects(pool.query("INSERT INTO inventory_locations(tenant_id,site_id,id,kind,code,parent_id) VALUES($1,$2,$3,'warehouse','bad',$4)",[t,s,id(),plant]),{code:'23514'});
  await pool.query("INSERT INTO inventory_locations(tenant_id,site_id,id,kind,code,parent_id,parent_kind) VALUES($1,$2,$3,'warehouse','W',$4,'plant'),($1,$2,$5,'region','R',$3,'warehouse'),($1,$2,$6,'container','C',$5,'region')",[t,s,warehouse,plant,region,container]);
  await assert.rejects(pool.query("INSERT INTO inventory_locations(tenant_id,site_id,id,kind,code,parent_id,parent_kind) VALUES($1,$2,$3,'region','bad2',$4,'warehouse')",[t,s,id(),plant]),{code:'23503'});
  await pool.query("INSERT INTO inventory_lots(tenant_id,site_id,id,material_id,lot_code,supplier_ref) VALUES($1,$2,$3,$4,'LOT','SUP')",[t,s,warehouseLot,material]);
  await pool.query("INSERT INTO idempotency_records(tenant_id,site_id,actor_id,key,request_hash,status) VALUES($1,$2,$3,'inventory-fixture',repeat('a',64),'pending')",[t,s,u]);
  await pool.query("INSERT INTO inventory_movements(tenant_id,site_id,id,lot_id,kind,destination_location_id,quantity_pieces,actor_id,idempotency_key,document_ref) VALUES($1,$2,$3,$4,'receipt',$5,5,$6,'inventory-fixture','DOC')",[t,s,move,warehouseLot,container,u]);
  await assert.rejects(pool.query('DELETE FROM inventory_movements WHERE id=$1',[move]),{code:'55000'});
  await pool.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'ORDER','fictional','part',20)",[t,s,o]);
  await pool.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind) VALUES($1,$2,$3,$4,0,'Op','internal')",[t,s,o,op]);
  await pool.query("INSERT INTO work_orders(tenant_id,site_id,id,order_id,operation_id,work_order_number,planned_qty) VALUES($1,$2,$3,$4,$5,'WO',20)",[t,s,wo,o,op]);
  await pool.query("INSERT INTO lots(tenant_id,site_id,id,order_id,lot_code,kind) VALUES($1,$2,$3,$4,'LOT','material')",[t,s,lot,o]);
  await assert.rejects(pool.query("INSERT INTO reservations(tenant_id,site_id,id,order_id,work_order_id,lot_id,quantity_pieces,status) VALUES($1,$2,$3,$4,$5,$6,1,'active')",[t,s,id(),o,id(),lot]),{code:'23503'});
  await assert.rejects(pool.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'site','Other')",[t,s]),{code:'23505'});
  await assert.rejects(pool.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'bad','c','p',-1)",[t,s,id()]),{code:'23514'});
  await assert.rejects(pool.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'foreign','c','p',1)",[t2,s,id()]),{code:'23503'});
  await pool.query("INSERT INTO production_events(tenant_id,site_id,id,work_order_id,kind,quantity_pieces,actor_id) VALUES($1,$2,$3,$4,'good',1,$5)",[t,s,event,wo,u]);
  await assert.rejects(pool.query('DELETE FROM production_events WHERE id=$1',[event]),{code:'55000'});
  await assert.rejects(inTransaction(pool,async c=>{await c.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'ROLLBACK','c','p',1)",[t,s,id()]);throw Error('rollback')}));
  assert.equal((await pool.query("SELECT count(*)::int n FROM orders WHERE order_number='ROLLBACK'")).rows[0].n,0);
  await pool.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'manager')",[t,s,u]);
  const context={identity:{verified:true,userId:u},tenantId:t,siteId:s,key:'same-command',kind:'test.command',payload:{a:1},capability:'orders.write'};
  let calls=0;
  const action=async c=>{calls++;await c.query("INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id) VALUES($1,$2,$3,$4,'test','order',$5)",[t,s,id(),u,o]);return {status:201,body:{created:true}}};
  const pair=await Promise.all([executeCommand(pool,context,action),executeCommand(pool,context,action)]);
  assert.equal(calls,1);assert.deepEqual(pair.map(x=>x.duplicate).sort(),[false,true]);
  assert.equal((await pool.query("SELECT count(*)::int n FROM audit_events WHERE event_type='test'")).rows[0].n,1);
  await assert.rejects(executeCommand(pool,{...context,payload:{a:2}},action),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(executeCommand(pool,{...context,key:'forbidden',capability:'platform.manage'},action),{code:'FORBIDDEN'});
  await assert.rejects(executeCommand(pool,{...context,key:'failure'},async c=>{await c.query("INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id) VALUES($1,$2,$3,$4,'fail','order',$5)",[t,s,id(),u,o]);throw Error('failure')}));
  assert.equal((await pool.query("SELECT count(*)::int n FROM audit_events WHERE event_type='fail'")).rows[0].n,0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM idempotency_records WHERE key IN ('forbidden','failure')")).rows[0].n,0);
  const app=buildApp({pool});try{assert.equal((await app.inject('/health/ready')).statusCode,503);}finally{await app.close()}
  await pool.query("UPDATE schema_migrations SET checksum='wrong' WHERE version='001'");await assert.rejects(migrate(pool),/checksum mismatch/);
 } finally {await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});
