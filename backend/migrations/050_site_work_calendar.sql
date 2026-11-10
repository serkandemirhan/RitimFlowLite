CREATE TABLE site_work_calendars (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL,
 calendar jsonb NOT NULL CHECK(jsonb_typeof(calendar)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(tenant_id,site_id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
ALTER TABLE site_work_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_work_calendars FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON site_work_calendars USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
