-- Keep movement references while removing empty locations from active use.
ALTER TABLE inventory_locations ADD COLUMN archived_at timestamptz;
