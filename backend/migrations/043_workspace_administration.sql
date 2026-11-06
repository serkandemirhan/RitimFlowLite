-- Narrow administration boundary: runtime never receives raw identity-table writes.
ALTER TABLE tenants ADD COLUMN admin_version integer NOT NULL DEFAULT 1;
CREATE FUNCTION ritim_admin_workspace(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 v integer; target uuid; destination uuid; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND disabled_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Administration forbidden' USING ERRCODE='42501'; END IF;
 IF p_action <> 'read' THEN
  SELECT admin_version INTO v FROM tenants WHERE id=t FOR UPDATE;
  IF v IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('conflict',true); END IF;
  IF p_action='company' THEN
   UPDATE tenants SET name=p_data->>'name' WHERE id=t;
  ELSIF p_action='site' THEN
   destination:=(p_data->>'id')::uuid;
   IF p_data->>'create'='true' THEN
    INSERT INTO sites(tenant_id,id,code,name) VALUES(t,destination,p_data->>'code',p_data->>'name');
   ELSE
    UPDATE sites SET code=p_data->>'code',name=p_data->>'name' WHERE tenant_id=t AND id=destination;
    IF NOT FOUND THEN RAISE EXCEPTION 'Site unavailable' USING ERRCODE='42501'; END IF;
   END IF;
  ELSIF p_action='member' THEN
   target:=(p_data->>'userId')::uuid; destination:=(p_data->>'siteId')::uuid;
   IF target=actor OR EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND user_id=target)
   OR NOT EXISTS(SELECT 1 FROM sites WHERE tenant_id=t AND id=destination)
   OR NOT EXISTS(SELECT 1 FROM users WHERE id=target AND disabled_at IS NULL)
   THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='42501'; END IF;
   IF p_data->>'role' NOT IN ('manager','planner','operator','quality','logistics','viewer','none') OR p_data->>'role' IS NULL
   THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='22023'; END IF;
   UPDATE site_memberships SET revoked_at=now() WHERE tenant_id=t AND site_id=destination AND user_id=target AND revoked_at IS NULL;
   IF p_data->>'role'<>'none' THEN
    INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES(t,destination,target,p_data->>'role')
    ON CONFLICT(tenant_id,site_id,user_id,role) DO UPDATE SET revoked_at=NULL;
   END IF;
  ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
  UPDATE tenants SET admin_version=admin_version+1 WHERE id=t;
 END IF;
 SELECT jsonb_build_object('id',t,'name',name,'version',admin_version,
 'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code) ORDER BY s.name),'[]') FROM sites s WHERE s.tenant_id=t),
 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'disabled',u.disabled_at IS NOT NULL,
 'admin',EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t AND tm.user_id=u.id AND tm.revoked_at IS NULL),
 'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('siteId',m.site_id,'role',m.role)),'[]') FROM site_memberships m WHERE m.tenant_id=t AND m.user_id=u.id AND m.revoked_at IS NULL)) ORDER BY u.display_name),'[]')
 FROM users u WHERE EXISTS(SELECT 1 FROM site_memberships m WHERE m.tenant_id=t AND m.user_id=u.id)
 OR EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t AND tm.user_id=u.id AND tm.revoked_at IS NULL))) INTO result FROM tenants WHERE id=t;
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_admin_workspace(text,jsonb) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_admin_workspace(text,jsonb) FROM PUBLIC;
