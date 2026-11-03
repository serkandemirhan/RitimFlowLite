-- Append-only encrypted workflow revisions; unresolved history is not automatically deleted.
CREATE TABLE recovery_workflow_revisions (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 workflow_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK(status IN ('active','completed')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 key_version text NOT NULL CHECK(length(key_version) BETWEEN 1 AND 80),
 iv bytea NOT NULL CHECK(octet_length(iv)=12),tag bytea NOT NULL CHECK(octet_length(tag)=16),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)<=32768),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,actor_id,workflow_id,revision),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE recovery_workflow_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_workflow_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_scope ON recovery_workflow_revisions USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
CREATE POLICY workflow_actor ON recovery_workflow_revisions AS RESTRICTIVE USING (actor_id::text=current_setting('ritim.actor',true)) WITH CHECK (actor_id::text=current_setting('ritim.actor',true));
REVOKE ALL ON recovery_workflow_revisions FROM PUBLIC;
