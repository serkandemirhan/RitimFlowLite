'use strict';
const {randomUUID}=require('node:crypto');
const {data,payload,identifier,cmd,lockedOrder,audit,number,fail}=require('./orders-planning');
const isManager=roles=>roles.some(r=>['manager','tenant_admin','superadmin'].includes(r));
async function entries(c,s,order,job){
 return (await c.query(`SELECT p.id,p.actor_id,p.kind,p.quantity_pieces original_quantity,
  COALESCE(last_edit.quantity,p.quantity_pieces) quantity,last_edit.id version,
  p.occurred_at+interval '5 minutes' expires_at,clock_timestamp() server_time,
  o.status order_status,w.status job_status,
  NOT EXISTS(SELECT 1 FROM production_ledger l WHERE (l.tenant_id,l.site_id,l.work_order_id,l.production_event_id)=(p.tenant_id,p.site_id,p.work_order_id,p.id) AND l.kind='consume') unlinked,
  (p.kind='good' OR (p.kind='pending' AND NOT p.separate_quality_request)
   OR EXISTS(SELECT 1 FROM production_quality_requests q WHERE (q.tenant_id,q.site_id,q.production_event_id)=(p.tenant_id,p.site_id,p.id))
   OR EXISTS(SELECT 1 FROM output_dispositions d WHERE (d.tenant_id,d.site_id,d.production_event_id)=(p.tenant_id,p.site_id,p.id))
   OR EXISTS(SELECT 1 FROM shipping_quality_bypasses b WHERE (b.tenant_id,b.site_id,b.production_event_id)=(p.tenant_id,p.site_id,p.id))
   OR EXISTS(SELECT 1 FROM production_compensations pc WHERE (pc.tenant_id,pc.site_id,pc.production_event_id)=(p.tenant_id,p.site_id,p.id))
   OR EXISTS(SELECT 1 FROM production_output_lots ol JOIN output_reservation_events r ON (r.tenant_id,r.site_id,r.output_lot_id)=(ol.tenant_id,ol.site_id,ol.id) WHERE (ol.tenant_id,ol.site_id,ol.production_event_id)=(p.tenant_id,p.site_id,p.id))
  ) dependent,
  EXISTS(SELECT 1 FROM production_correction_requests cr WHERE (cr.tenant_id,cr.site_id,cr.production_event_id)=(p.tenant_id,p.site_id,p.id) AND NOT EXISTS(SELECT 1 FROM production_correction_decisions cd WHERE (cd.tenant_id,cd.site_id,cd.request_id)=(cr.tenant_id,cr.site_id,cr.id))) pending_request
 FROM production_events p JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(p.tenant_id,p.site_id,p.work_order_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id)
 LEFT JOIN LATERAL (SELECT r.id,r.quantity FROM production_correction_requests r JOIN production_correction_decisions d ON (d.tenant_id,d.site_id,d.request_id)=(r.tenant_id,r.site_id,r.id) WHERE (r.tenant_id,r.site_id,r.production_event_id)=(p.tenant_id,p.site_id,p.id) AND d.approved ORDER BY d.created_at DESC,r.id DESC LIMIT 1) last_edit ON true
 WHERE p.tenant_id=$1 AND p.site_id=$2 AND w.order_id=$3 AND w.id=$4`,[s.tenantId,s.siteId,order,job])).rows;
}
function unavailable(e,s,roles){
 if(!isManager(roles)&&e.actor_id!==s.identity.userId)return 'Yalnızca kendi kaydınızı düzenleyebilirsiniz.';
 if(!['running','paused'].includes(e.job_status)||e.order_status!=='open')return 'Bitirilmiş, iptal edilmiş veya kapalı işte kayıt düzenlenemez.';
 if(!isManager(roles)&&new Date(e.server_time).getTime()>=new Date(e.expires_at).getTime())return '5 dakikalık düzenleme süresi doldu. Yönetici düzenleyebilir.';
 if(e.unlinked||!['pending','scrap','setup_scrap'].includes(e.kind))return 'Bu kaydın miktarları düzenleme için doğrulanamadı.';
 if(e.dependent)return 'Bu kayda bağlı kalite, sevkiyat, rezervasyon veya telafi işlemi var; doğrudan düzenlenemez.';
 if(e.pending_request)return 'Bu kayıt için bekleyen bir düzeltme talebi var.';
 return null;
}
async function metadata(c,s,order,job){
 const membership=(await c.query('SELECT superadmin,tenant_admin,site_roles FROM ritim_memberships($1) WHERE tenant_id=$2 AND site_id=$3',[s.identity.userId,s.tenantId,s.siteId])).rows[0];
 const roles=[...(membership?.site_roles||[]),...(membership?.tenant_admin?['tenant_admin']:[]),...(membership?.superadmin?['superadmin']:[])];
 return Object.fromEntries((await entries(c,s,order,job)).map(e=>{const reason=unavailable(e,s,roles);return [e.id,{canEdit:!reason,reason,expiresAt:isManager(roles)?null:e.expires_at,serverTime:e.server_time,version:e.version,quantity:number(e.quantity)}]}));
}
function routes(api){
 api.post('/sites/:tenantId/:siteId/orders/:orderId/work-orders/:workOrderId/production/entry-corrections',async(req,reply)=>{
  const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),workOrderId:identifier(req.params.workOrderId),eventId:identifier(b.eventId),version:b.version==null?null:identifier(b.version),quantity:b.quantity,reason:typeof b.reason==='string'?b.reason.trim():''};
  if(!Number.isSafeInteger(p.quantity)||p.quantity<0||p.reason.length<3||p.reason.length>1000)fail(400,'INVALID_INPUT','Geçerli adet ve en az 3 karakterlik gerekçe girin.');
  const result=await cmd(req,'production.entry.edit','production.write',p,async(c,scope)=>{
   await lockedOrder(c,s,p.orderId);
   const e=(await entries(c,s,p.orderId,p.workOrderId)).find(x=>x.id===p.eventId);
   if(!e)fail(404,'NOT_FOUND','Üretim kaydı bulunamadı.');
   const blocked=unavailable(e,s,scope.roles);if(blocked)fail(!isManager(scope.roles)&&e.actor_id!==s.identity.userId?403:409,'ENTRY_EDIT_UNAVAILABLE',blocked);
   if((e.version||null)!==p.version)fail(409,'VERSION_CONFLICT','Kayıt değişmiş. İş geçmişini yenileyin.');
   if(p.quantity===number(e.quantity))fail(400,'INVALID_INPUT','Yeni adet mevcut adetten farklı olmalı.');
   const before=await require('./production-execution').reconciled(c,s,p.workOrderId);
   const consumed=(await c.query("SELECT lot_id FROM production_ledger WHERE tenant_id=$1 AND site_id=$2 AND work_order_id=$3 AND production_event_id=$4 AND kind='consume'",[s.tenantId,s.siteId,p.workOrderId,p.eventId])).rows[0];
   const lot=before.lots.find(l=>l.lotId===consumed?.lot_id);
   if(!lot||p.quantity>number(e.quantity)+lot.available)fail(409,'INSUFFICIENT_PHYSICAL_STOCK','Yeni adet kullanılabilir girdi miktarını aşıyor.');
   const id=randomUUID();
   await c.query('INSERT INTO production_correction_requests(tenant_id,site_id,id,work_order_id,production_event_id,original_quantity,quantity,reason,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())',[s.tenantId,s.siteId,id,p.workOrderId,p.eventId,e.quantity,p.quantity,p.reason,s.identity.userId]);
   await c.query('INSERT INTO production_correction_decisions(tenant_id,site_id,request_id,approved,reason,actor_id,created_at) VALUES($1,$2,$3,true,$4,$5,clock_timestamp())',[s.tenantId,s.siteId,id,p.reason,s.identity.userId]);
   await require('./production-execution').reconciled(c,s,p.workOrderId);
   await audit(c,s,'production.entry.corrected','work_order',p.workOrderId,{...p,correctionId:id,previousQuantity:number(e.quantity),source:isManager(scope.roles)?'manager':'operator_five_minutes'});
   await require('./operator-target').sync(c,s,p.workOrderId);return {status:200,body:{id,eventId:p.eventId,previousQuantity:number(e.quantity),quantity:p.quantity}};
  });return reply.code(result.status).send(result.body);
 });
}
module.exports={routes,metadata,unavailable};
