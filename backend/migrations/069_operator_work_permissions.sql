-- Permission data is private; access is exclusively through the checked function.
CREATE TABLE operator_work_permissions (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),
 level text NOT NULL CHECK(level IN ('standard','machine','claim')),
 PRIMARY KEY(tenant_id,site_id,user_id),FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
REVOKE ALL ON operator_work_permissions FROM PUBLIC;
CREATE FUNCTION ritim_operator_permissions(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 s uuid:=nullif(current_setting('ritim.site',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 destination uuid; target uuid; v integer; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND disabled_at IS NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_action='self' THEN
  IF NOT EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND site_id=s AND user_id=actor AND role='operator' AND revoked_at IS NULL) THEN RETURN '"standard"'::jsonb; END IF;
  SELECT to_jsonb(level) INTO result FROM operator_work_permissions WHERE tenant_id=t AND site_id=s AND user_id=actor FOR SHARE;
  RETURN coalesce(result,'"standard"'::jsonb);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Administration forbidden' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  SELECT coalesce(jsonb_object_agg(site_id::text||':'||user_id::text,level),'{}') INTO result FROM operator_work_permissions WHERE tenant_id=t;
  RETURN result;
 END IF;
 IF p_action<>'save' OR p_data->>'level' IS NULL OR p_data->>'level' NOT IN ('standard','machine','claim') THEN RAISE EXCEPTION 'Invalid level' USING ERRCODE='22023'; END IF;
 SELECT admin_version INTO v FROM tenants WHERE id=t FOR UPDATE;
 IF v IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('conflict',true); END IF;
 destination:=(p_data->>'siteId')::uuid;target:=(p_data->>'userId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM site_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=t AND m.site_id=destination AND m.user_id=target AND m.role='operator' AND m.revoked_at IS NULL AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'Operator unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO operator_work_permissions(tenant_id,site_id,user_id,level) VALUES(t,destination,target,p_data->>'level')
 ON CONFLICT(tenant_id,site_id,user_id) DO UPDATE SET level=EXCLUDED.level;
 UPDATE tenants SET admin_version=admin_version+1 WHERE id=t;
 RETURN jsonb_build_object('userId',target,'siteId',destination,'level',p_data->>'level');
END $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_operator_permissions(text,jsonb) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_operator_permissions(text,jsonb) FROM PUBLIC;
