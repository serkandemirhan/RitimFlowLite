CREATE TABLE master_operations (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), code text,
 kind text NOT NULL CHECK(kind IN ('internal','external')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE UNIQUE INDEX master_operations_name ON master_operations(tenant_id,site_id,lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX master_operations_code ON master_operations(tenant_id,site_id,lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;
ALTER TABLE master_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON master_operations USING (ritim_scope_matches(tenant_id,site_id)) WITH CHECK (ritim_scope_matches(tenant_id,site_id));
