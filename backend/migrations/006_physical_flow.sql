-- Append-only physical ledger. No historical production is imported as stock.
ALTER TABLE reservations ADD CONSTRAINT reservation_physical_context UNIQUE(tenant_id,site_id,order_id,work_order_id,lot_id,id);
CREATE TABLE flow_transfers (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 source_work_order_id uuid NOT NULL, destination_work_order_id uuid NOT NULL, lot_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 reason text NOT NULL CHECK(length(trim(reason))>0), actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_work_order_id<>destination_work_order_id), PRIMARY KEY(tenant_id,site_id,id),
 UNIQUE(tenant_id,site_id,order_id,id),
 UNIQUE(tenant_id,site_id,order_id,id,lot_id,quantity_pieces,source_work_order_id),
 UNIQUE(tenant_id,site_id,order_id,id,lot_id,quantity_pieces,destination_work_order_id),
 FOREIGN KEY(tenant_id,site_id,order_id,source_work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,destination_work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE physical_ledger (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 work_order_id uuid NOT NULL,lot_id uuid NOT NULL,transfer_id uuid,reservation_id uuid,
 event_type text NOT NULL CHECK(event_type IN ('receipt','dispatch','accept')),
 dispatch_job uuid GENERATED ALWAYS AS (CASE WHEN event_type='dispatch' THEN work_order_id END) STORED,
 accept_job uuid GENERATED ALWAYS AS (CASE WHEN event_type='accept' THEN work_order_id END) STORED,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK((event_type='receipt' AND reservation_id IS NOT NULL AND transfer_id IS NULL) OR (event_type IN ('dispatch','accept') AND reservation_id IS NULL AND transfer_id IS NOT NULL)),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,transfer_id,event_type),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,transfer_id) REFERENCES flow_transfers(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,reservation_id) REFERENCES reservations(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id,lot_id,reservation_id) REFERENCES reservations(tenant_id,site_id,order_id,work_order_id,lot_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,transfer_id,lot_id,quantity_pieces,dispatch_job) REFERENCES flow_transfers(tenant_id,site_id,order_id,id,lot_id,quantity_pieces,source_work_order_id),
 FOREIGN KEY(tenant_id,site_id,order_id,transfer_id,lot_id,quantity_pieces,accept_job) REFERENCES flow_transfers(tenant_id,site_id,order_id,id,lot_id,quantity_pieces,destination_work_order_id)
);
CREATE INDEX physical_ledger_job_lot ON physical_ledger(tenant_id,site_id,work_order_id,lot_id,event_type);
CREATE TRIGGER physical_ledger_immutable BEFORE UPDATE OR DELETE ON physical_ledger FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER flow_transfers_immutable BEFORE UPDATE OR DELETE ON flow_transfers FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE flow_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON flow_transfers USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
ALTER TABLE physical_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON physical_ledger USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
