-- B03A: the application is trusted to verify identities. RLS is defense in depth,
-- not a boundary against an attacker able to execute arbitrary SQL as the runtime role.
CREATE FUNCTION ritim_identity(p_issuer text,p_subject text)
RETURNS TABLE(id uuid,issuer text,subject text,display_name text)
LANGUAGE sql SECURITY DEFINER AS $$
 SELECT u.id,u.issuer,u.subject,u.display_name FROM users u
 WHERE u.issuer=p_issuer AND u.subject=p_subject AND u.disabled_at IS NULL
$$;
CREATE FUNCTION ritim_memberships(p_user uuid)
RETURNS TABLE(tenant_id uuid,tenant_name text,site_id uuid,site_name text,site_roles text[],tenant_admin boolean,superadmin boolean)
LANGUAGE sql SECURITY DEFINER AS $$
 SELECT t.id,t.name,s.id,s.name,
 COALESCE(array_agg(DISTINCT m.role) FILTER (WHERE m.role IS NOT NULL),'{}'),
 EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t.id AND tm.user_id=p_user AND tm.role='tenant_admin' AND tm.revoked_at IS NULL),
 EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=p_user AND pa.revoked_at IS NULL)
 FROM users u JOIN sites s ON true JOIN tenants t ON t.id=s.tenant_id
 LEFT JOIN site_memberships m ON m.tenant_id=t.id AND m.site_id=s.id AND m.user_id=u.id AND m.revoked_at IS NULL
 WHERE u.id=p_user AND u.disabled_at IS NULL AND (m.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t.id AND tm.user_id=u.id AND tm.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.revoked_at IS NULL))
 GROUP BY t.id,t.name,s.id,s.name ORDER BY t.id,s.id
$$;
-- Acquires row locks while running under the owner; runtime needs no UPDATE on grants.
CREATE FUNCTION ritim_open_scope(p_user uuid,p_tenant uuid,p_site uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE roles text[] := '{}'; r record;
BEGIN
 IF current_setting('ritim.tenant',true) IS NOT NULL AND current_setting('ritim.tenant',true) <> '' THEN
  RAISE EXCEPTION 'scope already set' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM users u WHERE u.id=p_user AND u.disabled_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM sites s WHERE s.tenant_id=p_tenant AND s.id=p_site FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM platform_admins pa WHERE pa.user_id=p_user AND pa.revoked_at IS NULL FOR SHARE;
 IF FOUND THEN roles:=array_append(roles,'superadmin'); END IF;
 FOR r IN SELECT tm.role FROM tenant_memberships tm WHERE tm.tenant_id=p_tenant AND tm.user_id=p_user AND tm.revoked_at IS NULL FOR SHARE LOOP roles:=array_append(roles,r.role); END LOOP;
 FOR r IN SELECT m.role FROM site_memberships m WHERE m.tenant_id=p_tenant AND m.site_id=p_site AND m.user_id=p_user AND m.revoked_at IS NULL ORDER BY m.role FOR SHARE LOOP roles:=array_append(roles,r.role); END LOOP;
 IF cardinality(roles)=0 THEN RETURN NULL; END IF;
 PERFORM set_config('ritim.tenant',p_tenant::text,true),set_config('ritim.site',p_site::text,true),set_config('ritim.actor',p_user::text,true);
 RETURN roles;
END $$;
-- Missing and malformed context must evaluate false without throwing.
CREATE FUNCTION ritim_scope_matches(p_tenant uuid,p_site uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT p_tenant::text = current_setting('ritim.tenant',true) AND p_site::text = current_setting('ritim.site',true) $$;
DO $$
DECLARE n text; sch text:=current_schema();
BEGIN
 FOREACH n IN ARRAY ARRAY['orders','operations','machines','work_orders','work_assignments','lots','material_receipts','reservations','physical_transfers','transfer_events','production_events','quality_decisions','rework_tasks','external_dispatches','external_returns','shipments','customer_returns','stock_movements','drawing_revisions','idempotency_records','audit_events','compensations'] LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',sch,n);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',sch,n);
  EXECUTE format('CREATE POLICY ritim_scope ON %I.%I USING (%I.ritim_scope_matches(tenant_id,site_id)) WITH CHECK (%I.ritim_scope_matches(tenant_id,site_id))',sch,n,sch,sch);
 END LOOP;
 -- Only trusted objects are resolved; pg_temp must be last.
 EXECUTE format('ALTER FUNCTION %I.ritim_identity(text,text) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_memberships(uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_open_scope(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_scope_matches(uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_identity(text,text),ritim_memberships(uuid),ritim_open_scope(uuid,uuid,uuid),ritim_scope_matches(uuid,uuid) FROM PUBLIC;
CREATE POLICY ritim_actor ON idempotency_records AS RESTRICTIVE
 USING (actor_id::text=current_setting('ritim.actor',true))
 WITH CHECK (actor_id::text=current_setting('ritim.actor',true));
