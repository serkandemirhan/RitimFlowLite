'use strict';
// Business revisions follow committed, append-only order changes, independently of lock versions.
const changeTypes=['order.updated','order.items_changed','order.remainder_closed','order.closed','execution.hold','execution.resume','execution.cancel','execution.reopen'];
function revisionLabel(changes){const n=BigInt(changes)+101n;return (n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0')}
async function metadata(c,s,orderId){
 const last=(await c.query(`SELECT occurred_at,ritim_audit_actor_name(tenant_id,site_id,id) actor_name,COUNT(*) OVER() changes
 FROM audit_events WHERE tenant_id=$1 AND site_id=$2 AND entity_type='order' AND entity_id=$3 AND event_type=ANY($4::text[])
 ORDER BY occurred_at DESC,id DESC LIMIT 1`,[s.tenantId,s.siteId,orderId,changeTypes])).rows[0];
 return {revision:revisionLabel(last?.changes||0),updatedAt:last?new Date(last.occurred_at).toISOString():null,updatedBy:last?.actor_name||null};
}
module.exports={metadata,revisionLabel};
