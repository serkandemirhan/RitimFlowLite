-- RMA records never rewrite delivery, quality, or ordinary stock history.
ALTER TABLE shipping_events ADD CONSTRAINT shipping_event_order_ref UNIQUE (tenant_id,site_id,order_id,id);
CREATE TABLE rma_authorizations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,delivery_id uuid NOT NULL,rma_number text NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 120),quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),UNIQUE(tenant_id,site_id,rma_number),FOREIGN KEY(tenant_id,site_id,order_id,delivery_id) REFERENCES shipping_events(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
CREATE TABLE rma_receipts (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,rma_id uuid NOT NULL,lot_id uuid NOT NULL,quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,rma_id) REFERENCES rma_authorizations(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
CREATE TABLE rma_inspections (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,receipt_id uuid NOT NULL,quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),evidence text NOT NULL CHECK(length(trim(evidence)) BETWEEN 1 AND 120),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,receipt_id) REFERENCES rma_receipts(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
CREATE TABLE rma_dispositions (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,inspection_id uuid NOT NULL,outcome text NOT NULL CHECK(outcome IN ('approved','scrap','rework')),quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,inspection_id) REFERENCES rma_inspections(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
CREATE TABLE rma_rework_inputs (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,disposition_id uuid NOT NULL,work_order_id uuid NOT NULL,input_lot_id uuid NOT NULL,source_output_lot_id uuid NOT NULL,quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,disposition_id),UNIQUE(tenant_id,site_id,work_order_id),FOREIGN KEY(tenant_id,site_id,order_id,disposition_id) REFERENCES rma_dispositions(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,input_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,source_output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
CREATE TABLE rma_releases (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,disposition_id uuid NOT NULL,quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 120),actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,order_id,disposition_id) REFERENCES rma_dispositions(tenant_id,site_id,order_id,id),FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key));
ALTER TABLE shipping_events ADD COLUMN rma_release_id uuid;
ALTER TABLE shipping_events ADD CONSTRAINT shipping_rma_release_fk FOREIGN KEY(tenant_id,site_id,order_id,rma_release_id) REFERENCES rma_releases(tenant_id,site_id,order_id,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rma_authorizations','rma_receipts','rma_inspections','rma_dispositions','rma_rework_inputs','rma_releases'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t||'_immutable',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
END $$;
