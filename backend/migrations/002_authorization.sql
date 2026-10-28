-- Keep the original site grants; extend role vocabulary and add explicit revocation.
ALTER TABLE site_memberships DROP CONSTRAINT site_memberships_role_check;
ALTER TABLE site_memberships ADD CONSTRAINT site_memberships_role_check CHECK (role IN ('manager','planner','operator','quality','logistics','viewer'));
ALTER TABLE site_memberships ADD COLUMN revoked_at timestamptz;
CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role = 'tenant_admin'),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id,user_id,role)
);
-- Platform grants are provisioned out of band by a privileged operator, never from tokens.
CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  revoked_at timestamptz
);
CREATE INDEX site_memberships_active_user ON site_memberships(user_id,tenant_id,site_id) WHERE revoked_at IS NULL;
CREATE INDEX tenant_memberships_active_user ON tenant_memberships(user_id,tenant_id) WHERE revoked_at IS NULL;
