-- Shipping is separate from the historical order-bound shipments model.
ALTER TABLE production_output_lots ADD CONSTRAINT shipping_output_identity UNIQUE(tenant_id,site_id,order_id,id);
CREATE TABLE shipping_orders (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TABLE shipping_events (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 sequence bigint GENERATED ALWAYS AS IDENTITY, shipping_order_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('allocate','dispatch','deliver')),
 allocation_id uuid NOT NULL, dispatch_id uuid, output_lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((event_type='allocate' AND allocation_id=id AND dispatch_id IS NULL) OR
       (event_type='dispatch' AND allocation_id<>id AND dispatch_id=id) OR
       (event_type='deliver' AND allocation_id<>id AND dispatch_id IS NOT NULL AND dispatch_id<>id)),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(sequence),
 UNIQUE(tenant_id,site_id,order_id,shipping_order_id,id,output_lot_id),
 FOREIGN KEY(tenant_id,site_id,order_id,shipping_order_id) REFERENCES shipping_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,shipping_order_id,allocation_id,output_lot_id) REFERENCES shipping_events(tenant_id,site_id,order_id,shipping_order_id,id,output_lot_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,site_id,order_id,shipping_order_id,dispatch_id,output_lot_id) REFERENCES shipping_events(tenant_id,site_id,order_id,shipping_order_id,id,output_lot_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE INDEX shipping_events_order_idx ON shipping_events(tenant_id,site_id,order_id,sequence);
CREATE TRIGGER shipping_orders_immutable BEFORE UPDATE OR DELETE ON shipping_orders FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER shipping_events_immutable BEFORE UPDATE OR DELETE ON shipping_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shipping_orders','shipping_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;
