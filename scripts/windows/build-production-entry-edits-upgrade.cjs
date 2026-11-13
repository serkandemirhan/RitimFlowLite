'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'backend/migrations/066_production_entry_edits.sql'),'utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex');
const body=`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO ritim,pg_catalog;
DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='066') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='066' AND checksum='${checksum}') THEN RAISE EXCEPTION 'Migration 066 checksum mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='065') THEN RAISE EXCEPTION 'Expected schema 065'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('066','${checksum}');
 END IF;
END $upgrade$;
COMMIT;
SELECT version FROM ritim.schema_migrations WHERE version='066';
`;
fs.writeFileSync(path.join(root,'artifacts/cloud-setup/supabase-upgrade-066.sql'),body);
console.log('Prepared production entry edit migration 066; no cloud execution.');
