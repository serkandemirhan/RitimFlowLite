-- Add descriptive order attributes without changing existing records.
ALTER TABLE orders ADD COLUMN part_name text;
ALTER TABLE orders ADD COLUMN due_date date;
