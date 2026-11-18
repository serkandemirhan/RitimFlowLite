-- Additive customer collaboration. Existing grants retain their existing visibility.
ALTER TABLE customer_portal_shares ADD COLUMN permissions jsonb NOT NULL DEFAULT '{"production":true,"workOrders":true,"drawings":false,"videos":false,"requests":false,"download":true}';
ALTER TABLE customer_portal_shares DROP CONSTRAINT customer_portal_shares_check;
CREATE TABLE portal_accounts (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, customer_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 managed boolean NOT NULL DEFAULT false, blocked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,customer_id,user_id),
 FOREIGN KEY(tenant_id,site_id,customer_id) REFERENCES master_customers(tenant_id,site_id,id)
);
INSERT INTO portal_accounts(tenant_id,site_id,customer_id,user_id) SELECT DISTINCT tenant_id,site_id,customer_id,user_id FROM customer_portal_shares;
REVOKE ALL ON portal_accounts FROM PUBLIC;

ALTER FUNCTION ritim_portal_access(uuid,uuid) RENAME TO ritim_portal_access_v1;
CREATE FUNCTION ritim_portal_access(p_user uuid,p_share uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb; options jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM customer_portal_shares s JOIN portal_accounts a USING(tenant_id,site_id,customer_id,user_id) WHERE s.id=p_share AND s.user_id=p_user AND a.blocked_at IS NOT NULL) THEN RETURN NULL; END IF;
 result:=ritim_portal_access_v1(p_user,p_share);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT permissions INTO options FROM customer_portal_shares WHERE id=p_share;
 RETURN result||jsonb_build_object('permissions',options);
END $$;

