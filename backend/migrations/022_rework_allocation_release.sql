-- A release reverses an allocation claim; it is not a physical stock movement.
ALTER TABLE rework_allocations ADD CONSTRAINT rework_allocation_order_identity UNIQUE(tenant_id,site_id,order_id,id);
CREATE TABLE rework_allocation_releases (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 allocation_id uuid NOT NULL, quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,allocation_id) REFERENCES rework_allocations(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE INDEX rework_releases_allocation ON rework_allocation_releases(tenant_id,site_id,allocation_id);
CREATE TRIGGER rework_releases_immutable BEFORE UPDATE OR DELETE ON rework_allocation_releases FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE rework_allocation_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE rework_allocation_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON rework_allocation_releases USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
