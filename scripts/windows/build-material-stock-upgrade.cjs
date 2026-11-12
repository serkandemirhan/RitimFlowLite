'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');
let output="BEGIN;\nSELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'));\nSET LOCAL search_path TO ritim,pg_catalog;\n";
for(const file of ['057_order_items.sql','058_material_stock.sql','059_location_management.sql','060_order_item_materials.sql','061_supplier_types.sql','062_product_materials.sql']){
 const version=file.slice(0,3),sql=fs.readFileSync(path.join(root,'backend/migrations',file),'utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex'),previous=String(Number(version)-1).padStart(3,'0');
 output+=`DO $upgrade$ BEGIN
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='${version}') THEN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='${version}' AND checksum='${checksum}') THEN RAISE EXCEPTION 'Migration ${version} checksum mismatch';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='${previous}') THEN RAISE EXCEPTION 'Expected schema ${previous}';END IF;
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO schema_migrations(version,checksum) VALUES('${version}','${checksum}');
 END IF;
END $upgrade$;
`;
}
output+=`GRANT SELECT,INSERT ON ritim.order_items,ritim.stock_units,ritim.inventory_lot_inspections,ritim.raw_material_issues,ritim.raw_material_returns,ritim.raw_material_authorizations,ritim.stock_lot_sequences TO ritim_runtime;
GRANT UPDATE(part_id,part_number,part_name,quantity,due_date,materials) ON ritim.order_items TO ritim_runtime;
GRANT UPDATE(code,parent_id,archived_at) ON ritim.inventory_locations TO ritim_runtime;
GRANT UPDATE(last_number) ON ritim.stock_lot_sequences TO ritim_runtime;
GRANT UPDATE(readiness) ON ritim.raw_material_authorizations TO ritim_runtime;
GRANT UPDATE(owner_customer_id,expected_production_id,incoming_quality_required) ON ritim.inventory_lots TO ritim_runtime;
GRANT UPDATE(card_type,stock_unit_id,default_materials) ON ritim.master_parts TO ritim_runtime;
GRANT UPDATE(code,description,part_id,unit_id,base_unit) ON ritim.inventory_materials TO ritim_runtime;
GRANT EXECUTE ON FUNCTION ritim.ritim_single_order_item(),ritim.ritim_production_order_item() TO ritim_runtime;
GRANT UPDATE(material_supplier,subcontractor) ON ritim.outsourcing_suppliers TO ritim_runtime;
COMMIT;
`;
fs.writeFileSync(path.join(root,'artifacts/cloud-setup/supabase-upgrade-057-062.sql'),output);
console.log('Prepared migrations 057-062; no database execution.');
