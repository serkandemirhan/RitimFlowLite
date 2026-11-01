-- Warehouse quantities are separate from order-bound physical and production ledgers.
CREATE TABLE inventory_materials (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 code text NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 120),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 240),
 base_unit text NOT NULL CHECK(base_unit IN ('piece','kg','m','bar')),
 lot_tracking boolean NOT NULL DEFAULT true,
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,code),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE inventory_locations (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('plant','warehouse','region','container')),
 code text NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 120),
 parent_id uuid, parent_kind text,
 CHECK((kind='plant' AND parent_id IS NULL AND parent_kind IS NULL) OR
       (kind='warehouse' AND parent_id IS NOT NULL AND parent_kind IS NOT NULL AND parent_kind='plant') OR
       (kind='region' AND parent_id IS NOT NULL AND parent_kind IS NOT NULL AND parent_kind='warehouse') OR
       (kind='container' AND parent_id IS NOT NULL AND parent_kind IS NOT NULL AND parent_kind='region')),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,id,kind),
 UNIQUE(tenant_id,site_id,kind,code),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
 FOREIGN KEY(tenant_id,site_id,parent_id,parent_kind) REFERENCES inventory_locations(tenant_id,site_id,id,kind)
);
CREATE TABLE inventory_lots (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, material_id uuid NOT NULL,
 lot_code text NOT NULL CHECK(length(trim(lot_code)) BETWEEN 1 AND 120),
 supplier_ref text NOT NULL CHECK(length(trim(supplier_ref)) BETWEEN 1 AND 120),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,id,material_id),
 UNIQUE(tenant_id,site_id,material_id,lot_code),
 FOREIGN KEY(tenant_id,site_id,material_id) REFERENCES inventory_materials(tenant_id,site_id,id)
);
CREATE TABLE inventory_movements (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, lot_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','move','pick','scrap')),
 source_location_id uuid, destination_location_id uuid,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='receipt' AND source_location_id IS NULL AND destination_location_id IS NOT NULL) OR
       (kind='move' AND source_location_id IS NOT NULL AND destination_location_id IS NOT NULL AND source_location_id<>destination_location_id) OR
       (kind IN ('pick','scrap') AND source_location_id IS NOT NULL AND destination_location_id IS NULL)),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,actor_id,idempotency_key),
 FOREIGN KEY(tenant_id,site_id,lot_id) REFERENCES inventory_lots(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,source_location_id) REFERENCES inventory_locations(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,destination_location_id) REFERENCES inventory_locations(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE INDEX inventory_movement_lot_idx ON inventory_movements(tenant_id,site_id,lot_id,occurred_at,id);
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_materials','inventory_locations','inventory_lots','inventory_movements'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;

-- Pick provenance joins warehouse debit to the existing order-bound production ledger.
CREATE TABLE inventory_picks (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 movement_id uuid NOT NULL, order_id uuid NOT NULL, work_order_id uuid NOT NULL,
 production_lot_id uuid NOT NULL, reservation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,movement_id),
 UNIQUE(tenant_id,site_id,production_lot_id), UNIQUE(tenant_id,site_id,reservation_id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,production_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,reservation_id) REFERENCES reservations(tenant_id,site_id,id)
);
ALTER TABLE inventory_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_picks FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON inventory_picks USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
CREATE TRIGGER inventory_picks_immutable BEFORE UPDATE OR DELETE ON inventory_picks FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE inventory_movements ADD COLUMN document_ref text;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_receipt_document CHECK (kind <> 'receipt' OR (document_ref IS NOT NULL AND length(trim(document_ref)) BETWEEN 1 AND 120));
CREATE UNIQUE INDEX inventory_receipt_document_idx ON inventory_movements(tenant_id,site_id,document_ref) WHERE kind='receipt';
