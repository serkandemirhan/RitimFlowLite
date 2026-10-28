'use strict';
const {HttpError}=require('./auth');
const {capabilities}=require('./permissions');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function authorizeScope(client,{identity,tenantId,siteId,capability}) {
 if(!identity||identity.verified!==true||!identity.userId)throw new HttpError(401,'UNAUTHENTICATED','Authentication required');
 if(!uuid.test(tenantId||'')||!uuid.test(siteId||'')||typeof capability!=='string'||!capability)throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 // Share locks are held through the enclosing transaction: revoke/disable cannot race a commit.
 const user=await client.query('SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL FOR SHARE',[identity.userId]);
 if(!user.rowCount)throw new HttpError(401,'UNAUTHENTICATED','Identity is not active');
 const site=await client.query('SELECT id FROM sites WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,siteId]);
 if(!site.rowCount)throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 const platform=await client.query('SELECT user_id FROM platform_admins WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE',[identity.userId]);
 const tenant=await client.query("SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND role='tenant_admin' AND revoked_at IS NULL FOR SHARE",[tenantId,identity.userId]);
 const siteRoles=await client.query('SELECT role FROM site_memberships WHERE tenant_id=$1 AND site_id=$2 AND user_id=$3 AND revoked_at IS NULL ORDER BY role FOR SHARE',[tenantId,siteId,identity.userId]);
 const roles=[...(platform.rowCount?['superadmin']:[]),...tenant.rows.map(x=>x.role),...siteRoles.rows.map(x=>x.role)];
 const allowed=capabilities(roles);
 if(!allowed.includes(capability))throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 return {tenantId,siteId,roles:[...new Set(roles)].sort(),capabilities:allowed};
}
async function listMemberships(pool,identity){
 const r=await pool.query(`SELECT t.id AS tenant_id,t.name AS tenant_name,s.id AS site_id,s.name AS site_name,
 COALESCE(array_agg(DISTINCT m.role) FILTER (WHERE m.role IS NOT NULL),'{}') AS site_roles,
 EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t.id AND tm.user_id=$1 AND tm.role='tenant_admin' AND tm.revoked_at IS NULL) AS tenant_admin,
 EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=$1 AND pa.revoked_at IS NULL) AS superadmin
 FROM users u JOIN sites s ON true JOIN tenants t ON t.id=s.tenant_id
 LEFT JOIN site_memberships m ON m.tenant_id=t.id AND m.site_id=s.id AND m.user_id=u.id AND m.revoked_at IS NULL
 WHERE u.id=$1 AND u.disabled_at IS NULL AND (m.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t.id AND tm.user_id=u.id AND tm.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.revoked_at IS NULL))
 GROUP BY t.id,t.name,s.id,s.name ORDER BY t.id,s.id`,[identity.userId]);
 return r.rows.map(row=>{const roles=[...(row.superadmin?['superadmin']:[]),...(row.tenant_admin?['tenant_admin']:[]),...row.site_roles];return {tenantId:row.tenant_id,tenantName:row.tenant_name,siteId:row.site_id,siteName:row.site_name,roles,capabilities:capabilities(roles)};});
}
module.exports={authorizeScope,listMemberships};