ALTER FUNCTION ritim_portal_order_list(uuid) RENAME TO ritim_portal_order_list_v1;
CREATE FUNCTION ritim_portal_order_list(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE scope record; item record; result jsonb:='[]'::jsonb; n integer:=0;
BEGIN
 IF COALESCE(current_setting('ritim.tenant',true),'')<>'' THEN RAISE EXCEPTION 'scope already set' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM users WHERE id=p_user AND disabled_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('orders',result,'truncated',false); END IF;
 FOR scope IN SELECT DISTINCT tenant_id,site_id FROM customer_portal_shares WHERE user_id=p_user AND revoked_at IS NULL ORDER BY tenant_id,site_id LOOP
  PERFORM set_config('ritim.tenant',scope.tenant_id::text,true),set_config('ritim.site',scope.site_id::text,true),set_config('ritim.actor',p_user::text,true);
  FOR item IN SELECT o.id,s.id AS share_id,o.order_number,o.customer,o.ordered_qty,o.due_date,o.status,o.execution_hold,s.include_quality,s.include_documents
   FROM customer_portal_shares s JOIN orders o ON (o.tenant_id,o.site_id,o.id,o.customer_id)=(s.tenant_id,s.site_id,s.order_id,s.customer_id)
   WHERE s.user_id=p_user AND s.revoked_at IS NULL AND s.tenant_id=scope.tenant_id AND s.site_id=scope.site_id
   AND NOT EXISTS(SELECT 1 FROM portal_accounts a WHERE (a.tenant_id,a.site_id,a.customer_id,a.user_id)=(s.tenant_id,s.site_id,s.customer_id,s.user_id) AND a.blocked_at IS NOT NULL)
   ORDER BY s.id LIMIT 501-n FOR SHARE OF s,o LOOP
   IF n=500 THEN RETURN jsonb_build_object('orders',result,'truncated',true); END IF;
   result:=result||jsonb_build_array(jsonb_build_object('id',item.id,'shareId',item.share_id,'tenantId',scope.tenant_id,'siteId',scope.site_id,
    'orderNumber',item.order_number,'customer',item.customer,'orderedQuantity',item.ordered_qty,'dueDate',item.due_date,'status',item.status,
    'executionHold',item.execution_hold,'includeQuality',item.include_quality,'includeDocuments',item.include_documents));
   n:=n+1;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('orders',result,'truncated',false);
END $$;

ALTER FUNCTION ritim_portal_manage(text,jsonb) RENAME TO ritim_portal_manage_v1;
CREATE FUNCTION ritim_portal_manage(p_action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb; t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid; site uuid:=nullif(current_setting('ritim.site',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
BEGIN
 IF p_action='list' THEN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND disabled_at IS NULL) OR NOT (
   EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL) OR
   EXISTS(SELECT 1 FROM platform_admins WHERE user_id=actor AND revoked_at IS NULL)) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row."createdAt"),'[]') INTO result FROM (
   SELECT sh.id,sh.customer_id "customerId",sh.order_id "orderId",sh.user_id "userId",u.display_name "userName",sh.include_quality "includeQuality",sh.include_documents "includeDocuments",sh.permissions,sh.revoked_at "revokedAt",sh.created_at "createdAt"
   FROM customer_portal_shares sh JOIN users u ON u.id=sh.user_id WHERE sh.tenant_id=t AND sh.site_id=site
  ) row;
  RETURN result;
 END IF;
 result:=ritim_portal_manage_v1(p_action,p);
 IF p_action='save' THEN
  INSERT INTO portal_accounts(tenant_id,site_id,customer_id,user_id) VALUES(t,site,(p->>'customerId')::uuid,(p->>'userId')::uuid) ON CONFLICT DO NOTHING;
  IF p ? 'permissions' THEN UPDATE customer_portal_shares SET permissions=p->'permissions' WHERE id=(result->>'id')::uuid; END IF;
  SELECT result||jsonb_build_object('permissions',permissions) INTO result FROM customer_portal_shares WHERE id=(result->>'id')::uuid;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION ritim_portal_accounts(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid; site uuid:=nullif(current_setting('ritim.site',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid; target uuid; customer uuid; result jsonb; issuer_value text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN tenant_memberships m ON m.user_id=u.id WHERE u.id=actor AND u.disabled_at IS NULL AND m.tenant_id=t AND m.role='tenant_admin' AND m.revoked_at IS NULL) THEN RAISE EXCEPTION 'tenant admin required' USING ERRCODE='42501'; END IF;
 IF action='list' THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',a.user_id,'customerId',a.customer_id,'name',u.display_name,'username',m.username,'managed',a.managed,'blocked',a.blocked_at IS NOT NULL) ORDER BY u.display_name),'[]') INTO result FROM portal_accounts a JOIN users u ON u.id=a.user_id LEFT JOIN managed_usernames m ON m.user_id=u.id WHERE a.tenant_id=t AND a.site_id=site;
  RETURN result;
 END IF;
 target:=(p->>'userId')::uuid; customer:=(p->>'customerId')::uuid;
 PERFORM 1 FROM master_customers WHERE tenant_id=t AND site_id=site AND id=customer AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer unavailable' USING ERRCODE='P0002'; END IF;
 IF action='create' THEN
  SELECT issuer INTO issuer_value FROM users WHERE id=actor;
  INSERT INTO users(id,issuer,subject,display_name) VALUES(target,issuer_value,target::text,p->>'name');
  INSERT INTO managed_usernames(username,tenant_id,user_id) VALUES(p->>'username',t,target);
  INSERT INTO portal_accounts(tenant_id,site_id,customer_id,user_id,managed) VALUES(t,site,customer,target,true);
 ELSIF action IN ('block','unblock') THEN
  UPDATE portal_accounts SET blocked_at=CASE WHEN action='block' THEN now() ELSE NULL END WHERE tenant_id=t AND site_id=site AND customer_id=customer AND user_id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
 ELSIF action='password-target' THEN
  IF NOT EXISTS(SELECT 1 FROM portal_accounts WHERE tenant_id=t AND site_id=site AND customer_id=customer AND user_id=target AND managed)
   OR EXISTS(SELECT 1 FROM portal_accounts WHERE user_id=target AND tenant_id<>t)
   OR EXISTS(SELECT 1 FROM site_memberships WHERE user_id=target AND revoked_at IS NULL)
   OR EXISTS(SELECT 1 FROM tenant_memberships WHERE user_id=target AND revoked_at IS NULL)
   OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=target AND revoked_at IS NULL)
  THEN RAISE EXCEPTION 'exclusive customer account required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('issuer',issuer,'subject',subject) INTO result FROM users WHERE id=target;
  RETURN result;
 ELSE RAISE EXCEPTION 'invalid action' USING ERRCODE='22023'; END IF;
 INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id,payload) VALUES(t,site,(p->>'auditId')::uuid,actor,'portal_account.'||action,'user',target,jsonb_build_object('customerId',customer));
 RETURN jsonb_build_object('userId',target,'customerId',customer);
