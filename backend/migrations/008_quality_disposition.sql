-- Each classification refers to the reconciled output ledger row and its exact context.
ALTER TABLE production_ledger ADD CONSTRAINT production_ledger_output_context UNIQUE
 (tenant_id,site_id,order_id,id,work_order_id,lot_id,production_event_id,kind);
CREATE TABLE output_dispositions (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
 output_ledger_id uuid NOT NULL, work_order_id uuid NOT NULL, lot_id uuid NOT NULL,
 production_event_id uuid NOT NULL, output_kind text NOT NULL CHECK (output_kind IN ('good','pending')),
 outcome text NOT NULL CHECK (outcome IN ('approved','rejected','rework')),
 quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
 evidence text NOT NULL CHECK(length(trim(evidence)) BETWEEN 1 AND 120),
 actor_id uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,output_ledger_id,work_order_id,lot_id,production_event_id,output_kind)
 REFERENCES production_ledger(tenant_id,site_id,order_id,id,work_order_id,lot_id,production_event_id,kind)
);
CREATE INDEX output_dispositions_event ON output_dispositions(tenant_id,site_id,production_event_id);
CREATE TRIGGER output_dispositions_immutable BEFORE UPDATE OR DELETE ON output_dispositions FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE output_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE output_dispositions FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON output_dispositions USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
