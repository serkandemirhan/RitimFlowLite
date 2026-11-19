-- Customer defaults are private; explicit order grants and revocations remain overrides.
CREATE TABLE portal_customer_settings (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, customer_id uuid NOT NULL,
 automatic boolean NOT NULL DEFAULT false, access_enabled boolean NOT NULL DEFAULT true,
 include_quality boolean NOT NULL DEFAULT false, include_documents boolean NOT NULL DEFAULT false,
 permissions jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(tenant_id,site_id,customer_id),
 FOREIGN KEY(tenant_id,site_id,customer_id) REFERENCES master_customers(tenant_id,site_id,id)
);
REVOKE ALL ON portal_customer_settings FROM PUBLIC;
ALTER TABLE customer_portal_shares ADD COLUMN automatic boolean NOT NULL DEFAULT false;

-- Called only with an already opened scope. List refresh materializes future orders too.
CREATE FUNCTION ritim_portal_sync(p_customer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 site uuid:=nullif(current_setting('ritim.site',true),'')::uuid; policy portal_customer_settings%ROWTYPE;
BEGIN
 SELECT * INTO policy FROM portal_customer_settings WHERE tenant_id=t AND site_id=site AND customer_id=p_customer FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT policy.automatic THEN
  UPDATE customer_portal_shares SET revoked_at=COALESCE(revoked_at,now()) WHERE tenant_id=t AND site_id=site AND customer_id=p_customer AND automatic;
  RETURN;
 END IF;
 INSERT INTO customer_portal_shares(id,tenant_id,site_id,customer_id,order_id,user_id,include_quality,include_documents,permissions,created_by,automatic)
 SELECT gen_random_uuid(),t,site,p_customer,o.id,a.user_id,policy.include_quality,policy.include_documents,policy.permissions,policy.updated_by,true
 FROM orders o JOIN portal_accounts a ON (a.tenant_id,a.site_id,a.customer_id)=(o.tenant_id,o.site_id,o.customer_id)
 WHERE o.tenant_id=t AND o.site_id=site AND o.customer_id=p_customer
 ON CONFLICT(tenant_id,site_id,order_id,user_id) DO UPDATE SET
 include_quality=EXCLUDED.include_quality,include_documents=EXCLUDED.include_documents,permissions=EXCLUDED.permissions,revoked_at=NULL,updated_at=now()
 WHERE customer_portal_shares.automatic AND customer_portal_shares.customer_id=EXCLUDED.customer_id
 AND (customer_portal_shares.revoked_at IS NOT NULL OR (customer_portal_shares.include_quality,customer_portal_shares.include_documents,customer_portal_shares.permissions) IS DISTINCT FROM (EXCLUDED.include_quality,EXCLUDED.include_documents,EXCLUDED.permissions));
END $$;

CREATE FUNCTION ritim_portal_settings(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid; site uuid:=nullif(current_setting('ritim.site',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid; customer uuid:=(p->>'customerId')::uuid; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN tenant_memberships m ON m.user_id=u.id WHERE u.id=actor AND u.disabled_at IS NULL AND m.tenant_id=t AND m.role='tenant_admin' AND m.revoked_at IS NULL) THEN RAISE EXCEPTION 'tenant admin required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM master_customers WHERE tenant_id=t AND site_id=site AND id=customer AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer unavailable' USING ERRCODE='P0002'; END IF;
 IF action='save' THEN
  INSERT INTO portal_customer_settings(tenant_id,site_id,customer_id,updated_by,version) VALUES(t,site,customer,actor,0) ON CONFLICT DO NOTHING;
  UPDATE portal_customer_settings SET automatic=(p->>'automatic')::boolean,access_enabled=(p->>'accessEnabled')::boolean,
   include_quality=(p->>'includeQuality')::boolean,include_documents=(p->>'includeDocuments')::boolean,permissions=p->'permissions',updated_by=actor,version=version+1
   WHERE tenant_id=t AND site_id=site AND customer_id=customer AND version=(p->>'version')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'settings changed' USING ERRCODE='40001'; END IF;
  UPDATE portal_accounts SET blocked_at=CASE WHEN (p->>'accessEnabled')::boolean THEN NULL ELSE now() END WHERE tenant_id=t AND site_id=site AND customer_id=customer;
  PERFORM ritim_portal_sync(customer);
  INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id,payload) VALUES(t,site,(p->>'auditId')::uuid,actor,'portal.settings','customer',customer,p-'auditId');
 ELSIF action<>'get' THEN RAISE EXCEPTION 'invalid action' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('automatic',automatic,'accessEnabled',access_enabled,'includeQuality',include_quality,'includeDocuments',include_documents,'permissions',permissions,'version',version) INTO result
 FROM portal_customer_settings WHERE tenant_id=t AND site_id=site AND customer_id=customer;
 RETURN COALESCE(result,jsonb_build_object('automatic',false,'accessEnabled',NOT EXISTS(SELECT 1 FROM portal_accounts WHERE tenant_id=t AND site_id=site AND customer_id=customer AND blocked_at IS NOT NULL),'includeQuality',false,'includeDocuments',false,'permissions','{}'::jsonb,'version',0));
END $$;

ALTER FUNCTION ritim_portal_manage(text,jsonb) RENAME TO ritim_portal_manage_v2;
CREATE FUNCTION ritim_portal_manage(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb; policy record;
BEGIN
 result:=ritim_portal_manage_v2(action,p);
 IF action='list' THEN
  FOR policy IN SELECT customer_id FROM portal_customer_settings WHERE tenant_id=nullif(current_setting('ritim.tenant',true),'')::uuid AND site_id=nullif(current_setting('ritim.site',true),'')::uuid AND automatic ORDER BY customer_id LOOP
   PERFORM ritim_portal_sync(policy.customer_id);
  END LOOP;
  RETURN ritim_portal_manage_v2(action,p);
 END IF;
 IF action IN ('save','revoke') THEN UPDATE customer_portal_shares SET automatic=false WHERE id=(result->>'id')::uuid; END IF;
 RETURN result;
END $$;

ALTER FUNCTION ritim_portal_access(uuid,uuid) RENAME TO ritim_portal_access_v2;
CREATE FUNCTION ritim_portal_access(p_user uuid,p_share uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM customer_portal_shares s JOIN portal_customer_settings p USING(tenant_id,site_id,customer_id) WHERE s.id=p_share AND s.user_id=p_user AND NOT p.access_enabled) THEN RETURN NULL; END IF;
 RETURN ritim_portal_access_v2(p_user,p_share);
END $$;

CREATE FUNCTION ritim_portal_order_list_filtered(p_user uuid) RETURNS jsonb
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
   AND NOT EXISTS(SELECT 1 FROM portal_customer_settings p WHERE (p.tenant_id,p.site_id,p.customer_id)=(s.tenant_id,s.site_id,s.customer_id) AND NOT p.access_enabled)
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

ALTER FUNCTION ritim_portal_order_list(uuid) RENAME TO ritim_portal_order_list_v2;
CREATE FUNCTION ritim_portal_order_list(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE policy record; result jsonb; actor text:=COALESCE(current_setting('ritim.actor',true),''); site text:=COALESCE(current_setting('ritim.site',true),'');
BEGIN
 IF COALESCE(current_setting('ritim.tenant',true),'')<>'' THEN RAISE EXCEPTION 'scope already set' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM users WHERE id=p_user AND disabled_at IS NULL) THEN
  FOR policy IN SELECT p.* FROM portal_customer_settings p WHERE p.automatic AND p.access_enabled AND EXISTS(SELECT 1 FROM portal_accounts a WHERE (a.tenant_id,a.site_id,a.customer_id)=(p.tenant_id,p.site_id,p.customer_id) AND a.user_id=p_user AND a.blocked_at IS NULL) ORDER BY p.tenant_id,p.site_id,p.customer_id LOOP
   PERFORM set_config('ritim.tenant',policy.tenant_id::text,true),set_config('ritim.site',policy.site_id::text,true);
   PERFORM ritim_portal_sync(policy.customer_id);
  END LOOP;
 END IF;
 PERFORM set_config('ritim.tenant','',true),set_config('ritim.site',site,true),set_config('ritim.actor',actor,true);
 RETURN ritim_portal_order_list_filtered(p_user);
END $$;

DO $$ DECLARE sig text; sch text:=current_schema(); BEGIN
 FOREACH sig IN ARRAY ARRAY['ritim_portal_order_list_filtered(uuid)','ritim_portal_sync(uuid)','ritim_portal_settings(text,jsonb)','ritim_portal_manage(text,jsonb)','ritim_portal_access(uuid,uuid)','ritim_portal_order_list(uuid)'] LOOP
  EXECUTE format('ALTER FUNCTION %I.%s SET search_path=pg_catalog,%I,pg_temp',sch,sig,sch);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC',sch,sig);
 END LOOP;
END $$;
