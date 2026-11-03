CREATE TABLE outsourcing_jobs (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 operation_id uuid NOT NULL,supplier_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,operation_id) REFERENCES operations(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,supplier_id) REFERENCES outsourcing_suppliers(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TABLE outsourcing_dispatches (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,output_lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,job_id) REFERENCES outsourcing_jobs(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TABLE outsourcing_returns (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,dispatch_id uuid NOT NULL,input_lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,dispatch_id) REFERENCES outsourcing_dispatches(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,input_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TABLE outsourcing_inspections (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,return_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('approved','rejected')),quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),evidence text NOT NULL CHECK(length(trim(evidence)) BETWEEN 1 AND 120),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,return_id) REFERENCES outsourcing_returns(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['outsourcing_jobs','outsourcing_dispatches','outsourcing_returns','outsourcing_inspections'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t||'_immutable',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;
