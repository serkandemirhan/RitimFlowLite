'use strict';
// Prepare an atomic, repeatable upgrade from 046; optional target argument.
const fs=require('node:fs'),path=require('node:path');
const {checksums}=require('../backend/src/migration-checksum');
const {provisionRuntime}=require('../backend/security/provision-runtime');
(async()=>{
 // Current runtime grants depend on all objects through 056.
 const target=Number(process.argv[2]||56);
 if(target!==56)throw Error('Current runtime provisioning requires target 56');
 const statements=["BEGIN; SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1')); SET LOCAL search_path TO ritim,pg_catalog;"];
 for(let n=47;n<=target;n++){
  const version=String(n).padStart(3,'0');
  const file=fs.readdirSync('backend/migrations').find(f=>f.startsWith(version+'_'));
  const sql=fs.readFileSync(path.join('backend/migrations',file),'utf8').replace(/\r\n/g,'\n');
  const hashes=checksums(sql);
  statements.push(`DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='${version}') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='${version}' AND checksum IN (${hashes.map(h=>"'"+h+"'").join(',')})) THEN RAISE EXCEPTION 'Migration ${version} checksum mismatch'; END IF;
 ELSE
  IF (SELECT count(*) FROM schema_migrations)<>${n-1} OR NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='${String(n-1).padStart(3,'0')}') THEN RAISE EXCEPTION 'Unexpected migration baseline for ${version}'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('${version}','${hashes[0]}');
 END IF;
 END $upgrade$;`);
 }
 await provisionRuntime({query:async sql=>{if(sql.startsWith('SELECT rolsuper'))return {rowCount:1,rows:[{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolinherit:false}]};if(sql.startsWith('SELECT'))return {rowCount:0,rows:[]};statements.push(sql+';');return {rowCount:0,rows:[]};}},'ritim','ritim_runtime',{isolatedDevelopment:true});
 statements.push("COMMIT; SELECT version,applied_at FROM ritim.schema_migrations ORDER BY version;");
 const output='artifacts/cloud-setup/supabase-upgrade-'+String(target).padStart(3,'0')+'.sql';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,statements.join('\n'));console.log(output);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
