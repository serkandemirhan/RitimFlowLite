'use strict';
// Only the first operation of exactly internal -> external -> internal can be
// opened as a supplier handoff prerequisite. Later stages stay fail-closed.
async function supportsSupplierPrerequisite(c,s,order,sequence){
 if(sequence!==0)return false;
 const r=await c.query('SELECT sequence,kind FROM operations WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY sequence',[s.tenantId,s.siteId,order]);
 return r.rows.length===3&&r.rows.every((x,i)=>x.sequence===i&&x.kind===(i===1?'external':'internal'));
}
async function supportsSupplierFinal(c,s,order,sequence){return sequence===2&&supportsSupplierPrerequisite(c,s,order,0)}
module.exports={supportsSupplierPrerequisite,supportsSupplierFinal};
