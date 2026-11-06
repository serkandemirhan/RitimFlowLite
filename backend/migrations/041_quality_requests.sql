-- Older clients/records keep their existing automatic inspection queue behavior.
-- New operator entries explicitly request inspection in a separate command.
ALTER TABLE production_events ADD COLUMN separate_quality_request boolean NOT NULL DEFAULT false;
CREATE TABLE production_quality_requests (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,production_event_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,production_event_id),
 FOREIGN KEY(tenant_id,site_id,production_event_id) REFERENCES production_events(tenant_id,site_id,id)
);
ALTER TABLE production_quality_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_quality_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY quality_request_scope ON production_quality_requests USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE TRIGGER quality_requests_immutable BEFORE UPDATE OR DELETE ON production_quality_requests FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
REVOKE ALL ON production_quality_requests FROM PUBLIC;
