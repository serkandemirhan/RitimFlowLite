ALTER TABLE orders ADD COLUMN execution_hold boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN execution_hold_reason text;
ALTER TABLE production_orders ADD COLUMN cancelled_at timestamptz;
