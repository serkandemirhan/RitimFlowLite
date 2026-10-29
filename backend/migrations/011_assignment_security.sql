-- The caller already has authorized transaction scope. Lock the target membership
-- without granting runtime direct read/update privileges on authorization tables.
CREATE FUNCTION ritim_lock_active_operator(p_tenant uuid,p_site uuid,p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF NOT COALESCE(ritim_scope_matches(p_tenant,p_site),false) THEN RETURN false; END IF;
 PERFORM 1 FROM users WHERE id=p_user AND disabled_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM site_memberships WHERE tenant_id=p_tenant AND site_id=p_site AND user_id=p_user AND role='operator' AND revoked_at IS NULL FOR SHARE;
 RETURN FOUND;
END $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_lock_active_operator(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_lock_active_operator(uuid,uuid,uuid) FROM PUBLIC;
