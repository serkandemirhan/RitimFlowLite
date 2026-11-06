-- Planned assignments form queues; execution separately serializes machine starts.
DROP INDEX one_active_machine_assignment;
ALTER TABLE work_orders ADD COLUMN queue_position bigint NOT NULL DEFAULT 0;
CREATE INDEX machine_queue_order ON work_orders(tenant_id,site_id,queue_position,id);
