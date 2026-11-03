-- Encrypted recovery metadata is tenant/site and actor scoped. Unresolved records are never automatically deleted.
CREATE TABLE pending_recovery_commands (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 id uuid NOT NULL, idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 80),
 capability text NOT NULL CHECK (length(capability) BETWEEN 1 AND 80),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
 key_version text NOT NULL CHECK (length(key_version) BETWEEN 1 AND 80),
 iv bytea NOT NULL CHECK (octet_length(iv)=12), tag bytea NOT NULL CHECK (octet_length(tag)=16),
 ciphertext bytea NOT NULL CHECK (octet_length(ciphertext)<=32768),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days'),
 PRIMARY KEY (tenant_id,site_id,actor_id,id),
 UNIQUE (tenant_id,site_id,actor_id,idempotency_key),
 FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE pending_recovery_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_recovery_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_scope ON pending_recovery_commands USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
CREATE POLICY recovery_actor ON pending_recovery_commands AS RESTRICTIVE USING (actor_id::text=current_setting('ritim.actor',true)) WITH CHECK (actor_id::text=current_setting('ritim.actor',true));
REVOKE ALL ON pending_recovery_commands FROM PUBLIC;
