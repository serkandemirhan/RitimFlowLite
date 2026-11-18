-- External order grants are deliberately NOT site memberships. Runtime has no
-- direct table access; the application verifies identities before these functions.
CREATE TABLE customer_portal_shares (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, site_id uuid NOT NULL,
 customer_id uuid NOT NULL, order_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 include_quality boolean NOT NULL DEFAULT false, include_documents boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 FOREIGN KEY(tenant_id,site_id,customer_id) REFERENCES master_customers(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
 UNIQUE(tenant_id,site_id,order_id,user_id),
 CHECK(NOT include_documents OR include_quality)
);
REVOKE ALL ON customer_portal_shares FROM PUBLIC;
CREATE INDEX customer_portal_user ON customer_portal_shares(user_id) WHERE revoked_at IS NULL;
CREATE FUNCTION ritim_portal_access(p_user uuid,p_share uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE s customer_portal_shares%ROWTYPE;
BEGIN
 IF COALESCE(current_setting('ritim.tenant',true),'')<>'' THEN RAISE EXCEPTION 'scope already set' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM users WHERE id=p_user AND disabled_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO s FROM customer_portal_shares WHERE id=p_share AND user_id=p_user AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM set_config('ritim.tenant',s.tenant_id::text,true),set_config('ritim.site',s.site_id::text,true),set_config('ritim.actor',p_user::text,true);
 -- Renaming/reassigning an order never silently exposes it to the previous customer.
 PERFORM 1 FROM orders WHERE tenant_id=s.tenant_id AND site_id=s.site_id AND id=s.order_id AND customer_id=s.customer_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',s.id,'tenantId',s.tenant_id,'siteId',s.site_id,'customerId',s.customer_id,'orderId',s.order_id,'includeQuality',s.include_quality,'includeDocuments',s.include_documents);
END $$;
-- Batch summaries by site: no full-detail N+1 reads. Ownership is validated
-- before the limit, so stale shares cannot hide later valid customer orders.
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
CREATE FUNCTION ritim_portal_share_ids(p_user uuid) RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT s.id FROM customer_portal_shares s JOIN users u ON u.id=s.user_id
 WHERE s.user_id=p_user AND s.revoked_at IS NULL AND u.disabled_at IS NULL ORDER BY s.created_at,s.id LIMIT 501
$$;
CREATE FUNCTION ritim_portal_manage(p_action text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 site uuid:=nullif(current_setting('ritim.site',true),'')::uuid;
 s customer_portal_shares%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND disabled_at IS NULL) OR NOT (
 EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND revoked_at IS NULL) OR
 EXISTS(SELECT 1 FROM platform_admins WHERE user_id=actor AND revoked_at IS NULL)) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 IF p_action='lookup' THEN
 SELECT jsonb_build_object('id',u.id,'displayName',u.display_name,'username',m.username) INTO result
 FROM managed_usernames m JOIN users u ON u.id=m.user_id
 WHERE m.username=lower(p->>'username') AND u.disabled_at IS NULL AND (m.tenant_id=t OR EXISTS(SELECT 1 FROM customer_portal_shares x WHERE x.tenant_id=t AND x.user_id=u.id));
 IF result IS NULL THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF; RETURN result;
 ELSIF p_action='list' THEN
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."createdAt"),'[]') INTO result FROM (
 SELECT s.id,s.customer_id "customerId",s.order_id "orderId",s.user_id "userId",u.display_name "userName",s.include_quality "includeQuality",s.include_documents "includeDocuments",s.revoked_at "revokedAt",s.created_at "createdAt"
 FROM customer_portal_shares s JOIN users u ON u.id=s.user_id WHERE s.tenant_id=t AND s.site_id=site) x;
 RETURN result;
 ELSIF p_action='save' THEN
 PERFORM 1 FROM users WHERE id=(p->>'userId')::uuid AND disabled_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM orders o JOIN master_customers c ON (c.tenant_id,c.site_id,c.id)=(o.tenant_id,o.site_id,o.customer_id)
 WHERE o.tenant_id=t AND o.site_id=site AND o.id=(p->>'orderId')::uuid AND o.customer_id=(p->>'customerId')::uuid AND c.deleted_at IS NULL FOR SHARE OF o,c;
 IF NOT FOUND THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='P0002'; END IF;
 INSERT INTO customer_portal_shares(id,tenant_id,site_id,customer_id,order_id,user_id,include_quality,include_documents,created_by)
 VALUES((p->>'id')::uuid,t,site,(p->>'customerId')::uuid,(p->>'orderId')::uuid,(p->>'userId')::uuid,(p->>'includeQuality')::boolean,(p->>'includeDocuments')::boolean,actor)
 ON CONFLICT(tenant_id,site_id,order_id,user_id) DO UPDATE SET customer_id=EXCLUDED.customer_id,include_quality=EXCLUDED.include_quality,include_documents=EXCLUDED.include_documents,updated_at=now(),revoked_at=NULL RETURNING * INTO s;
 ELSIF p_action='revoke' THEN
 UPDATE customer_portal_shares SET revoked_at=now(),updated_at=now() WHERE id=(p->>'id')::uuid AND tenant_id=t AND site_id=site RETURNING * INTO s;
 IF NOT FOUND THEN RAISE EXCEPTION 'share unavailable' USING ERRCODE='P0002'; END IF;
 ELSE RAISE EXCEPTION 'invalid action' USING ERRCODE='22023'; END IF;
 INSERT INTO audit_events(tenant_id,site_id,id,actor_id,event_type,entity_type,entity_id,payload)
 VALUES(t,site,(p->>'auditId')::uuid,actor,'customer_portal.'||p_action,'customer_portal_share',s.id,jsonb_build_object('customerId',s.customer_id,'orderId',s.order_id,'userId',s.user_id,'includeQuality',s.include_quality,'includeDocuments',s.include_documents));
 RETURN jsonb_build_object('id',s.id,'customerId',s.customer_id,'orderId',s.order_id,'userId',s.user_id,'includeQuality',s.include_quality,'includeDocuments',s.include_documents,'revokedAt',s.revoked_at);
END $$;
DO $$ DECLARE sch text:=current_schema(); signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['ritim_portal_order_list(uuid)','ritim_portal_access(uuid,uuid)','ritim_portal_share_ids(uuid)','ritim_portal_manage(text,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION %I.%s SET search_path = pg_catalog,%I,pg_temp',sch,signature,sch);
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC',sch,signature);
 END LOOP;
END $$;
