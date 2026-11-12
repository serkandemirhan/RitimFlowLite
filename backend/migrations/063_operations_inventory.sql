-- Append-only quality attribution and dependency-safe warehouse corrections.
CREATE TABLE inventory_quality_debits (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,movement_id uuid NOT NULL,
 approved numeric(22,6) NOT NULL DEFAULT 0 CHECK(approved>=0),
 rejected numeric(22,6) NOT NULL DEFAULT 0 CHECK(rejected>=0),
 pending numeric(22,6) NOT NULL DEFAULT 0 CHECK(pending>=0),
 restore boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,site_id,movement_id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id)
);
CREATE TABLE inventory_movement_corrections (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,movement_id uuid NOT NULL,
 reversal_id uuid NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 PRIMARY KEY(tenant_id,site_id,movement_id),UNIQUE(tenant_id,site_id,reversal_id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,reversal_id) REFERENCES inventory_movements(tenant_id,site_id,id)
);
CREATE TABLE inventory_supplier_returns (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,movement_id uuid NOT NULL,supplier_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,site_id,movement_id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,supplier_id) REFERENCES outsourcing_suppliers(tenant_id,site_id,id)
);
ALTER TABLE inventory_lot_inspections ADD COLUMN reason text;
ALTER TABLE inventory_lot_inspections ADD COLUMN note text CHECK(length(note)<=1000);
ALTER TABLE inventory_lots ADD COLUMN supplier_id uuid;
ALTER TABLE inventory_lots ADD FOREIGN KEY(tenant_id,site_id,supplier_id) REFERENCES outsourcing_suppliers(tenant_id,site_id,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_quality_debits','inventory_movement_corrections','inventory_supplier_returns'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
CREATE INDEX inventory_inspections_lot ON inventory_lot_inspections(tenant_id,site_id,lot_id,created_at,id);
CREATE FUNCTION ritim_inventory_actor_name(p_tenant uuid,p_site uuid,p_record uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT u.display_name FROM users u JOIN (
 SELECT actor_id FROM inventory_movements WHERE tenant_id=p_tenant AND site_id=p_site AND id=p_record
 UNION ALL SELECT actor_id FROM inventory_lot_inspections WHERE tenant_id=p_tenant AND site_id=p_site AND id=p_record
 ) a ON a.actor_id=u.id WHERE ritim_scope_matches(p_tenant,p_site) LIMIT 1
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_inventory_actor_name(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_inventory_actor_name(uuid,uuid,uuid) FROM PUBLIC;
-- Only an allocation with no physical dispatch can be released by this shortcut.
CREATE TABLE shipping_allocation_cancellations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,allocation_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces>0),reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 120),
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,allocation_id),
 FOREIGN KEY(tenant_id,site_id,order_id,allocation_id) REFERENCES shipping_events(tenant_id,site_id,order_id,id)
);
ALTER TABLE shipping_allocation_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_allocation_cancellations FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON shipping_allocation_cancellations USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON shipping_allocation_cancellations FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE VIEW effective_shipping_events WITH (security_invoker=true) AS
 SELECT e.tenant_id,e.site_id,e.order_id,e.id,e.sequence,e.shipping_order_id,e.event_type,e.allocation_id,e.dispatch_id,e.output_lot_id,
 e.quantity_pieces-COALESCE(c.quantity_pieces,0) quantity_pieces,e.actor_id,e.idempotency_key,e.created_at,e.rma_release_id
 FROM shipping_events e LEFT JOIN shipping_allocation_cancellations c ON (c.tenant_id,c.site_id,c.allocation_id)=(e.tenant_id,e.site_id,e.id);
