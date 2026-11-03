ALTER TABLE production_output_lots ADD CONSTRAINT output_reservation_source UNIQUE(tenant_id,site_id,order_id,id,work_order_id,production_event_id);
ALTER TABLE work_orders ADD CONSTRAINT output_reservation_destination UNIQUE(tenant_id,site_id,order_id,id,operation_id);
CREATE TABLE output_reservation_events (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 event_sequence bigint GENERATED ALWAYS AS IDENTITY,
 event_type text NOT NULL CHECK(event_type IN ('reserve','release')),
 reservation_id uuid NOT NULL,output_lot_id uuid NOT NULL,production_event_id uuid NOT NULL,
 source_work_order_id uuid NOT NULL,destination_work_order_id uuid NOT NULL,destination_operation_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((event_type='reserve' AND reservation_id=id) OR (event_type='release' AND reservation_id<>id)),
 CHECK(source_work_order_id<>destination_work_order_id),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(event_sequence),
 UNIQUE(tenant_id,site_id,order_id,id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id),
 FOREIGN KEY(tenant_id,site_id,actor_id,idempotency_key) REFERENCES idempotency_records(tenant_id,site_id,actor_id,key),
 FOREIGN KEY(tenant_id,site_id,order_id,output_lot_id,source_work_order_id,production_event_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id,work_order_id,production_event_id),
 FOREIGN KEY(tenant_id,site_id,order_id,destination_work_order_id,destination_operation_id) REFERENCES work_orders(tenant_id,site_id,order_id,id,operation_id),
 FOREIGN KEY(tenant_id,site_id,order_id,reservation_id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id)
 REFERENCES output_reservation_events(tenant_id,site_id,order_id,id,output_lot_id,production_event_id,source_work_order_id,destination_work_order_id,destination_operation_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX output_reservation_lot_order ON output_reservation_events(tenant_id,site_id,order_id,output_lot_id,event_sequence);
CREATE TRIGGER output_reservation_history BEFORE UPDATE OR DELETE ON output_reservation_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE output_reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE output_reservation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON output_reservation_events USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
