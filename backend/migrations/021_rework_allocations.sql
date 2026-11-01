-- Allocation is a claim on a quality decision, not a physical movement or approval.
ALTER TABLE output_dispositions ADD CONSTRAINT rework_decision_order_identity UNIQUE(tenant_id,site_id,order_id,id);
CREATE TABLE rework_allocations (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 decision_id uuid NOT NULL, quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,decision_id) REFERENCES output_dispositions(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE INDEX rework_allocations_decision ON rework_allocations(tenant_id,site_id,decision_id);
CREATE TRIGGER rework_allocations_immutable BEFORE UPDATE OR DELETE ON rework_allocations FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE rework_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rework_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON rework_allocations USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
