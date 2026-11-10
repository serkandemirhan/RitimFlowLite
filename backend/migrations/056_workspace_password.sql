-- Resolve identities only after checking both actor and target. No passwords enter SQL.
CREATE FUNCTION ritim_password_target(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 t uuid:=nullif(current_setting('ritim.tenant',true),'')::uuid;
 actor uuid:=nullif(current_setting('ritim.actor',true),'')::uuid;
 result jsonb;
BEGIN
 IF actor IS NULL OR actor=p_user
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND disabled_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=actor AND role='tenant_admin' AND revoked_at IS NULL)
 OR NOT (EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id=t AND user_id=p_user AND revoked_at IS NULL)
         OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id=t AND user_id=p_user AND revoked_at IS NULL))
 OR EXISTS(SELECT 1 FROM tenant_memberships WHERE tenant_id<>t AND user_id=p_user AND revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM site_memberships WHERE tenant_id<>t AND user_id=p_user AND revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=p_user AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Password administration forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('issuer',issuer,'subject',subject) INTO result FROM users WHERE id=p_user AND disabled_at IS NULL FOR UPDATE;
 IF result IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_password_target(uuid) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_password_target(uuid) FROM PUBLIC;
