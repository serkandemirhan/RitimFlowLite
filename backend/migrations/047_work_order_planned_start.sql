-- Optional planner-selected instant. NULL preserves automatic queue scheduling.
ALTER TABLE work_orders ADD COLUMN planned_start_at timestamptz;
COMMENT ON COLUMN work_orders.planned_start_at IS 'Planner-selected start instant; NULL uses automatic queue scheduling. All dates are stored with timezone.';
