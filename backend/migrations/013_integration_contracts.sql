-- Fictional development material is explicitly tagged and cannot be mistaken for an external receipt.
ALTER TABLE material_receipts ADD CONSTRAINT demo_receipt_context UNIQUE (tenant_id,site_id,order_id,id,lot_id,quantity_pieces);
CREATE TABLE demo_material_sources (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,receipt_id uuid NOT NULL,lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),
 idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,receipt_id),UNIQUE(tenant_id,site_id,lot_id),
 FOREIGN KEY(tenant_id,site_id,order_id,receipt_id,lot_id,quantity_pieces) REFERENCES material_receipts(tenant_id,site_id,order_id,id,lot_id,quantity_pieces),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TRIGGER demo_material_immutable BEFORE UPDATE OR DELETE ON demo_material_sources FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE demo_material_sources ENABLE ROW LEVEL SECURITY; ALTER TABLE demo_material_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON demo_material_sources USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
-- Do not grant runtime direct access to users or authorization tables.
CREATE FUNCTION ritim_eligible_operators(p_tenant uuid,p_site uuid) RETURNS TABLE(user_id uuid,display_name text)
LANGUAGE sql SECURITY DEFINER AS $$
 SELECT u.id,u.display_name FROM users u JOIN site_memberships m ON m.user_id=u.id
 WHERE ritim_scope_matches(p_tenant,p_site) AND m.tenant_id=p_tenant AND m.site_id=p_site
 AND m.role='operator' AND m.revoked_at IS NULL AND u.disabled_at IS NULL
 AND (EXISTS(SELECT 1 FROM site_memberships a WHERE a.user_id::text=current_setting('ritim.actor',true) AND a.tenant_id=p_tenant AND a.site_id=p_site AND a.role='manager' AND a.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM tenant_memberships a WHERE a.user_id::text=current_setting('ritim.actor',true) AND a.tenant_id=p_tenant AND a.role='tenant_admin' AND a.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id::text=current_setting('ritim.actor',true) AND a.revoked_at IS NULL))
 ORDER BY u.display_name,u.id
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_eligible_operators(uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch); END $$;
REVOKE ALL ON FUNCTION ritim_eligible_operators(uuid,uuid) FROM PUBLIC;
