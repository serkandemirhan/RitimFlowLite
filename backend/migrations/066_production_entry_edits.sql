-- Repeated corrections can restore a voided entry or increase it within physical input.
-- Both the original events and every correction remain append-only.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint
  WHERE conrelid='production_correction_requests'::regclass AND contype='c'
  AND (pg_get_constraintdef(oid) LIKE '%original_quantity%' OR pg_get_constraintdef(oid) LIKE '%quantity >=%')
 LOOP EXECUTE format('ALTER TABLE production_correction_requests DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
ALTER TABLE production_correction_requests ADD CONSTRAINT correction_original_nonnegative CHECK(original_quantity>=0);
ALTER TABLE production_correction_requests ADD CONSTRAINT correction_quantity_nonnegative CHECK(quantity>=0);
