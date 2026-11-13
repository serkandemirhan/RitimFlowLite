'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'backend/migrations/069_operator_work_permissions.sql'),'utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex');
const body=`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO ritim,pg_catalog;
DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='069') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='069' AND checksum='${checksum}') THEN RAISE EXCEPTION 'Migration 069 checksum mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='068') THEN RAISE EXCEPTION 'Expected schema 068'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('069','${checksum}');
 END IF;
END $upgrade$;
GRANT EXECUTE ON FUNCTION ritim.ritim_operator_permissions(text,jsonb) TO ritim_runtime;
COMMIT;
SELECT version FROM ritim.schema_migrations WHERE version='069';
`;
fs.mkdirSync(path.join(root,'artifacts/cloud-setup'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/cloud-setup/supabase-upgrade-069.sql'),body);
console.log('Prepared operator permission migration 069; no cloud execution.');
