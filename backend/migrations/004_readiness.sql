-- Runtime may verify migration checksums without direct access to migration history.
CREATE FUNCTION ritim_schema_versions() RETURNS TABLE(version text,checksum text)
LANGUAGE sql SECURITY DEFINER AS $$ SELECT m.version,m.checksum FROM schema_migrations m ORDER BY m.version $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_schema_versions() SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_schema_versions() FROM PUBLIC;
