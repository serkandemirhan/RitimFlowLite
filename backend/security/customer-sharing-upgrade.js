'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {checksums}=require('../src/migration-checksum');
function upgradeSql({schema='ritim',runtime='ritim_runtime'}={}){
 for(const value of [schema,runtime])if(!/^[a-z_][a-z0-9_]{0,62}$/.test(value))throw Error('Invalid identifier');
 const dir=path.join(__dirname,'../migrations'),files=fs.readdirSync(dir).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<78).sort();
 if(files.length!==76||files.some(f=>f.startsWith('075_')))throw Error('Expected deployed 001-074, 076 and 077 history');
 const expected=files.map(f=>`('${f.slice(0,3)}',ARRAY[${checksums(fs.readFileSync(path.join(dir,f),'utf8')).map(h=>`'${h}'`).join(',')}]::text[])`).join(',\n');
 const sql=fs.readFileSync(path.join(dir,'078_customer_sharing_defaults.sql'),'utf8').replace(/\r\n/g,'\n'),hash=crypto.createHash('sha256').update(sql).digest('hex');
 return `-- Additive release 078. Run as the existing schema owner after a backup.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO "${schema}",pg_catalog;
DO $upgrade$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='${schema}' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN RAISE EXCEPTION 'Run as existing schema owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${runtime}' AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='${runtime}')) THEN RAISE EXCEPTION 'Restricted runtime role required'; END IF;
 IF (SELECT count(*) FROM schema_migrations WHERE version<>'078')<>76 OR EXISTS(SELECT 1 FROM (VALUES ${expected}) e(version,hashes) LEFT JOIN schema_migrations m USING(version) WHERE m.version IS NULL OR NOT m.checksum=ANY(e.hashes)) THEN RAISE EXCEPTION 'Expected unchanged 001-074, 076 and 077 history'; END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='078') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='078' AND checksum IN (${checksums(sql).map(h=>`'${h}'`).join(',')})) THEN RAISE EXCEPTION 'Migration 078 checksum mismatch'; END IF;
 ELSE
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('078','${hash}');
 END IF;
END $upgrade$;
REVOKE ALL ON portal_customer_settings FROM PUBLIC,"${runtime}";
REVOKE ALL ON FUNCTION ritim_portal_order_list_filtered(uuid),ritim_portal_sync(uuid),ritim_portal_access_v2(uuid,uuid),ritim_portal_order_list_v2(uuid),ritim_portal_manage_v2(text,jsonb) FROM PUBLIC,"${runtime}";
GRANT EXECUTE ON FUNCTION ritim_portal_settings(text,jsonb),ritim_portal_access(uuid,uuid),ritim_portal_order_list(uuid),ritim_portal_manage(text,jsonb) TO "${runtime}";
COMMIT;
SELECT version FROM "${schema}".schema_migrations WHERE version='078';
`;
}
module.exports={upgradeSql};
