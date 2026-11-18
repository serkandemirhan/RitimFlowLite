-- Stable, public workspace codes are independent of company names and user identities.
CREATE TABLE workspace_codes (tenant_id uuid PRIMARY KEY REFERENCES tenants(id), code text NOT NULL UNIQUE CHECK(code ~ '^[a-z0-9][a-z0-9-]{2,39}$'));
INSERT INTO workspace_codes(tenant_id,code) SELECT id,'flow-'||replace(id::text,'-','') FROM tenants;
REVOKE ALL ON workspace_codes FROM PUBLIC;
CREATE FUNCTION ritim_workspace_code(p_actor uuid,p_tenant uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO workspace_codes(tenant_id,code) VALUES(p_tenant,'flow-'||replace(p_tenant::text,'-','')) ON CONFLICT(tenant_id) DO NOTHING;
 SELECT code INTO v FROM workspace_codes WHERE tenant_id=p_tenant; RETURN v;
END $$;
CREATE FUNCTION ritim_workspace_login(p_workspace text,p_username text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT jsonb_build_object('subject',u.subject,'existingIdentity',m.existing_identity)
 FROM workspace_codes w JOIN managed_usernames m ON m.tenant_id=w.tenant_id JOIN users u ON u.id=m.user_id
 WHERE w.code=lower(trim(p_workspace)) AND m.username=lower(trim(p_username)) AND u.disabled_at IS NULL
 AND (EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=w.tenant_id AND tm.user_id=u.id AND tm.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM site_memberships sm WHERE sm.tenant_id=w.tenant_id AND sm.user_id=u.id AND sm.revoked_at IS NULL))
$$;
CREATE FUNCTION ritim_platform_records(p_actor uuid,p_tenant uuid,p_kind text,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 IF p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'Invalid offset' USING ERRCODE='22023'; END IF;
 IF p_kind='orders' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT order_number AS number,customer,part_number AS part,ordered_qty AS quantity,status FROM orders WHERE tenant_id=p_tenant ORDER BY created_at DESC,id LIMIT 51 OFFSET p_offset) q;
 ELSIF p_kind='production' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT number,quantity,planning_state AS status FROM production_orders WHERE tenant_id=p_tenant ORDER BY created_at DESC,id LIMIT 51 OFFSET p_offset) q;
 ELSIF p_kind='jobs' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT work_order_number AS number,planned_qty AS quantity,status FROM work_orders WHERE tenant_id=p_tenant ORDER BY work_order_number,id LIMIT 51 OFFSET p_offset) q;
 ELSE RAISE EXCEPTION 'Invalid section' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_workspace_code(uuid,uuid) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_workspace_login(text,text) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_platform_records(uuid,uuid,text,integer) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_workspace_code(uuid,uuid),ritim_workspace_login(text,text),ritim_platform_records(uuid,uuid,text,integer) FROM PUBLIC;
