'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Pool} = require('../../backend/node_modules/pg');
const {migrate} = require('../../backend/src/migrate');
const {provisionRuntime} = require('../../backend/security/provision-runtime');
const {checkReadiness} = require('../../backend/src/readiness');
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value||'')) throw Error('Invalid database identifier');
  return '"'+value+'"';
};
const developmentDatabase = value => {
  identifier(value);
  if (!/^ritim_[a-z0-9_]+_(dev|test|restore_test)$/.test(value)) throw Error('Explicit ritim_*_dev/test database required');
  return value;
};
function options(config, identity, database=config.database) {
  return {host:config.host, port:config.port, database, user:identity.user, password:identity.password,
    connectionTimeoutMillis:5000, options:'-c search_path='+config.schema};
}
async function ownerCheck(pool, config) {
  const result = await pool.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=current_user');
  const row = result.rows[0];
  if (!row || row.name!==config.migration.user || Object.entries(row).some(([key,value])=>key!=='name'&&value)) throw Error('Migration requires the dedicated non-superuser owner');
  const schema = await pool.query('SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1',[config.schema]);
  if(schema.rows[0]?.owner!==config.migration.user) throw Error('Migration schema ownership mismatch');
}
function validate(config) {
  developmentDatabase(config.database); identifier(config.schema); identifier(config.migration.user); identifier(config.runtime.user);
  if (config.migration.user===config.runtime.user) throw Error('Separate migration/runtime identities required');
  if (!['127.0.0.1','localhost','::1'].includes(config.host)) throw Error('This development helper supports loopback databases only');
}
async function initialize(config, adminIdentity) {
  validate(config);
  const admin = new Pool({host:config.host,port:config.port,database:'postgres',...adminIdentity,connectionTimeoutMillis:5000});
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[config.database]);
    const roles = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])',[[config.migration.user,config.runtime.user]]);
    if (existing.rowCount || roles.rowCount) throw Error('Target database or roles already exist; refusing to overwrite or reset');
    const literal = value => "'"+String(value).replace(/'/g,"''")+"'";
    await admin.query('BEGIN');
    try {
      for(const role of [config.migration,config.runtime]) {
        await admin.query(`CREATE ROLE ${identifier(role.user)} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD ${literal(role.password)}`);
      }
      await admin.query('COMMIT');
    } catch(error) {await admin.query('ROLLBACK');throw error;}
    // CREATE DATABASE cannot share the role transaction. A failure is preserved for explicit repair.
    await admin.query(`CREATE DATABASE ${identifier(config.database)} OWNER ${identifier(config.migration.user)} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {await admin.end();}
  const migration = new Pool(options(config,config.migration));
  try {await migration.query(`CREATE SCHEMA ${identifier(config.schema)} AUTHORIZATION ${identifier(config.migration.user)}`);}
  finally {await migration.end();}
}
async function upgrade(config) {
  validate(config);
  const migration = new Pool(options(config,config.migration));
  try {
    await ownerCheck(migration,config);
    return await migrate(migration);
  }finally{await migration.end();}
}
async function provision(config) {
  validate(config);
  const migration = new Pool(options(config,config.migration));
  try {
    await ownerCheck(migration,config);
    const client=await migration.connect();
    try {
      await client.query('BEGIN');
      await provisionRuntime(client,config.schema,config.runtime.user,{isolatedDevelopment:config.isolatedDevelopment});
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }finally{await migration.end();}
}
async function ready(config) {
  validate(config);
  const runtime=new Pool(options(config,config.runtime));
  try {await checkReadiness(runtime,{isolatedDevelopment:config.isolatedDevelopment});}
  finally{await runtime.end();}
}
async function backup(config,file,bin,backupIdentity) {
  validate(config);
  if (!path.isAbsolute(file)||path.extname(file)!=='.dump'||fs.existsSync(file)) throw Error('A new absolute .dump path is required');
  if(!backupIdentity?.user || !backupIdentity?.password)throw Error('Separate backup operator credentials required for FORCE RLS data');
  const pool=new Pool(options(config,backupIdentity));
  try {
    const server=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num);
    const client=execFileSync(path.join(bin,'pg_dump.exe'),['--version'],{encoding:'utf8',windowsHide:true}).match(/PostgreSQL\) (\d+)/);
    if (!client||Number(client[1])!==Math.floor(server/10000)) throw Error('Backup requires matching PostgreSQL client/server major');
  }finally{await pool.end();}
  execFileSync(path.join(bin,'pg_dump.exe'),['--format=custom','--no-owner','--no-privileges','--no-password','--file',file],{
    windowsHide:true,stdio:'pipe',env:{...process.env,PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:backupIdentity.user,PGPASSWORD:backupIdentity.password,PGOPTIONS:'-c search_path='+config.schema},
  });
}
async function restoreTest(config,file,target,bin,adminIdentity) {
  validate(config); developmentDatabase(target);
  if (!target.endsWith('_restore_test')||target===config.database||!path.isAbsolute(file)||!fs.existsSync(file)) throw Error('Separate new restore-test database and existing absolute backup file required');
  const admin=new Pool({host:config.host,port:config.port,database:'postgres',...adminIdentity,connectionTimeoutMillis:5000});
  try {
    if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw Error('Restore target already exists; refusing destructive restore');
    await admin.query(`CREATE DATABASE ${identifier(target)} OWNER ${identifier(config.migration.user)} ENCODING 'UTF8' TEMPLATE template0`);
  }finally{await admin.end();}
  execFileSync(path.join(bin,'pg_restore.exe'),['--exit-on-error','--no-owner','--no-privileges','--no-password','--dbname',target,file],{
    windowsHide:true,stdio:'pipe',env:{...process.env,PGHOST:config.host,PGPORT:String(config.port),PGUSER:adminIdentity.user,PGPASSWORD:adminIdentity.password,PGOPTIONS:'-c search_path='+config.schema},
  });
  const restored={...config,database:target};
  // Restore data with the authorized operator (FORCE RLS), then transfer only the
  // restored application schema's objects. Never use cluster-wide REASSIGN OWNED.
  const owner=new Pool(options(restored,adminIdentity));
  try {
    const relations=await owner.query("SELECT format('ALTER %s %I.%I OWNER TO %I',CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,n.nspname,c.relname,$2::text) AS sql FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m')",[config.schema,config.migration.user]);
    for(const row of relations.rows)await owner.query(row.sql);
    const sequences=await owner.query("SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I',n.nspname,c.relname,$2::text) AS sql FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='S' AND c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=$2)",[config.schema,config.migration.user]);
    for(const row of sequences.rows)await owner.query(row.sql);
    const functions=await owner.query("SELECT format('ALTER FUNCTION %I.%I(%s) OWNER TO %I',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),$2::text) AS sql FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind='f'",[config.schema,config.migration.user]);
    for(const row of functions.rows)await owner.query(row.sql);
    await owner.query(`ALTER SCHEMA ${identifier(config.schema)} OWNER TO ${identifier(config.migration.user)}`);
  }finally{await owner.end();}
  // Verify existing checksums without changing restored data, then restore restricted grants.
  const pool=new Pool(options(restored,restored.migration));
  try {
    const {expectedMigrations}=require('../../backend/src/readiness');
    const actual=(await pool.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
    if(JSON.stringify(actual)!==JSON.stringify(expectedMigrations()))throw Error('Restored migration checksums differ');
  }finally{await pool.end();}
  await provision(restored); await ready(restored);
}
module.exports={initialize,upgrade,provision,ready,backup,restoreTest};
if(require.main===module){
  const env=process.env;
  const config={host:env.PGHOST||'127.0.0.1',port:Number(env.PGPORT||5432),database:env.PGDATABASE,schema:env.RITIM_DB_SCHEMA||'ritim',isolatedDevelopment:env.RITIM_ISOLATED_DEVELOPMENT==='true',migration:{user:env.RITIM_MIGRATION_USER,password:env.RITIM_MIGRATION_PASSWORD},runtime:{user:env.RITIM_RUNTIME_USER,password:env.RITIM_RUNTIME_PASSWORD}};
  const admin={user:env.RITIM_ADMIN_USER,password:env.RITIM_ADMIN_PASSWORD};
  const bin=env.RITIM_PG_BIN||path.join(env.ProgramFiles||'C:/Program Files','PostgreSQL/18/bin');
  const actions={Initialize:()=>initialize(config,admin),Migrate:()=>upgrade(config),Provision:()=>provision(config),Ready:()=>ready(config),Backup:()=>backup(config,env.RITIM_BACKUP_FILE,bin,admin),RestoreTest:()=>restoreTest(config,env.RITIM_BACKUP_FILE,env.RITIM_RESTORE_DATABASE,bin,admin)};
  Promise.resolve().then(()=>{if(!actions[env.RITIM_DATABASE_ACTION])throw Error('Unknown database action');return actions[env.RITIM_DATABASE_ACTION]();}).then(()=>console.log('Database operation completed: '+env.RITIM_DATABASE_ACTION)).catch(error=>{
    // Never print driver messages containing connection details or SQL/passwords.
    console.error('Database operation failed'+(error.code?' ('+error.code+')':'')+'. Target is preserved; check configuration and private database diagnostics.');process.exitCode=1;
  });
}
