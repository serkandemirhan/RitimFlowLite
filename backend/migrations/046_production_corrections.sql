-- Original production and stock history stays immutable. Approved corrections
-- reduce an uninspected entry through scoped, invoker-rights read projections.
CREATE TABLE production_correction_requests (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 work_order_id uuid NOT NULL, production_event_id uuid NOT NULL,
 original_quantity bigint NOT NULL CHECK(original_quantity>0),
 quantity bigint NOT NULL CHECK(quantity>=0 AND quantity<original_quantity),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,production_event_id) REFERENCES production_events(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id)
);
CREATE TABLE production_correction_decisions (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, request_id uuid NOT NULL,
 approved boolean NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,request_id),
 FOREIGN KEY(tenant_id,site_id,request_id) REFERENCES production_correction_requests(tenant_id,site_id,id)
);
CREATE INDEX production_correction_event ON production_correction_requests(tenant_id,site_id,production_event_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['production_correction_requests','production_correction_decisions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY correction_scope ON %I USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id))',t);
  EXECUTE format('CREATE TRIGGER correction_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
DO $$ DECLARE t text; columns text; event_column text; BEGIN
 FOREACH t IN ARRAY ARRAY['production_events','production_ledger'] LOOP
  event_column:=CASE WHEN t='production_events' THEN 'id' ELSE 'production_event_id' END;
  SELECT string_agg(CASE WHEN a.attname='quantity_pieces' THEN
   'COALESCE((SELECT r.quantity FROM production_correction_requests r JOIN production_correction_decisions d ON (d.tenant_id,d.site_id,d.request_id)=(r.tenant_id,r.site_id,r.id) WHERE r.tenant_id=p.tenant_id AND r.site_id=p.site_id AND r.production_event_id=p.'||quote_ident(event_column)||' AND d.approved ORDER BY d.created_at DESC,r.id DESC LIMIT 1),p.quantity_pieces) AS quantity_pieces'
   ELSE 'p.'||quote_ident(a.attname) END,',' ORDER BY a.attnum)
   INTO columns FROM pg_attribute a WHERE a.attrelid=t::regclass AND a.attnum>0 AND NOT a.attisdropped;
  EXECUTE format('CREATE VIEW %I WITH (security_invoker=true) AS SELECT * FROM (SELECT %s FROM %I p) effective WHERE quantity_pieces>0','effective_'||t,columns,t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC','effective_'||t);
 END LOOP;
END $$;
