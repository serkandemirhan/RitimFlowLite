'use strict';
const {data,scoped,cmd,identifier,payload,audit,fail}=require('./orders-planning');
async function list(c,s){return (await c.query(`SELECT a.id assignment_id,w.id work_order_id,w.order_id,w.work_order_number,e.id event_id,e.occurred_at,e.payload
 FROM work_assignments a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.work_order_id)
 JOIN audit_events e ON (e.tenant_id,e.site_id,e.entity_id)=(w.tenant_id,w.site_id,w.id) AND e.event_type='operator.lifecycle'
 WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.user_id=$3 AND a.released_at IS NULL AND e.occurred_at>=a.assigned_at
 AND NOT EXISTS(SELECT 1 FROM audit_events seen WHERE seen.tenant_id=a.tenant_id AND seen.site_id=a.site_id AND seen.actor_id=a.user_id AND seen.event_type='operator.lifecycle.seen' AND seen.payload->>'eventId'=e.id::text)
 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 50`,[s.tenantId,s.siteId,s.identity.userId])).rows;}
function routes(api){api.post('/sites/:tenantId/:siteId/operator/notifications/:assignmentId/lifecycle/acknowledge',async(req,reply)=>{
 const s=data(req),p={assignmentId:identifier(req.params.assignmentId),eventId:identifier(payload(req).eventId)};
 const r=await cmd(req,'operator.lifecycle.seen','production.write',p,async c=>{
  const item=(await list(c,s)).find(x=>x.assignment_id===p.assignmentId&&x.event_id===p.eventId);
  if(!item)fail(409,'NOTICE_CHANGED','Bildirim size ait değil veya daha önce okundu.');
  await audit(c,s,'operator.lifecycle.seen','work_order',item.work_order_id,p);return {status:200,body:{acknowledged:true}};
 });return reply.code(r.status).send(r.body);
 });}
module.exports={list,routes};
