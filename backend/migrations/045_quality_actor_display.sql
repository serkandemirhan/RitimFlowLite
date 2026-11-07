-- Expose only the display name attached to a decision in the active scope.
CREATE FUNCTION ritim_quality_actor_name(p_tenant uuid,p_site uuid,p_decision uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT u.display_name FROM output_dispositions d JOIN users u ON u.id=d.actor_id
 WHERE ritim_scope_matches(p_tenant,p_site)
 AND d.tenant_id=p_tenant AND d.site_id=p_site AND d.id=p_decision
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_quality_actor_name(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_quality_actor_name(uuid,uuid,uuid) FROM PUBLIC;
