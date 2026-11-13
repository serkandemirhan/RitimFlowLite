'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'backend/migrations/068_order_lifecycle.sql'),'utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex');
fs.writeFileSync(path.join(root,'artifacts/cloud-setup/supabase-upgrade-068.sql'),`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO ritim,pg_catalog;
DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='068') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='068' AND checksum='${checksum}') THEN RAISE EXCEPTION 'Migration 068 checksum mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='067') THEN RAISE EXCEPTION 'Expected schema 067'; END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('068','${checksum}');
 END IF;
END $upgrade$;
GRANT SELECT,INSERT ON ritim.production_order_replacements,ritim.order_quantity_closures TO ritim_runtime;
GRANT UPDATE(removed_at) ON ritim.order_items TO ritim_runtime;
COMMIT;
SELECT version FROM ritim.schema_migrations WHERE version='068';
`);
console.log('Prepared order lifecycle migration 068; no cloud execution.');
