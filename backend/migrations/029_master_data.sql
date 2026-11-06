-- Master records are scoped to a site. Deletion hides a record from new selections;
-- order snapshots and references remain available for historical traceability.
CREATE TABLE master_customers (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 code text CHECK(code IS NULL OR length(trim(code)) BETWEEN 1 AND 120),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE UNIQUE INDEX master_customers_name ON master_customers(tenant_id,site_id,lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX master_customers_code ON master_customers(tenant_id,site_id,lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;
CREATE TABLE master_parts (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 code text CHECK(code IS NULL OR length(trim(code)) BETWEEN 1 AND 120),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
-- Names may repeat when part codes distinguish different products.
CREATE UNIQUE INDEX master_parts_name_code ON master_parts(tenant_id,site_id,lower(name),coalesce(lower(code),'')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX master_parts_code ON master_parts(tenant_id,site_id,lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;
ALTER TABLE orders ADD COLUMN customer_id uuid, ADD COLUMN part_id uuid;
ALTER TABLE orders ADD FOREIGN KEY(tenant_id,site_id,customer_id) REFERENCES master_customers(tenant_id,site_id,id);
ALTER TABLE orders ADD FOREIGN KEY(tenant_id,site_id,part_id) REFERENCES master_parts(tenant_id,site_id,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['master_customers','master_parts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;
