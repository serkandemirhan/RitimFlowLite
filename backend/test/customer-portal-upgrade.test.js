'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg'),{upgradeSql}=require('../security/customer-portal-upgrade');
const db=process.env.TEST_DATABASE_URL;
test('portal owner upgrade preserves 074 history, is repeatable and rejects drift', {skip:!db},async()=>{
 const suffix=crypto.randomBytes(6).toString('hex'),schema='portal_upgrade_'+suffix,owner='portal_owner_'+suffix,runtime='portal_runtime_'+suffix;
 const admin=new Pool({connectionString:db}),roles=require('../test-support/roles.cjs').roleConnections(db);let pool;
 try{
  await roles.createRole(admin,owner);await roles.createRole(admin,runtime);await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}"`);
  pool=new Pool({connectionString:roles.roleUrl(owner),options:'-c search_path='+schema});
  await pool.query('CREATE TABLE schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=path.join(__dirname,'../migrations');for(const file of fs.readdirSync(dir).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=74).sort()){
   const sql=fs.readFileSync(path.join(dir,file),'utf8');await pool.query(sql);await pool.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file.slice(0,3),crypto.createHash('sha256').update(sql).digest('hex')]);
  }
  const tenant=crypto.randomUUID();await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Preserved tenant')",[tenant]);
  const before=(await pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  const script=upgradeSql({schema,runtime});await pool.query(script);await pool.query(script);
  assert.deepEqual((await pool.query("SELECT * FROM schema_migrations WHERE version<>'076' ORDER BY version")).rows,before);
  assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[tenant])).rows[0].name,'Preserved tenant');
  assert.equal((await pool.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,75);
  assert.equal((await pool.query("SELECT has_function_privilege($1,'ritim_portal_access(uuid,uuid)','EXECUTE') AND NOT has_table_privilege($1,'customer_portal_shares','SELECT,INSERT,UPDATE,DELETE') ok",[runtime])).rows[0].ok,true);
  await pool.query("UPDATE schema_migrations SET checksum='drift' WHERE version='074'");
  await assert.rejects(pool.query(script),/unchanged platform history/);await pool.query('ROLLBACK');
  await pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=\'074\'',[before.at(-1).checksum]);
  await pool.query("UPDATE schema_migrations SET checksum='drift' WHERE version='076'");
  await assert.rejects(pool.query(script),/076 checksum mismatch/);await pool.query('ROLLBACK');
  await pool.query("INSERT INTO schema_migrations(version,checksum) VALUES('075','unexpected')");
  await assert.rejects(pool.query(script),/unchanged platform history/);await pool.query('ROLLBACK');
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);for(const role of [runtime,owner])await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end();}
});
