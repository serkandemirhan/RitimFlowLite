-- Usernames are globally unique; passwords stay exclusively in the identity provider.
CREATE TABLE managed_usernames (
 username text PRIMARY KEY CHECK(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON managed_usernames FROM PUBLIC;

CREATE FUNCTION ritim_username_identity(p_username text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT u.subject FROM managed_usernames m JOIN users u ON u.id=m.user_id
 WHERE m.username=lower(p_username) AND u.disabled_at IS NULL
$$;

CREATE FUNCTION ritim_managed_users(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 target uuid; destination uuid; v integer; result jsonb; actor_issuer text;
BEGIN
 SELECT issuer INTO actor_issuer FROM users WHERE id=actor AND disabled_at IS NULL;
 IF actor_issuer IS NULL OR NOT EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Administration forbidden' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  SELECT coalesce(jsonb_object_agg(user_id::text,username),'{}') INTO result FROM managed_usernames WHERE tenant_id=t;
  RETURN result;
 END IF;
 SELECT admin_version INTO v FROM tenants WHERE id=t FOR UPDATE;
 IF v IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('conflict',true); END IF;
 target:=(p_data->>'userId')::uuid;
 IF p_action='create' THEN
  destination:=(p_data->>'siteId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM sites WHERE tenant_id=t AND id=destination)
  THEN RAISE EXCEPTION 'Site unavailable' USING ERRCODE='42501'; END IF;
  IF p_data->>'role' IS NULL OR p_data->>'role' NOT IN ('manager','planner','operator','quality','logistics','viewer')
   OR p_data->>'username' IS NULL OR p_data->>'username' !~ '^[a-z0-9][a-z0-9._-]{2,39}$'
   OR length(trim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 120
  THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE='22023'; END IF;
  INSERT INTO users(id,issuer,subject,display_name) VALUES(target,actor_issuer,target::text,trim(p_data->>'name'));
  INSERT INTO managed_usernames(username,tenant_id,user_id) VALUES(p_data->>'username',t,target);
  INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES(t,destination,target,p_data->>'role');
 ELSIF p_action IN ('suspend','activate') THEN
  IF target=actor
   OR NOT EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND user_id=target)
   OR EXISTS(SELECT 1 FROM tenant_memberships WHERE user_id=target AND revoked_at IS NULL)
   OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id<>t AND user_id=target AND revoked_at IS NULL)
   OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=target AND revoked_at IS NULL)
  THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  UPDATE users SET disabled_at=CASE WHEN p_action='suspend' THEN now() ELSE NULL END WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 UPDATE tenants SET admin_version=admin_version+1 WHERE id=t;
 RETURN jsonb_build_object('userId',target,'username',p_data->>'username','disabled',p_action='suspend');
END $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_username_identity(text) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_managed_users(text,jsonb) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_username_identity(text),ritim_managed_users(text,jsonb) FROM PUBLIC;
