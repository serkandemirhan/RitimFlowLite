-- Production consumption and output remain separate from physical input movement history.
CREATE UNIQUE INDEX one_active_work_assignment ON work_assignments(tenant_id,site_id,work_order_id) WHERE released_at IS NULL;
ALTER TABLE production_events ADD CONSTRAINT production_event_ledger_context UNIQUE(tenant_id,site_id,id,work_order_id,quantity_pieces,actor_id,kind);
CREATE TABLE production_ledger (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 work_order_id uuid NOT NULL,lot_id uuid NOT NULL,production_event_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('consume','good','scrap','setup_scrap','pending')),
 event_kind text NOT NULL CHECK(event_kind IN ('good','scrap','setup_scrap','pending')),
 CHECK(kind='consume' OR kind=event_kind),
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES users(id),occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,production_event_id,kind),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,production_event_id) REFERENCES production_events(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,production_event_id,work_order_id,quantity_pieces,actor_id,event_kind) REFERENCES production_events(tenant_id,site_id,id,work_order_id,quantity_pieces,actor_id,kind)
);
CREATE INDEX production_ledger_job_lot ON production_ledger(tenant_id,site_id,work_order_id,lot_id,kind);
CREATE TRIGGER production_ledger_immutable BEFORE UPDATE OR DELETE ON production_ledger FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE production_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON production_ledger USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
-- Lock assignment without giving runtime direct UPDATE privilege on assignments.
CREATE FUNCTION ritim_lock_assignments(p_tenant uuid,p_site uuid,p_job uuid)
RETURNS TABLE(machine_id uuid,user_id uuid) LANGUAGE sql SECURITY DEFINER AS $$
 SELECT a.machine_id,a.user_id FROM work_assignments a
 WHERE a.tenant_id=p_tenant AND a.site_id=p_site AND a.work_order_id=p_job AND a.released_at IS NULL ORDER BY a.id FOR SHARE
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_lock_assignments(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_lock_assignments(uuid,uuid,uuid) FROM PUBLIC;
