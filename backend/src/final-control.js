'use strict';
const crypto=require('node:crypto');
const {data,scoped,cmd,identifier,qty,str,number,fail,lockedOrder,audit}=require('./orders-planning');
async function context(c,s,job){return (await c.query(`SELECT p.id,p.final_control_enabled,p.allow_uninspected_shipping,
 op.sequence=(SELECT MAX(x.sequence) FROM operations x WHERE (x.tenant_id,x.site_id,x.production_order_id)=(p.tenant_id,p.site_id,p.id)) is_final
 FROM work_orders w JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.id=$3 AND w.purpose='normal'`,[s.tenantId,s.siteId,job])).rows[0]||null;}
async function deferred(c,s,job){const p=await context(c,s,job);return !!(p?.final_control_enabled&&p.is_final);}
async function rules(c,s){const r=(await c.query('SELECT allow_uninspected,version FROM site_shipping_rules WHERE tenant_id=$1 AND site_id=$2',[s.tenantId,s.siteId])).rows[0];return {allowUninspected:r?.allow_uninspected||false,version:r?.version||0};}
async function change(req,b){if(typeof b.allowUninspected!=='boolean'||!Number.isSafeInteger(b.version)||b.version<0)fail(400,'INVALID_INPUT','Geçersiz sevkiyat kuralı');const s=data(req),p={allowUninspected:b.allowUninspected,version:b.version};return cmd(req,'shipping.rules','members.manage',p,async c=>{
 const result=await c.query(`INSERT INTO site_shipping_rules(tenant_id,site_id,allow_uninspected,version) VALUES($1,$2,$3,1)
 ON CONFLICT(tenant_id,site_id) DO UPDATE SET allow_uninspected=EXCLUDED.allow_uninspected,version=site_shipping_rules.version+1 WHERE site_shipping_rules.version=$4 RETURNING version`,[s.tenantId,s.siteId,p.allowUninspected,p.version]);
 if(!result.rowCount||p.version!==0&&result.rows[0].version===1)fail(409,'STALE_VERSION','Kural değişti; sayfayı yenileyin.');await audit(c,s,'shipping.rule_changed','site',s.siteId,p);return {status:200,body:await rules(c,s)};
});}
async function recordBypass(c,s,order,source,allocation,amount){
 if(!amount)return;const lot=source,policy=await context(c,s,lot.sourceWorkOrderId);
 if(!policy?.final_control_enabled||!policy.is_final||!policy.allow_uninspected_shipping||amount>lot.qualityPending)fail(409,'QUALITY_APPROVAL_REQUIRED','Son kalite kontrol onayı gerekli.');
 await c.query('INSERT INTO shipping_quality_bypasses(tenant_id,site_id,order_id,allocation_id,output_lot_id,work_order_id,production_event_id,quantity_pieces,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s.tenantId,s.siteId,order,allocation,source.lotId,lot.sourceWorkOrderId,lot.productionEventId,amount,s.identity.userId]);
 await audit(c,s,'shipping.without_final_control','order',order,{allocationId:allocation,outputLotId:source.lotId,quantity:amount,productionOrderId:policy.id});await require('./operator-target').sync(c,s,lot.sourceWorkOrderId);
}
function routes(api){
 api.get('/sites/:tenantId/:siteId/shipping/rules',req=>scoped(req,(c,s)=>rules(c,s)));
 api.post('/sites/:tenantId/:siteId/shipping/rules',async(req,reply)=>{const r=await change(req,req.body||{});return reply.code(r.status).send(r.body)});
 api.post('/sites/:tenantId/:siteId/orders/:orderId/final-controls/:taskId/decisions',async(req,reply)=>{
  const s=data(req),b=req.body||{},p={orderId:identifier(req.params.orderId),taskId:identifier(req.params.taskId),quantity:qty(b.quantity),outcome:b.outcome,evidence:str(b.evidence,'evidence'),documentIds:require('./quality-documents').ids(b.documentIds)||[]};
  if(!['approved','rejected'].includes(p.outcome))fail(400,'INVALID_INPUT','Son kontrol sonucu gerekli.');
  const r=await cmd(req,'quality.final_control','quality.write',p,async c=>{const o=await lockedOrder(c,s,p.orderId);const task=(await c.query('SELECT * FROM final_control_tasks WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4',[s.tenantId,s.siteId,p.orderId,p.taskId])).rows[0];if(!task)fail(404,'NOT_FOUND','Son kontrol görevi bulunamadı.');await require('./after-sales').assertJob(c,s,o,task.work_order_id);await require('./operator-quality-skip').assertActive(c,s,task.work_order_id);
   const x=await require('./quality-disposition').source(c,s,p.orderId,task.work_order_id);if(p.quantity>x.rows.reduce((n,r)=>n+r.undisposed,0))fail(409,'DISPOSITION_EXCEEDED','Yalnızca elde kalan kontrolsüz miktar kontrol edilebilir.');let remaining=p.quantity;
   for(const row of x.rows){const n=Math.min(remaining,row.undisposed);if(!n)continue;const event=x.events.find(e=>e.id===row.eventId),id=crypto.randomUUID();await c.query('INSERT INTO output_dispositions(tenant_id,site_id,order_id,id,output_ledger_id,work_order_id,lot_id,production_event_id,output_kind,outcome,quantity_pieces,evidence,actor_id,output_lot_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[s.tenantId,s.siteId,p.orderId,id,event.ledger_id,task.work_order_id,row.lotId,row.eventId,event.kind,p.outcome,n,p.evidence,s.identity.userId,event.output_lot_id]);await require('./quality-documents').link(c,s,task.work_order_id,id,p.documentIds);await audit(c,s,'quality.disposition','work_order',task.work_order_id,{...p,decisionId:id,eventId:row.eventId,quantity:n,finalControl:true});remaining-=n;}
   await require('./operator-target').sync(c,s,task.work_order_id);return {status:201,body:{id:p.taskId,quantity:p.quantity,outcome:p.outcome}};
  });return reply.code(r.status).send(r.body);
 });
}
module.exports={context,deferred,rules,change,recordBypass,routes};
