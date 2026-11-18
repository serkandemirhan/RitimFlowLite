-- Only platform administrators may change a firm's unique login code.
CREATE FUNCTION ritim_change_workspace_code(p_actor uuid,p_tenant uuid,p_expected text,p_code text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE previous_code text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code !~ '^[a-z0-9][a-z0-9-]{2,39}$' OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
 THEN RAISE EXCEPTION 'Invalid workspace code or reason' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO workspace_codes(tenant_id,code) VALUES(p_tenant,'flow-'||replace(p_tenant::text,'-','')) ON CONFLICT(tenant_id) DO NOTHING;
 SELECT code INTO previous_code FROM workspace_codes WHERE tenant_id=p_tenant FOR UPDATE;
 IF previous_code IS DISTINCT FROM p_expected THEN RETURN jsonb_build_object('conflict',true); END IF;
 IF previous_code=p_code THEN RETURN jsonb_build_object('code',p_code,'changed',false); END IF;
 UPDATE workspace_codes SET code=p_code WHERE tenant_id=p_tenant;
 INSERT INTO platform_management_events(actor_id,tenant_id,action,reason,previous,current_value)
 VALUES(p_actor,p_tenant,'workspace.code_changed',trim(p_reason),jsonb_build_object('code',previous_code),jsonb_build_object('code',p_code));
 RETURN jsonb_build_object('code',p_code,'changed',true);
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_change_workspace_code(uuid,uuid,text,text,text) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_change_workspace_code(uuid,uuid,text,text,text) FROM PUBLIC;
