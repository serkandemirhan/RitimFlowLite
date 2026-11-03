-- Cross-operation movements are independent of B03C same-operation transfers.
ALTER TABLE output_reservation_events ADD CONSTRAINT dispatch_reservation_context UNIQUE (tenant_id,site_id,order_id,id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id,event_type);
ALTER TABLE production_output_lots ADD CONSTRAINT dispatch_output_genealogy UNIQUE (tenant_id,site_id,order_id,id,input_lot_id);
ALTER TABLE lots ADD CONSTRAINT operation_lot_genealogy UNIQUE (tenant_id,site_id,order_id,id,kind,originating_lot_id);
CREATE TABLE operation_dispatches (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 reservation_id uuid NOT NULL,reservation_type text NOT NULL DEFAULT 'reserve' CHECK(reservation_type='reserve'),
 output_lot_id uuid NOT NULL,production_event_id uuid NOT NULL,source_input_lot_id uuid NOT NULL,
 source_work_order_id uuid NOT NULL,destination_work_order_id uuid NOT NULL,destination_operation_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 UNIQUE(tenant_id,site_id,order_id,id,output_lot_id,source_input_lot_id,destination_work_order_id,destination_operation_id),
 FOREIGN KEY(tenant_id,site_id,order_id,reservation_id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id,reservation_type) REFERENCES output_reservation_events(tenant_id,site_id,order_id,id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id,event_type),
 FOREIGN KEY(tenant_id,site_id,order_id,output_lot_id,source_input_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id,input_lot_id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE TABLE operation_receipts (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,dispatch_id uuid NOT NULL,
 output_lot_id uuid NOT NULL,source_input_lot_id uuid NOT NULL,destination_work_order_id uuid NOT NULL,destination_operation_id uuid NOT NULL,
 input_lot_id uuid NOT NULL,input_lot_kind text NOT NULL DEFAULT 'operation' CHECK(input_lot_kind='operation'),
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,input_lot_id),CHECK(input_lot_id<>source_input_lot_id),
 FOREIGN KEY(tenant_id,site_id,order_id,dispatch_id,output_lot_id,source_input_lot_id,destination_work_order_id,destination_operation_id) REFERENCES operation_dispatches(tenant_id,site_id,order_id,id,output_lot_id,source_input_lot_id,destination_work_order_id,destination_operation_id),
 FOREIGN KEY(tenant_id,site_id,order_id,input_lot_id,input_lot_kind,source_input_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id,kind,originating_lot_id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key)
);
CREATE INDEX operation_dispatch_reservation ON operation_dispatches(tenant_id,site_id,reservation_id);
CREATE INDEX operation_receipt_dispatch ON operation_receipts(tenant_id,site_id,dispatch_id);
CREATE TRIGGER operation_dispatch_immutable BEFORE UPDATE OR DELETE ON operation_dispatches FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER operation_receipt_immutable BEFORE UPDATE OR DELETE ON operation_receipts FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE operation_dispatches ENABLE ROW LEVEL SECURITY; ALTER TABLE operation_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON operation_dispatches USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
ALTER TABLE operation_receipts ENABLE ROW LEVEL SECURITY; ALTER TABLE operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON operation_receipts USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
