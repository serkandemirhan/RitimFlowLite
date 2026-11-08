'use strict';
const {randomUUID}=require('node:crypto');
const {data,payload,identifier,cmd,lockedOrder,audit,number,fail}=require('./orders-planning');
const manager=roles=>roles.some(x=>['manager','tenant_admin','superadmin'].includes(x));
function reason(value){if(typeof value!=='string'||value.trim().length<3||value.trim().length>1000)fail(400,'INVALID_INPUT','Düzeltme gerekçesi 3–1000 karakter olmalı.');return value.trim()}
async function eligible(c,s,order,job,event){
 const parent=await lockedOrder(c,s,order);if(parent.status!=='open')fail(409,'ORDER_CLOSED','Kapalı siparişte üretim düzeltilemez.');
 const q=await c.query(`SELECT p.*,w.status FROM production_events p JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(p.tenant_id,p.site_id,p.work_order_id) WHERE p.tenant_id=$1 AND p.site_id=$2 AND w.order_id=$3 AND w.id=$4 AND p.id=$5`,[s.tenantId,s.siteId,order,job,event]);
 const e=q.rows[0];if(!e)fail(404,'NOT_FOUND','Üretim kaydı bulunamadı.');
 if(!['running','paused'].includes(e.status)||e.kind!=='pending'||!e.separate_quality_request)fail(409,'CORRECTION_UNAVAILABLE','Yalnız açık işlerdeki kaliteye gönderilmemiş üretim girişleri düzeltilebilir.');
 const used=await c.query(`SELECT 1 FROM production_quality_requests WHERE tenant_id=$1 AND site_id=$2 AND production_event_id=$3
 UNION ALL SELECT 1 FROM output_dispositions WHERE tenant_id=$1 AND site_id=$2 AND production_event_id=$3
 UNION ALL SELECT 1 FROM production_correction_requests r JOIN production_correction_decisions d ON (d.tenant_id,d.site_id,d.request_id)=(r.tenant_id,r.site_id,r.id) WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.production_event_id=$3 AND d.approved LIMIT 1`,[s.tenantId,s.siteId,event]);
 if(used.rowCount)fail(409,'CORRECTION_UNAVAILABLE','Bu kayıt kaliteye gönderilmiş veya daha önce düzeltilmiş. Geçmişi korumak için değiştirilemez.');
 await require('./production-execution').reconciled(c,s,job);
 return e;
}
async function history(c,s,job){
 const q=await c.query(`SELECT r.*,d.approved,d.reason decision_reason,d.actor_id decision_actor_id,d.created_at decided_at FROM production_correction_requests r LEFT JOIN production_correction_decisions d ON (d.tenant_id,d.site_id,d.request_id)=(r.tenant_id,r.site_id,r.id) WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.work_order_id=$3 ORDER BY r.created_at,r.id`,[s.tenantId,s.siteId,job]);
 return q.rows.map(r=>({id:r.id,eventId:r.production_event_id,originalQuantity:number(r.original_quantity),quantity:number(r.quantity),reason:r.reason,actorId:r.actor_id,createdAt:r.created_at,status:r.approved===null?'pending':r.approved?'approved':'rejected',decisionReason:r.decision_reason,decisionActorId:r.decision_actor_id,decidedAt:r.decided_at}));
}
function routes(api){
 const prefix='/sites/:tenantId/:siteId/orders/:orderId/work-orders/:workOrderId/production';
 api.post(prefix+'/corrections',async(req,reply)=>{
  const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),workOrderId:identifier(req.params.workOrderId),eventId:identifier(b.eventId),quantity:b.quantity,reason:reason(b.reason)};
  if(!Number.isSafeInteger(p.quantity)||p.quantity<0)fail(400,'INVALID_INPUT','Geçerli adet girin.');
  const result=await cmd(req,'production.correction.request','production.write',p,async(c,scope)=>{
   const e=await eligible(c,s,p.orderId,p.workOrderId,p.eventId);
   if(e.actor_id!==s.identity.userId&&!manager(scope.roles))fail(403,'NOT_AUTHORIZED','Yalnız kendi girişiniz için düzeltme isteyebilirsiniz.');
   if(p.quantity>=number(e.quantity_pieces))fail(400,'INVALID_INPUT','Yeni adet eski adetten küçük olmalı. Eksik bildirim için üretim girişi yapın.');
   const pending=await c.query(`SELECT 1 FROM production_correction_requests r WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.production_event_id=$3 AND NOT EXISTS(SELECT 1 FROM production_correction_decisions d WHERE (d.tenant_id,d.site_id,d.request_id)=(r.tenant_id,r.site_id,r.id))`,[s.tenantId,s.siteId,p.eventId]);
   if(pending.rowCount)fail(409,'CORRECTION_PENDING','Bu kayıt için yönetici kararı bekleniyor.');
   const id=randomUUID();await c.query('INSERT INTO production_correction_requests(tenant_id,site_id,id,work_order_id,production_event_id,original_quantity,quantity,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s.tenantId,s.siteId,id,p.workOrderId,p.eventId,e.quantity_pieces,p.quantity,p.reason,s.identity.userId]);
   await audit(c,s,'production.correction.request','work_order',p.workOrderId,{...p,requestId:id});return {status:201,body:{id,status:'pending'}};
  });return reply.code(result.status).send(result.body);
 });
 api.post(prefix+'/correction-decision',async(req,reply)=>{
  const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),workOrderId:identifier(req.params.workOrderId),requestId:identifier(b.requestId),approved:b.approved,reason:reason(b.reason)};
  if(typeof p.approved!=='boolean')fail(400,'INVALID_INPUT','Karar gerekli.');
  const result=await cmd(req,'production.correction.decide','planning.write',p,async(c,scope)=>{
   if(!manager(scope.roles))fail(403,'NOT_AUTHORIZED','Yönetici onayı gerekli.');
   await lockedOrder(c,s,p.orderId);
   const q=await c.query(`SELECT r.* FROM production_correction_requests r JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(r.tenant_id,r.site_id,r.work_order_id) WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 AND r.work_order_id=$4 AND w.order_id=$5`,[s.tenantId,s.siteId,p.requestId,p.workOrderId,p.orderId]);
   const r=q.rows[0];if(!r)fail(404,'NOT_FOUND','Talep bulunamadı.');
   if((await c.query('SELECT 1 FROM production_correction_decisions WHERE tenant_id=$1 AND site_id=$2 AND request_id=$3',[s.tenantId,s.siteId,p.requestId])).rowCount)fail(409,'CORRECTION_DECIDED','Bu talep zaten sonuçlandı.');
   if(p.approved)await eligible(c,s,p.orderId,p.workOrderId,r.production_event_id);
   await c.query('INSERT INTO production_correction_decisions(tenant_id,site_id,request_id,approved,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[s.tenantId,s.siteId,p.requestId,p.approved,p.reason,s.identity.userId]);
   await audit(c,s,'production.correction.decide','work_order',p.workOrderId,p);return {status:200,body:{id:p.requestId,status:p.approved?'approved':'rejected'}};
  });return reply.code(result.status).send(result.body);
 });
}
module.exports={routes,history};
