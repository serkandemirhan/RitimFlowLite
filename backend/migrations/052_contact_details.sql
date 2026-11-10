ALTER TABLE master_customers ADD COLUMN contact jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact) = 'object');
ALTER TABLE outsourcing_suppliers ADD COLUMN contact jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact) = 'object');
ALTER TABLE outsourcing_suppliers ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
CREATE FUNCTION protect_supplier_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Supplier history cannot be deleted' USING ERRCODE='55000'; END IF;
 IF (to_jsonb(NEW) - ARRAY['name','code','contact','version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['name','code','contact','version']) OR NEW.version <> OLD.version + 1 THEN
  RAISE EXCEPTION 'Supplier identity is immutable; version must advance' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER outsourcing_suppliers_immutable ON outsourcing_suppliers;
CREATE TRIGGER outsourcing_suppliers_immutable BEFORE UPDATE OR DELETE ON outsourcing_suppliers FOR EACH ROW EXECUTE FUNCTION protect_supplier_identity();
CREATE FUNCTION ritim_order_creator_name(p_tenant uuid,p_site uuid,p_order uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT u.display_name FROM audit_events a JOIN users u ON u.id=a.actor_id
 WHERE ritim_scope_matches(p_tenant,p_site)
 AND a.tenant_id=p_tenant AND a.site_id=p_site AND a.entity_id=p_order AND a.event_type='order.created'
 ORDER BY a.occurred_at,a.id LIMIT 1
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_order_creator_name(uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_order_creator_name(uuid,uuid,uuid) FROM PUBLIC;
