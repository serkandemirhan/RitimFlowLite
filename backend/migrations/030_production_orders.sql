-- Add the production batch boundary without reclassifying historical work orders.
CREATE TABLE production_orders (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 number text NOT NULL CHECK(length(trim(number)) BETWEEN 1 AND 100),
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
 planning_state text NOT NULL DEFAULT 'unplanned' CHECK(planning_state IN ('unplanned','planned','held')),
 resume_state text CHECK(resume_state IN ('unplanned','planned')),
 planned_date date,hold_reason text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((planning_state='held')=(resume_state IS NOT NULL)),
 CHECK(planning_state<>'held' OR length(trim(hold_reason)) BETWEEN 1 AND 120),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),UNIQUE(tenant_id,site_id,number),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id)
);
ALTER TABLE operations ADD COLUMN production_order_id uuid;
ALTER TABLE operations DROP CONSTRAINT operations_tenant_id_site_id_order_id_sequence_key;
CREATE UNIQUE INDEX legacy_order_route_sequence ON operations(tenant_id,site_id,order_id,sequence) WHERE production_order_id IS NULL;
CREATE UNIQUE INDEX production_route_sequence ON operations(tenant_id,site_id,production_order_id,sequence) WHERE production_order_id IS NOT NULL;
ALTER TABLE operations ADD FOREIGN KEY(tenant_id,site_id,order_id,production_order_id) REFERENCES production_orders(tenant_id,site_id,order_id,id);
ALTER TABLE operations ADD UNIQUE(tenant_id,site_id,order_id,production_order_id,id);
ALTER TABLE work_orders ADD COLUMN production_order_id uuid;
ALTER TABLE work_orders ADD FOREIGN KEY(tenant_id,site_id,order_id,production_order_id) REFERENCES production_orders(tenant_id,site_id,order_id,id);
ALTER TABLE work_orders ADD FOREIGN KEY(tenant_id,site_id,order_id,production_order_id,operation_id) REFERENCES operations(tenant_id,site_id,order_id,production_order_id,id);
CREATE UNIQUE INDEX production_operation_job ON work_orders(tenant_id,site_id,production_order_id,operation_id) WHERE production_order_id IS NOT NULL;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON production_orders USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE TABLE production_supplier_events (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,production_order_id uuid NOT NULL,work_order_id uuid NOT NULL,id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('dispatch','return')),dispatch_id uuid,
 supplier_id uuid,source_output_lot_id uuid,source_material_lot_id uuid,returned_lot_id uuid,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='dispatch' AND dispatch_id IS NULL AND supplier_id IS NOT NULL AND returned_lot_id IS NULL AND ((source_output_lot_id IS NULL)<>(source_material_lot_id IS NULL))) OR (kind='return' AND dispatch_id IS NOT NULL AND supplier_id IS NULL AND returned_lot_id IS NOT NULL AND source_output_lot_id IS NULL AND source_material_lot_id IS NULL)),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,production_order_id,work_order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,production_order_id) REFERENCES production_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,production_order_id,work_order_id,dispatch_id) REFERENCES production_supplier_events(tenant_id,site_id,order_id,production_order_id,work_order_id,id),
 FOREIGN KEY(tenant_id,site_id,supplier_id) REFERENCES outsourcing_suppliers(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,source_output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,source_material_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,returned_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TRIGGER production_supplier_history BEFORE UPDATE OR DELETE ON production_supplier_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE production_supplier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_supplier_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON production_supplier_events USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
