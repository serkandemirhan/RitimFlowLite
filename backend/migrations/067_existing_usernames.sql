-- Add a login alias without replacing the identity, password or historical actor.
ALTER TABLE managed_usernames ADD COLUMN existing_identity boolean NOT NULL DEFAULT false;

CREATE FUNCTION ritim_username_login(p_username text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT jsonb_build_object('subject',u.subject,'existingIdentity',m.existing_identity)
 FROM managed_usernames m JOIN users u ON u.id=m.user_id
 WHERE m.username=lower(p_username) AND u.disabled_at IS NULL
$$;

CREATE FUNCTION ritim_assign_username(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 target uuid:=(p_data->>'userId')::uuid;
 actor_issuer text; target_issuer text; v integer;
BEGIN
 SELECT issuer INTO actor_issuer FROM users WHERE id=actor AND disabled_at IS NULL;
 IF actor_issuer IS NULL OR NOT EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Administration forbidden' USING ERRCODE='42501'; END IF;
 SELECT admin_version INTO v FROM tenants WHERE id=t FOR UPDATE;
 IF v IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('conflict',true); END IF;
 SELECT issuer INTO target_issuer FROM users WHERE id=target FOR UPDATE;
 IF target=actor OR target_issuer IS DISTINCT FROM actor_issuer
  OR NOT EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND user_id=target)
  OR EXISTS(SELECT 1 FROM tenant_memberships WHERE user_id=target AND revoked_at IS NULL)
  OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id<>t AND user_id=target AND revoked_at IS NULL)
  OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=target AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 IF p_data->>'username' IS NULL OR p_data->>'username' !~ '^[a-z0-9][a-z0-9._-]{2,39}$'
 THEN RAISE EXCEPTION 'Invalid username' USING ERRCODE='22023'; END IF;
 INSERT INTO managed_usernames(username,tenant_id,user_id,existing_identity)
 VALUES(p_data->>'username',t,target,true);
 UPDATE tenants SET admin_version=admin_version+1 WHERE id=t;
 RETURN jsonb_build_object('userId',target,'username',p_data->>'username');
END $$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_username_login(text) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.ritim_assign_username(jsonb) SET search_path=pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_username_login(text),ritim_assign_username(jsonb) FROM PUBLIC;
