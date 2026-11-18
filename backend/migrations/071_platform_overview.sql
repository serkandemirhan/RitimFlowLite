-- Platform-wide tenant metrics and account names, available only to active platform admins.
CREATE FUNCTION ritim_platform_overview(p_actor uuid, p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL) THEN
  RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object(
  'orders',(SELECT count(*) FROM orders WHERE tenant_id=p_tenant),
  'productionOrders',(SELECT count(*) FROM production_orders WHERE tenant_id=p_tenant),
  'workOrders',(SELECT count(*) FROM work_orders WHERE tenant_id=p_tenant),
  'usernames',(SELECT coalesce(jsonb_object_agg(user_id::text,username),'{}'::jsonb) FROM managed_usernames WHERE tenant_id=p_tenant),
  'roles',(SELECT coalesce(jsonb_object_agg(x.user_id::text,x.roles),'{}'::jsonb) FROM (SELECT user_id,jsonb_agg(role ORDER BY role) roles FROM (SELECT user_id,role FROM tenant_memberships WHERE tenant_id=p_tenant AND revoked_at IS NULL UNION SELECT user_id,role FROM site_memberships WHERE tenant_id=p_tenant AND revoked_at IS NULL) r GROUP BY user_id) x)
 ) INTO result;
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_platform_overview(uuid,uuid) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_platform_overview(uuid,uuid) FROM PUBLIC;
-- Password operations are permitted only for an active platform administrator and a user in the selected firm.
CREATE FUNCTION ritim_platform_password_target(p_actor uuid,p_tenant uuid,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL)
 OR p_actor=p_user
 OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=p_user AND revoked_at IS NULL)
 OR NOT (EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=p_tenant AND user_id=p_user AND revoked_at IS NULL) OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=p_tenant AND user_id=p_user AND revoked_at IS NULL))
 OR EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id<>p_tenant AND user_id=p_user AND revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id<>p_tenant AND user_id=p_user AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Password administration forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('issuer',issuer,'subject',subject) INTO result FROM users WHERE id=p_user AND disabled_at IS NULL;
 IF result IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_platform_password_target(uuid,uuid,uuid) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_platform_password_target(uuid,uuid,uuid) FROM PUBLIC;

-- Mutations are restricted to platform admins and recorded without credentials.
CREATE FUNCTION ritim_platform_accounts(p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid; target uuid; sid uuid; who text; reason text; v_name text; v_user text; v_role text; result jsonb;
BEGIN
 SELECT u.issuer INTO who FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL;
 IF who IS NULL THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 reason:=trim(coalesce(p_data->>'reason',''));
 IF length(reason) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 t:=(p_data->>'tenantId')::uuid;
 IF p_action='create-tenant' THEN
  sid:=(p_data->>'siteId')::uuid; v_name:=trim(coalesce(p_data->>'name',''));
  IF length(v_name) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid name' USING ERRCODE='22023'; END IF;
  INSERT INTO tenants(id,name) VALUES(t,v_name);
  INSERT INTO sites(tenant_id,id,code,name) VALUES(t,sid,'MERKEZ','Merkez');
  result:=jsonb_build_object('tenantId',t,'siteId',sid,'name',v_name);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM tenants WHERE id=t) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
  target:=(p_data->>'userId')::uuid;
  IF p_action='create-user' THEN
   sid:=(p_data->>'siteId')::uuid; v_name:=trim(coalesce(p_data->>'name','')); v_user:=p_data->>'username'; v_role:=p_data->>'role';
   IF length(v_name) NOT BETWEEN 1 AND 120 OR v_user !~ '^[a-z0-9][a-z0-9._-]{2,39}$' OR v_role NOT IN ('tenant_admin','manager','planner','operator','quality','logistics','viewer') OR NOT EXISTS(SELECT 1 FROM sites WHERE tenant_id=t AND id=sid) THEN RAISE EXCEPTION 'Invalid user' USING ERRCODE='22023'; END IF;
   INSERT INTO users(id,issuer,subject,display_name) VALUES(target,who,target::text,v_name);
   INSERT INTO managed_usernames(username,tenant_id,user_id) VALUES(v_user,t,target);
   IF v_role='tenant_admin' THEN INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES(t,target,'tenant_admin');
   ELSE INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES(t,sid,target,v_role); END IF;
   result:=jsonb_build_object('userId',target,'username',v_user,'role',v_role);
  ELSE
   IF target=p_actor OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=target AND revoked_at IS NULL)
    OR NOT (EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL) OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL))
    OR EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id<>t AND user_id=target AND revoked_at IS NULL)
    OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id<>t AND user_id=target AND revoked_at IS NULL)
   THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
   IF p_action IN ('suspend','activate') THEN
    UPDATE users SET disabled_at=CASE WHEN p_action='suspend' THEN now() ELSE NULL END WHERE id=target;
   ELSIF p_action='remove' THEN
    UPDATE tenant_memberships SET revoked_at=now() WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL;
    UPDATE site_memberships SET revoked_at=now() WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL;
    UPDATE users SET disabled_at=now() WHERE id=target;
   ELSIF p_action='username' THEN
    v_user:=p_data->>'username'; IF v_user IS NULL OR v_user !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN RAISE EXCEPTION 'Invalid username' USING ERRCODE='22023'; END IF;
    INSERT INTO managed_usernames(username,tenant_id,user_id,existing_identity) SELECT v_user,t,target,true FROM users u WHERE u.id=target
     ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username;
   ELSIF p_action='role' THEN
    sid:=(p_data->>'siteId')::uuid; v_role:=p_data->>'role';
    IF v_role IS NULL OR v_role NOT IN ('tenant_admin','manager','planner','operator','quality','logistics','viewer') OR NOT EXISTS(SELECT 1 FROM sites WHERE tenant_id=t AND id=sid) THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='22023'; END IF;
    UPDATE tenant_memberships SET revoked_at=now() WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL;
    UPDATE site_memberships SET revoked_at=now() WHERE tenant_id=t AND user_id=target AND revoked_at IS NULL;
    IF v_role='tenant_admin' THEN INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES(t,target,'tenant_admin') ON CONFLICT(tenant_id,user_id,role) DO UPDATE SET revoked_at=NULL;
    ELSE INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES(t,sid,target,v_role) ON CONFLICT(tenant_id,site_id,user_id,role) DO UPDATE SET revoked_at=NULL; END IF;
   ELSIF p_action='password-audit' THEN NULL;
   ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
   result:=jsonb_build_object('userId',target);
  END IF;
 END IF;
 INSERT INTO platform_management_events(actor_id,tenant_id,action,reason,previous,current_value) VALUES(p_actor,t,'account.'||p_action,reason,'{}'::jsonb,result);
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_platform_accounts(uuid,text,jsonb) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_platform_accounts(uuid,text,jsonb) FROM PUBLIC;
