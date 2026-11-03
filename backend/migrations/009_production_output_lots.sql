-- Output identity is per production event; input lot IDs retain their original meaning.
CREATE TABLE production_output_lots (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 work_order_id uuid NOT NULL, production_event_id uuid NOT NULL, input_lot_id uuid NOT NULL,
 consume_ledger_id uuid NOT NULL, output_ledger_id uuid NOT NULL,
 consume_kind text NOT NULL DEFAULT 'consume' CHECK (consume_kind='consume'),
 output_kind text NOT NULL CHECK (output_kind IN ('good','pending')),
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (id <> input_lot_id), CHECK (consume_ledger_id <> output_ledger_id),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,production_event_id),
 UNIQUE(tenant_id,site_id,order_id,id,work_order_id,production_event_id,input_lot_id,output_ledger_id,output_kind),
 FOREIGN KEY(tenant_id,site_id,order_id,consume_ledger_id,work_order_id,input_lot_id,production_event_id,consume_kind)
 REFERENCES production_ledger(tenant_id,site_id,order_id,id,work_order_id,lot_id,production_event_id,kind),
 FOREIGN KEY(tenant_id,site_id,order_id,output_ledger_id,work_order_id,input_lot_id,production_event_id,output_kind)
 REFERENCES production_ledger(tenant_id,site_id,order_id,id,work_order_id,lot_id,production_event_id,kind)
);
CREATE TRIGGER production_output_lots_immutable BEFORE UPDATE OR DELETE ON production_output_lots FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE production_output_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_output_lots FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON production_output_lots USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
ALTER TABLE output_dispositions ADD COLUMN output_lot_id uuid;
ALTER TABLE output_dispositions ADD CONSTRAINT disposition_output_lot_context FOREIGN KEY
 (tenant_id,site_id,order_id,output_lot_id,work_order_id,production_event_id,lot_id,output_ledger_id,output_kind)
 REFERENCES production_output_lots(tenant_id,site_id,order_id,id,work_order_id,production_event_id,input_lot_id,output_ledger_id,output_kind);
