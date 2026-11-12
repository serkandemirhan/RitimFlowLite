ALTER TABLE outsourcing_suppliers ADD COLUMN material_supplier boolean NOT NULL DEFAULT false;
ALTER TABLE outsourcing_suppliers ADD COLUMN subcontractor boolean NOT NULL DEFAULT true;
ALTER TABLE outsourcing_suppliers ADD CONSTRAINT supplier_has_type CHECK(material_supplier OR subcontractor);
CREATE OR REPLACE FUNCTION protect_supplier_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplier history cannot be deleted' USING ERRCODE='55000'; END IF;
 IF (to_jsonb(NEW)-ARRAY['name','code','contact','version','material_supplier','subcontractor']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['name','code','contact','version','material_supplier','subcontractor']) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Supplier identity is immutable; version must advance' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
