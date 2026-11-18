-- Read account metadata for users who belong to the selected firm; never return passwords or tokens.
CREATE FUNCTION ritim_platform_user_details(p_actor uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.id=p_actor AND u.disabled_at IS NULL AND a.revoked_at IS NULL) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_object_agg(x.id::text,x.info),'{}'::jsonb) INTO result FROM (
  SELECT u.id,jsonb_build_object('userId',u.id,'name',u.display_name,'appAccount',true,'disabled',u.disabled_at IS NOT NULL,'authAccount',au.id IS NOT NULL,
   'email',CASE WHEN au.email ILIKE '%@staff.getritim.invalid' THEN NULL ELSE au.email END,
   'createdAt',au.created_at,'lastSignInAt',au.last_sign_in_at,'emailConfirmedAt',au.email_confirmed_at,'bannedUntil',au.banned_until,
   'username',m.username,
   'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',s.name,'role',sm.role) ORDER BY s.name,sm.role),'[]'::jsonb) FROM site_memberships sm JOIN sites s ON s.tenant_id=sm.tenant_id AND s.id=sm.site_id WHERE sm.tenant_id=p_tenant AND sm.user_id=u.id AND sm.revoked_at IS NULL),
   'firmAdmin',EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=p_tenant AND tm.user_id=u.id AND tm.role='tenant_admin' AND tm.revoked_at IS NULL)) info
  FROM users u LEFT JOIN managed_usernames m ON m.user_id=u.id AND m.tenant_id=p_tenant
  LEFT JOIN auth.users au ON au.id::text=u.subject
  WHERE EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=p_tenant AND tm.user_id=u.id AND tm.revoked_at IS NULL)
     OR EXISTS(SELECT 1 FROM site_memberships sm WHERE sm.tenant_id=p_tenant AND sm.user_id=u.id AND sm.revoked_at IS NULL)
 ) x;
 RETURN result;
END $$;
DO $$ BEGIN EXECUTE format('ALTER FUNCTION %I.ritim_platform_user_details(uuid,uuid) SET search_path=pg_catalog,%I,pg_temp',current_schema(),current_schema()); END $$;
REVOKE ALL ON FUNCTION ritim_platform_user_details(uuid,uuid) FROM PUBLIC;
