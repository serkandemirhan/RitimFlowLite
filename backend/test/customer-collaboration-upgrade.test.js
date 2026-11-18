'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Pool}=require('pg');
const {upgradeSql}=require('../security/customer-collaboration-upgrade'),{provisionRuntime}=require('../security/provision-runtime');
const db=process.env.TEST_DATABASE_URL;
test('077 upgrade preserves deployed history, revokes old entry points and is repeatable',{skip:!db},async()=>{
 const suffix=crypto.randomBytes(6).toString('hex'),schema='cu_'+suffix,owner='cuo_'+suffix,runtime='cur_'+suffix,roles=require('../test-support/roles.cjs').roleConnections(db),admin=new Pool({connectionString:db});let pool,restricted;
 try{
  await roles.createRole(admin,owner);await roles.createRole(admin,runtime);await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}"`);pool=new Pool({connectionString:roles.roleUrl(owner),options:'-c search_path='+schema});
  await pool.query('CREATE TABLE schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const directory=path.join(__dirname,'../migrations');for(const f of fs.readdirSync(directory).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<77).sort()){const sql=fs.readFileSync(path.join(directory,f),'utf8');await pool.query(sql);await pool.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[f.slice(0,3),crypto.createHash('sha256').update(sql).digest('hex')]);}
  const before=(await pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  const client=await pool.connect();try{await client.query('BEGIN');await provisionRuntime(client,schema,runtime,{isolatedDevelopment:true});await client.query('COMMIT');}finally{client.release();}
  restricted=new Pool({connectionString:roles.roleUrl(runtime),options:'-c search_path='+schema});assert.deepEqual(await require('../src/readiness').checkReadiness(restricted,{isolatedDevelopment:true}),{customerPortal:true});
  const script=upgradeSql({schema,runtime});await pool.query(script);await pool.query(script);
  assert.deepEqual((await pool.query("SELECT * FROM schema_migrations WHERE version<>'077' ORDER BY version")).rows,before);
  assert.deepEqual(await require('../src/readiness').checkReadiness(restricted,{isolatedDevelopment:true}),{customerPortal:true,customerCollaboration:true});
  await assert.rejects(restricted.query('SELECT ritim_portal_order_list_v1($1)',[crypto.randomUUID()]),/permission denied/);
  await pool.query("UPDATE schema_migrations SET checksum='drift' WHERE version='077'");await assert.rejects(pool.query(script),/077 checksum mismatch/);await pool.query('ROLLBACK');
 }finally{if(restricted)await restricted.end();if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);for(const r of [runtime,owner])await admin.query(`DROP ROLE IF EXISTS "${r}"`);await admin.end();}
});
