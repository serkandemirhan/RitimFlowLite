-- Supplier identities do not represent goods, supplier confirmation or stock.
CREATE TABLE outsourcing_suppliers (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 code text NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 120),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,code),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TRIGGER outsourcing_suppliers_immutable BEFORE UPDATE OR DELETE ON outsourcing_suppliers FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE outsourcing_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourcing_suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON outsourcing_suppliers USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
