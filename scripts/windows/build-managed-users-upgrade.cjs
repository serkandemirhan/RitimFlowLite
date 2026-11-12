'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'backend/migrations/064_managed_users.sql'),'utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex');
const body=`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO ritim,pg_catalog;
DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='064') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='064' AND checksum='${checksum}') THEN RAISE EXCEPTION 'Migration 064 checksum mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='063') THEN RAISE EXCEPTION 'Expected schema 063'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('064','${checksum}');
 END IF;
END $upgrade$;
GRANT EXECUTE ON FUNCTION ritim.ritim_username_identity(text),ritim.ritim_managed_users(text,jsonb) TO ritim_runtime;
COMMIT;
SELECT version FROM ritim.schema_migrations WHERE version='064';
`;
fs.mkdirSync(path.join(root,'artifacts/cloud-setup'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/cloud-setup/supabase-upgrade-064.sql'),body);console.log('Prepared managed users migration 064.');
