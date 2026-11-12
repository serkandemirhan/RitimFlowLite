ALTER TABLE master_parts ADD COLUMN default_materials jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(default_materials)='array' AND jsonb_array_length(default_materials)<=20);
