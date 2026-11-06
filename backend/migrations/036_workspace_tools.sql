-- User-owned view preferences and reusable site route templates.
CREATE TABLE workspace_preferences (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 view_name text NOT NULL CHECK(view_name IN ('orders','jobs','compensations')),
 settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=2048),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,actor_id,view_name),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE workspace_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY preference_scope ON workspace_preferences USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
CREATE POLICY preference_actor ON workspace_preferences AS RESTRICTIVE USING(actor_id::text=current_setting('ritim.actor',true)) WITH CHECK(actor_id::text=current_setting('ritim.actor',true));
CREATE TABLE route_templates (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 operations jsonb NOT NULL CHECK(jsonb_typeof(operations)='array' AND jsonb_array_length(operations) BETWEEN 1 AND 100 AND octet_length(operations::text)<=24576),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),deleted_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE UNIQUE INDEX route_template_name ON route_templates(tenant_id,site_id,lower(name)) WHERE deleted_at IS NULL;
ALTER TABLE route_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY template_scope ON route_templates USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
REVOKE ALL ON workspace_preferences,route_templates FROM PUBLIC;
