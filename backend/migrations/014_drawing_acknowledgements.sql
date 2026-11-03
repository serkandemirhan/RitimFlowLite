-- Publication is explicit: historical revisions do not implicitly become active.
ALTER TABLE drawing_revisions ADD CONSTRAINT drawing_revision_order_context UNIQUE(tenant_id,site_id,order_id,id);
CREATE TRIGGER drawing_revisions_immutable BEFORE UPDATE OR DELETE ON drawing_revisions FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TABLE drawing_publications (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,
 revision_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),audit_id uuid NOT NULL,
 sequence bigint GENERATED ALWAYS AS IDENTITY,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),UNIQUE(tenant_id,site_id,order_id,id,revision_id),
 FOREIGN KEY(tenant_id,site_id,order_id,revision_id) REFERENCES drawing_revisions(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,audit_id) REFERENCES audit_events(tenant_id,site_id,id)
);
CREATE TABLE drawing_acknowledgements (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,id uuid NOT NULL,work_order_id uuid NOT NULL,
 publication_id uuid NOT NULL,revision_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),audit_id uuid NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,site_id,id),
 UNIQUE(tenant_id,site_id,work_order_id,publication_id,actor_id),
 FOREIGN KEY(tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
 FOREIGN KEY(tenant_id,site_id,order_id,publication_id,revision_id) REFERENCES drawing_publications(tenant_id,site_id,order_id,id,revision_id),
 FOREIGN KEY(tenant_id,site_id,audit_id) REFERENCES audit_events(tenant_id,site_id,id)
);
CREATE INDEX drawing_publications_current ON drawing_publications(tenant_id,site_id,order_id,sequence DESC);
CREATE TRIGGER drawing_publications_immutable BEFORE UPDATE OR DELETE ON drawing_publications FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER drawing_acknowledgements_immutable BEFORE UPDATE OR DELETE ON drawing_acknowledgements FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE drawing_publications ENABLE ROW LEVEL SECURITY; ALTER TABLE drawing_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE drawing_acknowledgements ENABLE ROW LEVEL SECURITY; ALTER TABLE drawing_acknowledgements FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON drawing_publications USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE POLICY ritim_scope ON drawing_acknowledgements USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
-- Uploaded fictional development drawings are immutable and delivered by this API.
CREATE TABLE drawing_documents (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,order_id uuid NOT NULL,revision_id uuid NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 8 AND 5242880),
 PRIMARY KEY(tenant_id,site_id,revision_id),
 FOREIGN KEY(tenant_id,site_id,order_id,revision_id) REFERENCES drawing_revisions(tenant_id,site_id,order_id,id)
);
CREATE TRIGGER drawing_documents_immutable BEFORE UPDATE OR DELETE ON drawing_documents FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE drawing_documents ENABLE ROW LEVEL SECURITY; ALTER TABLE drawing_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON drawing_documents USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
ALTER TABLE drawing_publications ADD CONSTRAINT drawing_publication_document_fk
 FOREIGN KEY(tenant_id,site_id,revision_id) REFERENCES drawing_documents(tenant_id,site_id,revision_id);
