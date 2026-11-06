ALTER TABLE work_orders ADD COLUMN purpose text NOT NULL DEFAULT 'normal' CHECK(purpose IN ('normal','rework'));
DROP INDEX production_operation_job;
CREATE UNIQUE INDEX production_operation_job ON work_orders(tenant_id,site_id,production_order_id,operation_id) WHERE production_order_id IS NOT NULL AND purpose='normal';
CREATE TABLE production_compensations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 production_event_id uuid,disposition_id uuid,rma_disposition_id uuid,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 120),actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(production_event_id,disposition_id,rma_disposition_id)=1),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,production_event_id) REFERENCES production_events(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,disposition_id) REFERENCES output_dispositions(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,rma_disposition_id) REFERENCES rma_dispositions(tenant_id,site_id,order_id,id)
);
ALTER TABLE production_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_compensations FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON production_compensations USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE TRIGGER immutable_production_compensations BEFORE UPDATE OR DELETE ON production_compensations FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE production_orders ADD COLUMN compensation_id uuid;
ALTER TABLE production_orders ADD FOREIGN KEY(tenant_id,site_id,order_id,compensation_id) REFERENCES production_compensations(tenant_id,site_id,order_id,id);
