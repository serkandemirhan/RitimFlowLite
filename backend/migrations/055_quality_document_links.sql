CREATE TABLE quality_document_links (
 tenant_id uuid NOT NULL,
 site_id uuid NOT NULL,
 decision_id uuid NOT NULL,
 document_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,site_id,decision_id,document_id),
 FOREIGN KEY(tenant_id,site_id,decision_id) REFERENCES output_dispositions(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,document_id) REFERENCES work_documents(tenant_id,site_id,id) ON DELETE CASCADE
);
ALTER TABLE quality_document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_document_links FORCE ROW LEVEL SECURITY;
CREATE POLICY quality_document_links_scope ON quality_document_links USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE FUNCTION ritim_audit_actor_name(p_tenant uuid,p_site uuid,p_event uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT u.display_name FROM audit_events a JOIN users u ON u.id=a.actor_id
 WHERE a.tenant_id=p_tenant AND a.site_id=p_site AND a.id=p_event AND ritim_scope_matches(p_tenant,p_site)
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_audit_actor_name(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_audit_actor_name(uuid,uuid,uuid) FROM PUBLIC;
