CREATE TABLE master_scrap_reasons (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), code text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE UNIQUE INDEX master_scrap_reasons_name ON master_scrap_reasons(tenant_id,site_id,lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX master_scrap_reasons_code ON master_scrap_reasons(tenant_id,site_id,lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;
ALTER TABLE production_events ADD COLUMN scrap_reason_id uuid, ADD COLUMN scrap_reason_name text;
ALTER TABLE production_events ADD FOREIGN KEY(tenant_id,site_id,scrap_reason_id) REFERENCES master_scrap_reasons(tenant_id,site_id,id);
CREATE TABLE assignment_acknowledgements (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, assignment_id uuid NOT NULL,
 actor_id uuid NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,assignment_id,actor_id),
 FOREIGN KEY(tenant_id,site_id,assignment_id) REFERENCES work_assignments(tenant_id,site_id,id)
);
CREATE TABLE work_documents (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 work_order_id uuid NOT NULL, context text NOT NULL CHECK(context IN ('supplier_dispatch','supplier_return','quality')),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180), mime text NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880), sha256 text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id)
);
CREATE TABLE operation_handoff_confirmations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,source_work_order_id uuid NOT NULL,destination_work_order_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,source_work_order_id),
 FOREIGN KEY(tenant_id,site_id,source_work_order_id) REFERENCES work_orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,destination_work_order_id) REFERENCES work_orders(tenant_id,site_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['master_scrap_reasons','assignment_acknowledgements','work_documents','operation_handoff_confirmations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;
