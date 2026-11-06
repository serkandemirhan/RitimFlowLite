-- Editable business attributes use optimistic versions; ledger history stays immutable.
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE orders ADD COLUMN reference text NOT NULL DEFAULT '' CHECK(length(reference)<=120);
ALTER TABLE orders ADD COLUMN notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000);
ALTER TABLE orders ADD COLUMN priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3);
ALTER TABLE operations ADD COLUMN setup_minutes numeric(12,3) CHECK(setup_minutes BETWEEN 0 AND 10080);
ALTER TABLE operations ADD COLUMN cycle_minutes numeric(12,3) CHECK(cycle_minutes BETWEEN 0 AND 10080);
ALTER TABLE work_orders ADD COLUMN setup_minutes numeric(12,3) CHECK(setup_minutes BETWEEN 0 AND 10080);
ALTER TABLE work_orders ADD COLUMN cycle_minutes numeric(12,3) CHECK(cycle_minutes BETWEEN 0 AND 10080);
ALTER TABLE work_orders ADD COLUMN timing_version integer NOT NULL DEFAULT 1 CHECK(timing_version>0);
ALTER TABLE machines ADD COLUMN calendar jsonb NOT NULL DEFAULT '{"weekdays":[1,2,3,4,5],"startMinute":480,"endMinute":1020,"breakStartMinute":720,"breakEndMinute":780}'::jsonb;
ALTER TABLE machines ADD COLUMN calendar_version integer NOT NULL DEFAULT 1 CHECK(calendar_version>0);
CREATE INDEX orders_workspace_due ON orders(tenant_id,site_id,status,due_date,id);
