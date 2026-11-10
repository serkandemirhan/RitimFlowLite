ALTER TABLE production_orders ADD COLUMN created_by_name text;
ALTER TABLE work_orders ADD COLUMN created_at timestamptz;
ALTER TABLE work_orders ADD COLUMN created_by_name text;
UPDATE production_orders p SET created_by_name=(SELECT u.display_name FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.tenant_id=p.tenant_id AND a.site_id=p.site_id AND a.entity_id=p.id AND a.event_type='production_order.created' ORDER BY a.occurred_at,a.id LIMIT 1);
UPDATE work_orders w SET (created_at,created_by_name)=(SELECT a.occurred_at,u.display_name FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.tenant_id=w.tenant_id AND a.site_id=w.site_id AND a.entity_id=w.id AND a.event_type='work_order.planned' ORDER BY a.occurred_at,a.id LIMIT 1);
-- Historical rows without creation evidence remain unknown; never invent dates.
CREATE FUNCTION stamp_creation_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.created_at:=now();
  NEW.created_by_name:=NULL;
  IF ritim_scope_matches(NEW.tenant_id,NEW.site_id) THEN
   SELECT display_name INTO NEW.created_by_name FROM users WHERE id::text=current_setting('ritim.actor',true);
  END IF;
 ELSE
  NEW.created_at:=OLD.created_at;
  NEW.created_by_name:=OLD.created_by_name;
 END IF;
 RETURN NEW;
END;
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.stamp_creation_metadata() SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION stamp_creation_metadata() FROM PUBLIC;
CREATE TRIGGER production_creation_metadata BEFORE INSERT OR UPDATE ON production_orders FOR EACH ROW EXECUTE FUNCTION stamp_creation_metadata();
CREATE TRIGGER work_creation_metadata BEFORE INSERT OR UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION stamp_creation_metadata();
CREATE FUNCTION ritim_job_history_actor_name(p_tenant uuid,p_site uuid,p_job uuid,p_actor uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT display_name FROM users WHERE id=p_actor AND ritim_scope_matches(p_tenant,p_site)
 AND (EXISTS(SELECT 1 FROM production_events WHERE tenant_id=p_tenant AND site_id=p_site AND work_order_id=p_job AND actor_id=p_actor)
 OR EXISTS(SELECT 1 FROM audit_events WHERE tenant_id=p_tenant AND site_id=p_site AND entity_type='work_order' AND entity_id=p_job AND actor_id=p_actor))
$$;
DO $$ DECLARE sch text:=current_schema(); BEGIN
 EXECUTE format('ALTER FUNCTION %I.ritim_job_history_actor_name(uuid,uuid,uuid,uuid) SET search_path = pg_catalog,%I,pg_temp',sch,sch);
END $$;
REVOKE ALL ON FUNCTION ritim_job_history_actor_name(uuid,uuid,uuid,uuid) FROM PUBLIC;
