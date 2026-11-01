-- A binding records a dedicated physical input derived from a classified output.
CREATE TABLE rework_inputs (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 allocation_id uuid NOT NULL, work_order_id uuid NOT NULL, input_lot_id uuid NOT NULL,
 source_output_lot_id uuid NOT NULL, quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,allocation_id), UNIQUE(tenant_id,site_id,work_order_id),
 FOREIGN KEY(tenant_id,site_id,order_id,allocation_id) REFERENCES rework_allocations(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,input_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,source_output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TRIGGER rework_inputs_immutable BEFORE UPDATE OR DELETE ON rework_inputs FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE rework_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rework_inputs FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON rework_inputs USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
