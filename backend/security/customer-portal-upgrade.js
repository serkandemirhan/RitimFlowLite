'use strict';
// Additive, owner-executed release from the deployed 074 platform to portal 076.
// Deliberately excludes the unpublished 075 hybrid pilot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {checksums}=require('../src/migration-checksum');
function upgradeSql({schema='ritim',runtime='ritim_runtime'}={}){
 for(const value of [schema,runtime])if(!/^[a-z_][a-z0-9_]{0,62}$/.test(value))throw Error('Invalid identifier');
 const dir=path.join(__dirname,'../migrations');
 const files=fs.readdirSync(dir).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=74).sort();
 if(files.length!==74)throw Error('Expected complete platform migration history through 074');
 const versions=files.map(f=>{const hashes=checksums(fs.readFileSync(path.join(dir,f),'utf8'));return `('${f.slice(0,3)}',ARRAY[${hashes.map(h=>`'${h}'`).join(',')}]::text[])`;}).join(',\n');
 const sql=fs.readFileSync(path.join(dir,'076_customer_portal.sql'),'utf8');
 const hash=crypto.createHash('sha256').update(sql).digest('hex');
 const accepted=checksums(sql).map(h=>`'${h}'`).join(',');
 return `-- Back up the target first. Execute as the existing schema owner.
-- No business records, existing grants or identities are changed.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));
SET LOCAL search_path TO "${schema}",pg_catalog;
DO $preflight$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='${schema}' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN RAISE EXCEPTION 'Run as the existing schema owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${runtime}' AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='${runtime}')) THEN RAISE EXCEPTION 'Restricted runtime role required'; END IF;
 IF (SELECT count(*) FROM schema_migrations WHERE version<>'076')<>74 OR EXISTS(SELECT 1 FROM (VALUES ${versions}) e(version,hashes) LEFT JOIN schema_migrations m USING(version) WHERE m.version IS NULL OR NOT m.checksum=ANY(e.hashes)) THEN RAISE EXCEPTION 'Expected unchanged platform history 001-074'; END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='076') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='076' AND checksum IN (${accepted})) THEN RAISE EXCEPTION 'Migration 076 checksum mismatch'; END IF;
 ELSE
  EXECUTE $portal$${sql}$portal$;
  INSERT INTO schema_migrations(version,checksum) VALUES('076','${hash}');
 END IF;
END $preflight$;
REVOKE ALL ON customer_portal_shares FROM PUBLIC,"${runtime}";
GRANT USAGE ON SCHEMA "${schema}" TO "${runtime}";
GRANT EXECUTE ON FUNCTION ritim_portal_order_list(uuid),ritim_portal_access(uuid,uuid),ritim_portal_share_ids(uuid),ritim_portal_manage(text,jsonb) TO "${runtime}";
COMMIT;
SELECT version FROM "${schema}".schema_migrations WHERE version='076';
`;
}
module.exports={upgradeSql};
