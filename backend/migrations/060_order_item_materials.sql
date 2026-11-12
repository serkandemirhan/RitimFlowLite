-- Advisory material requirements; these never reserve or debit warehouse stock.
ALTER TABLE order_items ADD COLUMN materials jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK (jsonb_typeof(materials)='array' AND jsonb_array_length(materials)<=20);
