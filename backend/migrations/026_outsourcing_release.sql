CREATE TABLE outsourcing_releases (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,return_id uuid NOT NULL,destination_work_order_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,destination_work_order_id),
 FOREIGN KEY(tenant_id,site_id,order_id,return_id) REFERENCES outsourcing_returns(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,destination_work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TRIGGER outsourcing_releases_immutable BEFORE UPDATE OR DELETE ON outsourcing_releases FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE outsourcing_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourcing_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON outsourcing_releases USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
