-- Snapshot the rule on creation; existing production retains its original gate.
CREATE TABLE site_shipping_rules (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,allow_uninspected boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),PRIMARY KEY(tenant_id,site_id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE production_orders ADD COLUMN final_control_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE production_orders ALTER COLUMN final_control_enabled SET DEFAULT true;
ALTER TABLE production_orders ADD COLUMN allow_uninspected_shipping boolean NOT NULL DEFAULT false;
CREATE FUNCTION snapshot_shipping_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.allow_uninspected_shipping:=COALESCE((SELECT allow_uninspected FROM site_shipping_rules WHERE tenant_id=NEW.tenant_id AND site_id=NEW.site_id FOR SHARE),false);
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_shipping_rule BEFORE INSERT ON production_orders FOR EACH ROW EXECUTE FUNCTION snapshot_shipping_rule();
CREATE TABLE final_control_tasks (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 work_order_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,id) REFERENCES production_orders(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id)
);
CREATE FUNCTION create_final_control_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='complete' AND NEW.production_order_id IS NOT NULL AND NEW.purpose='normal'
 AND EXISTS(SELECT 1 FROM production_orders p WHERE (p.tenant_id,p.site_id,p.id)=(NEW.tenant_id,NEW.site_id,NEW.production_order_id) AND p.final_control_enabled AND p.cancelled_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM work_orders w WHERE (w.tenant_id,w.site_id,w.production_order_id)=(NEW.tenant_id,NEW.site_id,NEW.production_order_id) AND w.purpose='normal' AND w.status<>'complete')
 AND NOT EXISTS(SELECT 1 FROM operations op JOIN operations last_op ON (last_op.tenant_id,last_op.site_id,last_op.id)=(NEW.tenant_id,NEW.site_id,NEW.operation_id) WHERE (op.tenant_id,op.site_id,op.production_order_id)=(NEW.tenant_id,NEW.site_id,NEW.production_order_id) AND op.sequence>last_op.sequence)
 THEN INSERT INTO final_control_tasks(tenant_id,site_id,order_id,id,work_order_id) VALUES(NEW.tenant_id,NEW.site_id,NEW.order_id,NEW.production_order_id,NEW.id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER create_final_control_task AFTER UPDATE OF status ON work_orders FOR EACH ROW EXECUTE FUNCTION create_final_control_task();
CREATE TABLE shipping_quality_bypasses (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,allocation_id uuid NOT NULL,
 output_lot_id uuid NOT NULL,work_order_id uuid NOT NULL,production_event_id uuid NOT NULL,
 quantity_pieces bigint NOT NULL CHECK(quantity_pieces>0),actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,site_id,allocation_id),
 FOREIGN KEY(tenant_id,site_id,order_id,allocation_id) REFERENCES shipping_events(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,output_lot_id) REFERENCES production_output_lots(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id)
);
CREATE INDEX shipping_quality_bypasses_event ON shipping_quality_bypasses(tenant_id,site_id,production_event_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['site_shipping_rules','final_control_tasks','shipping_quality_bypasses'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ritim_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['final_control_tasks','shipping_quality_bypasses'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;

DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.snapshot_shipping_rule() SET search_path=pg_catalog,%I,pg_temp',sch,sch);
 EXECUTE format('ALTER FUNCTION %I.create_final_control_task() SET search_path=pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION snapshot_shipping_rule(),create_final_control_task() FROM PUBLIC;
