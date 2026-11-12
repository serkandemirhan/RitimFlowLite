CREATE TABLE stock_units (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,code text NOT NULL CHECK(length(code) BETWEEN 1 AND 16),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),fractional boolean NOT NULL DEFAULT true,
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,code),FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE sites NO FORCE ROW LEVEL SECURITY;
INSERT INTO stock_units SELECT tenant_id,id,gen_random_uuid(),u.code,u.name,u.fractional FROM sites CROSS JOIN (VALUES('piece','Adet',false),('kg','Kilogram',true),('m','Metre',true),('bar','Boy',false)) u(code,name,fractional);
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
ALTER TABLE master_parts ADD COLUMN card_type text NOT NULL DEFAULT 'product' CHECK(card_type IN ('raw','semi','product'));
ALTER TABLE master_parts ADD COLUMN stock_unit_id uuid;
ALTER TABLE master_parts ADD FOREIGN KEY(tenant_id,site_id,stock_unit_id) REFERENCES stock_units(tenant_id,site_id,id);
ALTER TABLE inventory_materials ADD COLUMN part_id uuid;
ALTER TABLE inventory_materials ADD FOREIGN KEY(tenant_id,site_id,part_id) REFERENCES master_parts(tenant_id,site_id,id);
CREATE UNIQUE INDEX inventory_material_part_idx ON inventory_materials(tenant_id,site_id,part_id) WHERE part_id IS NOT NULL;
ALTER TABLE inventory_materials DROP CONSTRAINT inventory_materials_base_unit_check;
ALTER TABLE inventory_materials ADD COLUMN unit_id uuid;
ALTER TABLE inventory_materials ADD FOREIGN KEY(tenant_id,site_id,unit_id) REFERENCES stock_units(tenant_id,site_id,id);
ALTER TABLE inventory_materials NO FORCE ROW LEVEL SECURITY;
UPDATE inventory_materials m SET unit_id=u.id FROM stock_units u WHERE (u.tenant_id,u.site_id,u.code)=(m.tenant_id,m.site_id,m.base_unit);
ALTER TABLE inventory_materials FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ALTER COLUMN quantity_pieces TYPE numeric(22,6);
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_quantity_pieces_check;
ALTER TABLE inventory_movements ADD CHECK(quantity_pieces>0 AND quantity_pieces<=9007199254740991);
ALTER TABLE inventory_lots ADD COLUMN owner_customer_id uuid;
ALTER TABLE inventory_lots DROP CONSTRAINT inventory_lots_supplier_ref_check;
ALTER TABLE inventory_lots ADD CHECK(length(supplier_ref)<=120);
ALTER TABLE inventory_lots ADD FOREIGN KEY(tenant_id,site_id,owner_customer_id) REFERENCES master_customers(tenant_id,site_id,id);
ALTER TABLE inventory_lots ADD COLUMN expected_production_id uuid;
ALTER TABLE inventory_lots ADD FOREIGN KEY(tenant_id,site_id,expected_production_id) REFERENCES production_orders(tenant_id,site_id,id);
ALTER TABLE inventory_lots ADD COLUMN incoming_quality_required boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX stock_lot_auto_code_idx ON inventory_lots(tenant_id,site_id,lot_code) WHERE lot_code ~ '^LOT-.*-[0-9]{6,}$';
CREATE TABLE inventory_lot_inspections (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,lot_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('approved','rejected')),quantity numeric(20,6) NOT NULL CHECK(quantity>0),
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,lot_id) REFERENCES inventory_lots(tenant_id,site_id,id)
);
CREATE TABLE raw_material_issues (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,movement_id uuid NOT NULL,
 lot_id uuid NOT NULL,production_order_id uuid NOT NULL,work_order_id uuid NOT NULL,
 quantity numeric(20,6) NOT NULL CHECK(quantity>0),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,movement_id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,lot_id) REFERENCES inventory_lots(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,production_order_id) REFERENCES production_orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id)
);
CREATE TABLE raw_material_returns (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,issue_id uuid NOT NULL,movement_id uuid NOT NULL,
 quantity numeric(20,6) NOT NULL CHECK(quantity>0),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,movement_id),
 FOREIGN KEY(tenant_id,site_id,issue_id) REFERENCES raw_material_issues(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id)
);
CREATE TABLE raw_material_authorizations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,work_order_id uuid NOT NULL,lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces>0),readiness text NOT NULL CHECK(readiness IN ('missing','partial','ready')),
 PRIMARY KEY(tenant_id,site_id,work_order_id),
 FOREIGN KEY(tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,lot_id) REFERENCES lots(tenant_id,site_id,id)
);
CREATE TABLE stock_lot_sequences (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,owner_key text NOT NULL,material_id uuid NOT NULL,last_number bigint NOT NULL CHECK(last_number>0),
 PRIMARY KEY(tenant_id,site_id,owner_key,material_id),FOREIGN KEY(tenant_id,site_id,material_id) REFERENCES inventory_materials(tenant_id,site_id,id)
);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['stock_units','inventory_lot_inspections','raw_material_issues','raw_material_returns','raw_material_authorizations','stock_lot_sequences'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['inventory_lot_inspections','raw_material_issues','raw_material_returns'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
