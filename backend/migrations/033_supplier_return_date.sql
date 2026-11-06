-- Optional dispatch promise; history remains immutable.
ALTER TABLE production_supplier_events ADD COLUMN expected_return_date date;
ALTER TABLE production_supplier_events ADD CHECK(kind='dispatch' OR expected_return_date IS NULL);
