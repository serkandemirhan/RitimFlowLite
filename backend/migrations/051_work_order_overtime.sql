ALTER TABLE work_orders ADD COLUMN planned_overtime boolean NOT NULL DEFAULT false;
ALTER TABLE work_orders ADD CONSTRAINT planned_overtime_has_start CHECK(NOT planned_overtime OR planned_start_at IS NOT NULL);
COMMENT ON COLUMN work_orders.planned_overtime IS 'Manager-approved continuous time slot for this work order only; does not change the site work calendar.';