END $$;

CREATE TABLE portal_requests (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,customer_id uuid NOT NULL,order_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),kind text NOT NULL CHECK(kind IN ('change','question')),
 proposed jsonb NOT NULL DEFAULT '{}',baseline jsonb NOT NULL,status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','waiting_customer','approved','rejected','applied','withdrawn')),
 version integer NOT NULL DEFAULT 1, revision integer,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,customer_id) REFERENCES master_customers(tenant_id,site_id,id)
);
CREATE INDEX portal_requests_inbox ON portal_requests(tenant_id,site_id,updated_at DESC);
CREATE TABLE portal_messages (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 side text NOT NULL CHECK(side IN ('customer','staff')),internal boolean NOT NULL DEFAULT false,body text NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),status text,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,request_id) REFERENCES portal_requests(tenant_id,site_id,id),CHECK(NOT internal OR side='staff')
);
CREATE TABLE portal_files (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,order_id uuid NOT NULL,request_id uuid,message_id uuid,
 category text NOT NULL CHECK(category IN ('attachment','drawing','video','document')),filename text NOT NULL,mime text NOT NULL,content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 3145728),sha256 text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 PRIMARY KEY(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,request_id) REFERENCES portal_requests(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,message_id) REFERENCES portal_messages(tenant_id,site_id,id),CHECK((request_id IS NULL)=(message_id IS NULL))
);
CREATE TABLE portal_reads (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,request_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,request_id,user_id),FOREIGN KEY(tenant_id,site_id,request_id) REFERENCES portal_requests(tenant_id,site_id,id)
);
CREATE TABLE portal_revisions (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,request_id uuid NOT NULL,number integer NOT NULL,
 before_state jsonb NOT NULL,after_state jsonb NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,order_id,number),UNIQUE(tenant_id,site_id,request_id),FOREIGN KEY(tenant_id,site_id,request_id) REFERENCES portal_requests(tenant_id,site_id,id)
);
DO $$ DECLARE tbl text; sig text; sch text:=current_schema(); BEGIN
 FOREACH tbl IN ARRAY ARRAY['portal_requests','portal_messages','portal_files','portal_reads','portal_revisions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',tbl);
 END LOOP;
 FOREACH sig IN ARRAY ARRAY['ritim_portal_access(uuid,uuid)','ritim_portal_order_list(uuid)','ritim_portal_manage(text,jsonb)','ritim_portal_accounts(text,jsonb)'] LOOP
  EXECUTE format('ALTER FUNCTION %I.%s SET search_path=pg_catalog,%I,pg_temp',sch,sig,sch);EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC',sch,sig);
 END LOOP;
 -- Old entry points are implementation details; never grant them to runtime.
 EXECUTE format('REVOKE ALL ON FUNCTION %I.ritim_portal_access_v1(uuid,uuid),%I.ritim_portal_order_list_v1(uuid),%I.ritim_portal_manage_v1(text,jsonb) FROM PUBLIC',sch,sch,sch);
END $$;
