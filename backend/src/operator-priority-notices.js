'use strict';
const {data,payload,identifier,cmd,scoped,audit,fail}=require('./orders-planning');
// Queue positions are spaced planning keys (1024, 2048...), not display ranks.
const queueRankSQL=`CASE WHEN a.machine_id IS NOT NULL AND w.queue_position IS NOT NULL THEN
 (SELECT COUNT(*)+1 FROM work_assignments qa JOIN work_orders qw ON (qw.tenant_id,qw.site_id,qw.id)=(qa.tenant_id,qa.site_id,qa.work_order_id)
 WHERE qa.tenant_id=a.tenant_id AND qa.site_id=a.site_id AND qa.machine_id=a.machine_id AND qa.released_at IS NULL
 AND qw.status NOT IN ('complete','cancelled') AND (qw.queue_position<w.queue_position OR (qw.queue_position=w.queue_position AND qw.id<w.id)))::integer ELSE NULL END`;
const rank=p=>({0:1,1:0,2:2,3:3})[p];
async function list(c,s,includeSeen=false){
 const rows=(await c.query(`SELECT a.id,w.id work_order_id,w.order_id,w.work_order_number,o.order_number,
  COALESCE(oi.part_name,o.part_name) part_name,op.name operation,m.code machine_code,o.priority,
  change.id event_id,change.occurred_at,change.payload#>>'{before,priority}' previous_priority,
  change.payload#>>'{after,priority}' changed_priority,
  EXISTS(SELECT 1 FROM audit_events seen WHERE seen.tenant_id=a.tenant_id AND seen.site_id=a.site_id
   AND seen.actor_id=a.user_id AND seen.event_type='operator.priority.seen' AND seen.entity_type='work_order'
   AND seen.entity_id=w.id AND seen.payload->>'eventId'=change.id::text AND seen.payload->>'assignmentId'=a.id::text) acknowledged
 FROM work_assignments a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.work_order_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id)
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 LEFT JOIN production_orders po ON (po.tenant_id,po.site_id,po.id)=(w.tenant_id,w.site_id,w.production_order_id)
 LEFT JOIN order_items oi ON (oi.tenant_id,oi.site_id,oi.id)=(po.tenant_id,po.site_id,po.order_item_id)
 LEFT JOIN machines m ON (m.tenant_id,m.site_id,m.id)=(a.tenant_id,a.site_id,a.machine_id)
 JOIN LATERAL (SELECT e.id,e.occurred_at,e.payload FROM audit_events e
  WHERE e.tenant_id=w.tenant_id AND e.site_id=w.site_id AND e.entity_type='order' AND e.entity_id=w.order_id
  AND e.event_type='order.updated' AND e.occurred_at>=a.assigned_at
  AND e.payload#>>'{before,priority}' IS DISTINCT FROM e.payload#>>'{after,priority}'
  ORDER BY (e.payload#>>'{after,version}')::integer DESC NULLS LAST,e.occurred_at DESC,e.id DESC LIMIT 1) change ON true
 WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.user_id=$3 AND a.released_at IS NULL
 AND w.status NOT IN ('complete','cancelled') ORDER BY change.occurred_at DESC,w.id`,[s.tenantId,s.siteId,s.identity.userId])).rows;
 return rows.filter(n=>(includeSeen||!n.acknowledged)&&Number(n.changed_priority)===n.priority&&rank(n.priority)>rank(Number(n.previous_priority))).map(n=>({...n,previous_priority:Number(n.previous_priority)}));
}
function routes(api){
 api.post('/sites/:tenantId/:siteId/operator/notifications/:assignmentId/priority/acknowledge',async(req,reply)=>{
  const s=data(req),p={assignmentId:identifier(req.params.assignmentId),eventId:identifier(payload(req).eventId)};
  const r=await cmd(req,'operator.priority.seen','production.write',p,async c=>{
   const assigned=await c.query('SELECT id FROM work_assignments WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND user_id=$4 AND released_at IS NULL FOR UPDATE',[s.tenantId,s.siteId,p.assignmentId,s.identity.userId]);
   if(!assigned.rowCount)fail(403,'NOT_ASSIGNED','Bu bildirim size ait değil.');
   const notice=(await list(c,s,true)).find(n=>n.id===p.assignmentId&&n.event_id===p.eventId);
   if(!notice)fail(409,'NOTICE_CHANGED','Öncelik değişmiş veya iş artık size atanmamış. Bildirimleri yenileyin.');
   if(!notice.acknowledged)await audit(c,s,'operator.priority.seen','work_order',notice.work_order_id,p);
   return {status:200,body:{acknowledged:true}};
  });return reply.code(r.status).send(r.body);
 });
}
module.exports={list,routes,queueRankSQL,rank};
