'use strict';
// Fresh installation only: refuses an existing schema or runtime role. No credentials in SQL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {provisionRuntime}=require('../backend/security/provision-runtime');
(async()=>{
 const schema='ritim',role='ritim_runtime';
 const statements=[`BEGIN; SELECT pg_advisory_xact_lock(hashtext('ritim-cloud-bootstrap')); CREATE SCHEMA ${schema}; REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC; CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION; SET LOCAL search_path TO ${schema},pg_catalog; CREATE TABLE schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());`];
 const dir=path.resolve('backend/migrations');
 for(const file of fs.readdirSync(dir).filter(x=>/^\d+_[a-z0-9_]+\.sql$/.test(x)).sort()){const sql=fs.readFileSync(path.join(dir,file),'utf8'),hash=crypto.createHash('sha256').update(sql).digest('hex');statements.push(sql,`INSERT INTO schema_migrations(version,checksum) VALUES ('${file.split('_')[0]}','${hash}');`)}
 await provisionRuntime({query:async sql=>{if(sql.startsWith('SELECT rolsuper'))return {rowCount:1,rows:[{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolinherit:false}]};if(sql.startsWith('SELECT'))return {rowCount:0,rows:[]};statements.push(sql+';');return {rowCount:0,rows:[]}}},schema,role,{isolatedDevelopment:true});
 statements.push(`ALTER ROLE ${role} SET search_path TO ${schema},pg_catalog; COMMIT; SELECT count(*) AS migration_count FROM ${schema}.schema_migrations;`);
 const out=path.resolve('artifacts/cloud-setup');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'supabase-bootstrap.sql'),statements.join('\n'));console.log('Fresh-install SQL created; runtime role has NOLOGIN until a password is provisioned.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
