'use strict';
const {HttpError}=require('./auth');
const {capabilities}=require('./permissions');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function authorizeScope(client,{identity,tenantId,siteId,capability}) {
 if(!identity||identity.verified!==true||!identity.userId)throw new HttpError(401,'UNAUTHENTICATED','Authentication required');
 if(!uuid.test(tenantId||'')||!uuid.test(siteId||'')||typeof capability!=='string'||!capability)throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 const result=await client.query('SELECT ritim_open_scope($1,$2,$3) AS roles',[identity.userId,tenantId,siteId]);
 const roles=result.rows[0]?.roles;
 if(!roles)throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 const allowed=capabilities(roles);
 if(!allowed.includes(capability))throw new HttpError(403,'FORBIDDEN','Scope not authorized');
 return {tenantId,siteId,roles:[...new Set(roles)].sort(),capabilities:allowed};
}
async function listMemberships(pool,identity){
 const r=await pool.query('SELECT * FROM ritim_memberships($1)',[identity.userId]);
 return r.rows.map(row=>{const roles=[...(row.superadmin?['superadmin']:[]),...(row.tenant_admin?['tenant_admin']:[]),...row.site_roles];return {tenantId:row.tenant_id,tenantName:row.tenant_name,siteId:row.site_id,siteName:row.site_name,roles,capabilities:capabilities(roles)};});
}
module.exports={authorizeScope,listMemberships};
