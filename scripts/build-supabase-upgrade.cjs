'use strict';
// Controlled, repeatable upgrade of the existing cloud schema. Contains no secrets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {provisionRuntime}=require('../backend/security/provision-runtime');
(async()=>{
 const sql=fs.readFileSync('backend/migrations/046_production_corrections.sql','utf8'),hash=crypto.createHash('sha256').update(sql).digest('hex');
 const statements=[`BEGIN;
 SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
 SET LOCAL search_path TO ritim,pg_catalog;
 DO $upgrade$
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ritim_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)) THEN RAISE EXCEPTION 'Unsafe or missing runtime role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='ritim_runtime')) THEN RAISE EXCEPTION 'Runtime memberships forbidden'; END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='046') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='046' AND checksum='${hash}') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
 ELSE
  IF (SELECT count(*) FROM schema_migrations)<>45 OR NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='045') THEN RAISE EXCEPTION 'Expected migration 045'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('046','${hash}');
 END IF;
 END $upgrade$;`];
 await provisionRuntime({query:async sql=>{if(sql.startsWith('SELECT rolsuper'))return {rowCount:1,rows:[{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolinherit:false}]};if(sql.startsWith('SELECT'))return {rowCount:0,rows:[]};statements.push(sql+';');return {rowCount:0,rows:[]};}},'ritim','ritim_runtime',{isolatedDevelopment:true});
 statements.push("COMMIT; SELECT version,applied_at FROM ritim.schema_migrations WHERE version='046';");
 const output=path.resolve('artifacts/cloud-setup/supabase-upgrade-046.sql');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,statements.join('\n'));console.log('Cloud upgrade SQL prepared without credentials.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
