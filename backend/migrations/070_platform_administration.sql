-- Platform access is granted out of band via platform_admins. Customer roles do not grant it.
CREATE TABLE platform_subscriptions (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
 plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise','unlimited')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
 ends_at timestamptz, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_management_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id), tenant_id uuid NOT NULL REFERENCES tenants(id),
 action text NOT NULL, reason text NOT NULL, previous jsonb NOT NULL, current_value jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_subscriptions, platform_management_events FROM PUBLIC;
CREATE FUNCTION ritim_platform_manage(p_actor uuid,p_action text,p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid; result jsonb; before_row jsonb; after_row jsonb; expected integer; why text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'createdAt',t.created_at,'plan',coalesce(s.plan,'free'),'status',coalesce(s.status,'active'),'version',coalesce(s.version,0)) ORDER BY t.name,t.id),'[]') INTO result
  FROM tenants t LEFT JOIN platform_subscriptions s ON s.tenant_id=t.id;
  RETURN result;
 END IF;
 t:=(p_data->>'tenantId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM tenants WHERE id=t) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 IF p_action='detail' THEN
  SELECT jsonb_build_object('id',a.id,'name',a.name,'createdAt',a.created_at,'plan',coalesce(s.plan,'free'),'status',coalesce(s.status,'active'),'endsAt',s.ends_at,'version',coalesce(s.version,0),
   'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'code',x.code) ORDER BY x.name),'[]') FROM sites x WHERE x.tenant_id=a.id),
   'users',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'disabled',u.disabled_at IS NOT NULL) ORDER BY u.display_name),'[]') FROM users u WHERE EXISTS(SELECT 1 FROM site_memberships m WHERE m.tenant_id=a.id AND m.user_id=u.id AND m.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=a.id AND m.user_id=u.id AND m.revoked_at IS NULL))) INTO result
  FROM tenants a LEFT JOIN platform_subscriptions s ON s.tenant_id=a.id WHERE a.id=t;
  RETURN result;
 END IF;
 IF p_action<>'subscription' OR p_data->>'plan' NOT IN ('free','starter','pro','enterprise','unlimited') OR p_data->>'status' NOT IN ('active','suspended','cancelled') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 why:=trim(coalesce(p_data->>'reason','')); IF length(why)<5 OR length(why)>500 THEN RAISE EXCEPTION 'Invalid reason' USING ERRCODE='22023'; END IF;
 expected:=(p_data->>'version')::integer;
 PERFORM 1 FROM tenants WHERE id=t FOR UPDATE;
 SELECT to_jsonb(s) INTO before_row FROM platform_subscriptions s WHERE tenant_id=t;
 IF coalesce((before_row->>'version')::integer,0) IS DISTINCT FROM expected THEN RETURN jsonb_build_object('conflict',true); END IF;
 INSERT INTO platform_subscriptions(tenant_id,plan,status,ends_at) VALUES(t,p_data->>'plan',p_data->>'status',nullif(p_data->>'endsAt','')::timestamptz)
 ON CONFLICT(tenant_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,ends_at=EXCLUDED.ends_at,version=platform_subscriptions.version+1,updated_at=now()
 RETURNING to_jsonb(platform_subscriptions.*) INTO after_row;
 INSERT INTO platform_management_events(actor_id,tenant_id,action,reason,previous,current_value) VALUES(p_actor,t,'subscription.updated',why,coalesce(before_row,'{}'),after_row);
 RETURN after_row;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_platform_manage(uuid,text,jsonb) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_platform_manage(uuid,text,jsonb) FROM PUBLIC;
