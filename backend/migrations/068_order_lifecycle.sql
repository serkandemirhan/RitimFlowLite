-- Removal is a tombstone; order and production history retain their identities.
ALTER TABLE order_items ADD COLUMN removed_at timestamptz;
CREATE TABLE production_order_replacements (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,
 previous_id uuid NOT NULL,next_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 120),
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,previous_id),UNIQUE(tenant_id,site_id,next_id),
 CHECK(previous_id<>next_id),
 FOREIGN KEY(tenant_id,site_id,order_id,previous_id) REFERENCES production_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,next_id) REFERENCES production_orders(tenant_id,site_id,order_id,id)
);
CREATE TABLE order_quantity_closures (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 120),
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,item_id),
 FOREIGN KEY(tenant_id,site_id,order_id,item_id) REFERENCES order_items(tenant_id,site_id,order_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['production_order_replacements','order_quantity_closures'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
