ALTER TABLE orders NO FORCE ROW LEVEL SECURITY;
ALTER TABLE production_orders NO FORCE ROW LEVEL SECURITY;
CREATE TABLE order_items (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 line_number integer NOT NULL CHECK(line_number>0),part_id uuid,part_number text,part_name text,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),due_date date,
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),UNIQUE(tenant_id,site_id,order_id,line_number),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,part_id) REFERENCES master_parts(tenant_id,site_id,id)
);
INSERT INTO order_items(tenant_id,site_id,order_id,id,line_number,part_id,part_number,part_name,quantity,due_date)
 SELECT tenant_id,site_id,id,id,1,part_id,part_number,part_name,ordered_qty,due_date FROM orders;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON order_items USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
ALTER TABLE orders ADD COLUMN itemized boolean NOT NULL DEFAULT false;
ALTER TABLE production_orders ADD COLUMN order_item_id uuid;
UPDATE production_orders SET order_item_id=order_id;
ALTER TABLE production_orders ALTER COLUMN order_item_id SET NOT NULL;
ALTER TABLE production_orders ADD FOREIGN KEY(tenant_id,site_id,order_id,order_item_id) REFERENCES order_items(tenant_id,site_id,order_id,id);
CREATE INDEX production_orders_item ON production_orders(tenant_id,site_id,order_item_id);
-- Compatibility for existing single-product clients and persisted command replays.
CREATE FUNCTION ritim_single_order_item() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT NEW.itemized THEN
  INSERT INTO order_items(tenant_id,site_id,order_id,id,line_number,part_id,part_number,part_name,quantity,due_date)
  VALUES(NEW.tenant_id,NEW.site_id,NEW.id,NEW.id,1,NEW.part_id,NEW.part_number,NEW.part_name,NEW.ordered_qty,NEW.due_date)
  ON CONFLICT(tenant_id,site_id,id) DO UPDATE SET part_id=EXCLUDED.part_id,part_number=EXCLUDED.part_number,part_name=EXCLUDED.part_name,quantity=EXCLUDED.quantity,due_date=EXCLUDED.due_date;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER orders_single_item AFTER INSERT OR UPDATE OF part_id,part_number,part_name,ordered_qty,due_date ON orders FOR EACH ROW EXECUTE FUNCTION ritim_single_order_item();
CREATE FUNCTION ritim_production_order_item() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.order_item_id IS NULL THEN
  SELECT id INTO NEW.order_item_id FROM order_items WHERE tenant_id=NEW.tenant_id AND site_id=NEW.site_id AND order_id=NEW.order_id
  AND NOT EXISTS(SELECT 1 FROM order_items x WHERE x.tenant_id=NEW.tenant_id AND x.site_id=NEW.site_id AND x.order_id=NEW.order_id AND x.line_number>1);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER production_orders_item BEFORE INSERT ON production_orders FOR EACH ROW EXECUTE FUNCTION ritim_production_order_item();
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE production_orders FORCE ROW LEVEL SECURITY;
