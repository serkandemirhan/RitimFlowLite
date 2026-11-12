'use strict';
const {HttpError}=require('./auth');
// Resolve within the write transaction so a deactivated definition cannot be used.
async function catalogRoute(c,s,operations){
 if(!operations.length)return [];
 const names=[...new Set(operations.map(op=>op.name))];
 const result=await c.query('SELECT m.id,m.name,m.kind,r.name requested_name FROM unnest($3::text[]) r(name) JOIN master_operations m ON lower(m.name)=lower(r.name) WHERE m.tenant_id=$1 AND m.site_id=$2 AND m.deleted_at IS NULL ORDER BY m.id FOR SHARE OF m',[s.tenantId,s.siteId,names]);
 const records=new Map(result.rows.map(op=>[op.requested_name,op]));
 return operations.map(op=>{const master=records.get(op.name);if(!master)throw new HttpError(409,'MASTER_OPERATION_UNAVAILABLE','Operasyonu aktif operasyon tanımlarından seçin: '+op.name);return {...op,name:master.name,kind:master.kind}});
}
module.exports={catalogRoute};
