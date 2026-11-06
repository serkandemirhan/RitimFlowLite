CREATE TABLE workspace_invitations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, site_id uuid NOT NULL,
 email text NOT NULL CHECK(length(email)<=254 AND email=lower(email)),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
 role text NOT NULL CHECK(role IN ('manager','planner','operator','quality','logistics','viewer')),
 invited_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled')),
 delivery text NOT NULL DEFAULT 'ready' CHECK(delivery IN ('ready','sending','sent','failed','unknown')),
 attempted_at timestamptz, accepted_by uuid REFERENCES users(id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION ritim_manage_invitation(p_action text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 a uuid:=nullif(current_setting('ritim.actor',true),'')::uuid; r workspace_invitations; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=t AND tm.user_id=a AND tm.role='tenant_admin' AND tm.revoked_at IS NULL AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),'[]') INTO result FROM (SELECT * FROM workspace_invitations WHERE tenant_id=t ORDER BY created_at DESC LIMIT 100) i; RETURN result;
 END IF;
 IF p_action='create' THEN
  PERFORM 1 FROM tenants WHERE id=t FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM sites WHERE tenant_id=t AND id=(p->>'siteId')::uuid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM workspace_invitations WHERE tenant_id=t AND site_id=(p->>'siteId')::uuid AND email=p->>'email' AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'Pending invitation exists' USING ERRCODE='23505'; END IF;
  INSERT INTO workspace_invitations(id,tenant_id,site_id,email,display_name,role,invited_by)
  VALUES((p->>'id')::uuid,t,(p->>'siteId')::uuid,p->>'email',p->>'name',p->>'role',a) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM workspace_invitations WHERE tenant_id=t AND id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_action='cancel' THEN
   UPDATE workspace_invitations SET status='cancelled' WHERE id=r.id AND status='pending';
  ELSIF p_action='send' THEN
   IF r.status<>'pending' OR r.expires_at<=now() THEN RETURN NULL; END IF;
   IF r.attempted_at>now()-interval '2 minutes' THEN RETURN NULL; END IF;
   UPDATE workspace_invitations SET delivery='sending',attempted_at=now() WHERE id=r.id;
  ELSIF p_action='delivery' THEN
   IF p->>'delivery' NOT IN ('sent','failed','unknown') THEN RAISE EXCEPTION 'Invalid delivery' USING ERRCODE='22023'; END IF;
   UPDATE workspace_invitations SET delivery=p->>'delivery' WHERE id=r.id AND delivery='sending';
  ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN to_jsonb(r);
END $$;
-- Called only after the server verifies the provider JWT AND confirmed email.
CREATE FUNCTION ritim_accept_invitation(p_id uuid,p_email text,p_issuer text,p_subject text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r workspace_invitations; uid uuid;
BEGIN
 SELECT * INTO r FROM workspace_invitations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.email<>lower(p_email) OR r.status<>'pending' OR r.expires_at<=now() THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=r.tenant_id AND tm.user_id=r.invited_by AND tm.role='tenant_admin' AND tm.revoked_at IS NULL AND u.disabled_at IS NULL FOR SHARE OF tm,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inviter unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO users(id,issuer,subject,display_name) VALUES(gen_random_uuid(),p_issuer,p_subject,r.display_name) ON CONFLICT(issuer,subject) DO NOTHING;
 SELECT id INTO uid FROM users WHERE issuer=p_issuer AND subject=p_subject AND disabled_at IS NULL FOR SHARE;
 IF uid IS NULL THEN RAISE EXCEPTION 'Account disabled' USING ERRCODE='42501'; END IF;
 INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES(r.tenant_id,r.site_id,uid,r.role)
 ON CONFLICT(tenant_id,site_id,user_id,role) DO UPDATE SET revoked_at=NULL;
 UPDATE workspace_invitations SET status='accepted',accepted_by=uid WHERE id=r.id;
 UPDATE tenants SET admin_version=admin_version+1 WHERE id=r.tenant_id;
 PERFORM set_config('ritim.tenant',r.tenant_id::text,true),set_config('ritim.site',r.site_id::text,true),set_config('ritim.actor',uid::text,true);
 INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id,payload)
 VALUES(r.tenant_id,r.site_id,gen_random_uuid(),uid,'invitation.accepted','invitation',r.id,jsonb_build_object('role',r.role,'invitedBy',r.invited_by));
 RETURN uid;
END $$;
DO $$ DECLARE s text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_manage_invitation(text,jsonb) SET search_path=pg_catalog,%I,pg_temp',s,s);
 EXECUTE format('ALTER FUNCTION %I.ritim_accept_invitation(uuid,text,text,text) SET search_path=pg_catalog,%I,pg_temp',s,s);
END $$;
REVOKE ALL ON workspace_invitations FROM PUBLIC;
REVOKE ALL ON FUNCTION ritim_manage_invitation(text,jsonb),ritim_accept_invitation(uuid,text,text,text) FROM PUBLIC;
