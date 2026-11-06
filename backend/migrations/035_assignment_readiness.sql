-- Read the current assignment's eligibility without exposing the operator roster.
-- Every caller must already hold an authorized tenant/site transaction scope.
CREATE FUNCTION ritim_assigned_operator(p_tenant uuid,p_site uuid,p_work uuid)
RETURNS TABLE(user_id uuid,display_name text,active boolean)
LANGUAGE sql SECURITY DEFINER AS $$
 SELECT a.user_id,u.display_name,
   (u.disabled_at IS NULL AND EXISTS(SELECT 1 FROM site_memberships m
     WHERE m.tenant_id=p_tenant AND m.site_id=p_site AND m.user_id=a.user_id
       AND m.role='operator' AND m.revoked_at IS NULL))
 FROM work_assignments a JOIN users u ON u.id=a.user_id
 WHERE ritim_scope_matches(p_tenant,p_site)
   AND a.tenant_id=p_tenant AND a.site_id=p_site
   AND a.work_order_id=p_work AND a.released_at IS NULL
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_assigned_operator(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_assigned_operator(uuid,uuid,uuid) FROM PUBLIC;
