'use strict';
const crypto=require('node:crypto');
const {data,payload,identifier,str,cmd,scoped,audit,lockedOrder,fail}=require('./orders-planning');

async function snapshot(c,s,orderId,productionId=null){
 const order=await lockedOrder(c,s,orderId),args=[s.tenantId,s.siteId,orderId,productionId];
 const production=productionId?(await c.query('SELECT * FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4 FOR UPDATE',args)).rows[0]:null;
 if(productionId&&!production)fail(404,'NOT_FOUND','Üretim emri bulunamadı');
 const jobs=(await c.query('SELECT id,work_order_number,status FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND ($4::uuid IS NULL OR production_order_id=$4) ORDER BY id',args)).rows;
 const history=(await c.query("SELECT id,event_type,occurred_at,payload,ritim_audit_actor_name(tenant_id,site_id,id) actor_name FROM audit_events WHERE tenant_id=$1 AND site_id=$2 AND ((entity_type='order' AND entity_id=$3) OR (entity_type='production_order' AND entity_id=$4)) AND event_type IN ('execution.hold','execution.resume','execution.cancel','execution.reopen','production_order.hold','production_order.resume') ORDER BY occurred_at DESC,id DESC LIMIT 20",args)).rows;
 const facts=await require('./workflow-summary').facts(c,s,{orderId});const selected=facts.filter(j=>!productionId||j.productionOrderId===productionId);
 const shipping=(await require('./shipping-service').view(c,s,orderId)).totals;
 const followUp={remainingInput:selected.reduce((n,j)=>n+j.remainingInput,0),supplierOutstanding:selected.reduce((n,j)=>n+j.supplierOutstanding,0),qualityPending:selected.reduce((n,j)=>n+j.qualityPending,0),repairPending:selected.reduce((n,j)=>n+j.repairPending,0),shippingScope:'order',awaitingDispatch:shipping.awaitingDispatch,inTransit:shipping.inTransit};
 const cancelled=order.status==='cancelled'||!!production?.cancelled_at;
 const held=production?production.planning_state==='held':order.execution_hold;
 const token=crypto.createHash('sha256').update(JSON.stringify([order.version,order.status,order.execution_hold,production?.version,production?.cancelled_at,jobs])).digest('hex');
 return {history:history.map(x=>({...x,occurred_at:new Date(x.occurred_at).toISOString()})),followUp,orderId,productionId,label:production?.number||order.order_number,status:cancelled?'cancelled':order.status!=='open'?'closed':held?'held':'open',parentHeld:order.execution_hold,token,jobs,active:jobs.filter(j=>!['complete','cancelled'].includes(j.status)).length,running:jobs.filter(j=>j.status==='running').length};
}
function routes(api){
 const base='/sites/:tenantId/:siteId/orders/:orderId/execution-control';
 api.get(base,req=>scoped(req,(c,s)=>snapshot(c,s,identifier(req.params.orderId),req.query.productionId?identifier(req.query.productionId):null)));
 api.post(base,async(req,reply)=>{
  const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),productionId:b.productionId?identifier(b.productionId):null,action:b.action,reason:str(b.reason,'reason'),token:str(b.token,'token')};
  if(!['hold','resume','cancel','reopen'].includes(p.action))fail(400,'INVALID_INPUT','Geçersiz işlem');
  const result=await cmd(req,'execution.control','orders.write',p,async c=>{
   const state=await snapshot(c,s,p.orderId,p.productionId);
   if(state.token!==p.token)fail(409,'VERSION_CONFLICT','İşlerin durumu değişti. Pencereyi kapatıp güncel durumu inceleyin.');
   if(p.action==='reopen'){
    if(p.productionId||state.status!=='cancelled')fail(409,'INVALID_STATE','Yalnızca iptal edilmiş sipariş yeniden açılabilir.');
    const cancellation=(await c.query("SELECT occurred_at::text occurred_at FROM audit_events WHERE tenant_id=$1 AND site_id=$2 AND entity_type='order' AND entity_id=$3 AND event_type='execution.cancel' ORDER BY occurred_at DESC,id DESC LIMIT 1",[s.tenantId,s.siteId,p.orderId])).rows[0];
    await c.query("UPDATE orders SET status='open',execution_hold=false,execution_hold_reason=NULL,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.orderId]);
    let restored=0;
    if(cancellation){const jobs=(await c.query(`SELECT w.id,e.payload->>'previousStatus' previous_status,
      EXISTS(SELECT 1 FROM audit_events started WHERE (started.tenant_id,started.site_id,started.entity_id)=(w.tenant_id,w.site_id,w.id) AND started.event_type IN ('production.start','production.resume')) started
      FROM work_orders w JOIN audit_events e ON (e.tenant_id,e.site_id,e.entity_id)=(w.tenant_id,w.site_id,w.id) AND e.event_type='production.cancel' AND e.entity_type='work_order'
      WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 AND w.status='cancelled' AND e.occurred_at=$4 AND e.payload->>'source'='execution_control' AND e.payload->>'orderId'=$3::text AND e.payload->>'productionId' IS NULL
      AND NOT EXISTS(SELECT 1 FROM production_orders po WHERE (po.tenant_id,po.site_id,po.id)=(w.tenant_id,w.site_id,w.production_order_id) AND po.cancelled_at IS NOT NULL)`,[s.tenantId,s.siteId,p.orderId,cancellation.occurred_at])).rows;
     for(const job of jobs){const status=job.previous_status==='waiting'||!job.previous_status&&!job.started?'waiting':'paused';await c.query('UPDATE work_orders SET status=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,job.id,status]);await audit(c,s,'production.reopen','work_order',job.id,{reason:p.reason,source:'execution_control',orderId:p.orderId,status});restored++;}
    }
    await audit(c,s,'execution.reopen','order',p.orderId,{...p,restoredJobs:restored});
    return {status:200,body:await snapshot(c,s,p.orderId)};
   }
   if(['closed','cancelled'].includes(state.status))fail(409,'INVALID_STATE','Kapalı veya iptal edilmiş kayıt değiştirilemez');
   if(p.action==='resume'&&(state.status!=='held'||p.productionId&&state.parentHeld))fail(409,'INVALID_STATE','Önce siparişin durdurmasını kaldırın');
   if(p.action==='hold'&&state.status==='held')fail(409,'INVALID_STATE','Zaten durdurulmuş');
   if(p.productionId){
    if(p.action==='cancel')await c.query("UPDATE production_orders SET cancelled_at=now(),resume_state=COALESCE(resume_state,planning_state),planning_state='held',hold_reason=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.productionId,p.reason]);
    else if(p.action==='hold')await c.query("UPDATE production_orders SET resume_state=planning_state,planning_state='held',hold_reason=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.productionId,p.reason]);
    else await c.query("UPDATE production_orders SET planning_state=resume_state,resume_state=NULL,hold_reason=NULL,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.productionId]);
   }else if(p.action==='cancel')await c.query("UPDATE orders SET status='cancelled',execution_hold=false,execution_hold_reason=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.orderId,p.reason]);
   else await c.query('UPDATE orders SET execution_hold=$4,execution_hold_reason=$5,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,p.orderId,p.action==='hold',p.action==='hold'?p.reason:null]);
   if(p.action!=='resume'){
    const changed=(await c.query("UPDATE work_orders SET status=$5 WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND ($4::uuid IS NULL OR production_order_id=$4) AND status NOT IN ('complete','cancelled') AND ($5='cancelled' OR status='running') RETURNING id",[s.tenantId,s.siteId,p.orderId,p.productionId,p.action==='cancel'?'cancelled':'paused'])).rows;
    for(const job of changed)await audit(c,s,'production.'+(p.action==='cancel'?'cancel':'pause'),'work_order',job.id,{reason:p.reason,source:'execution_control',orderId:p.orderId,productionId:p.productionId,previousStatus:state.jobs.find(x=>x.id===job.id)?.status});
   }
   await audit(c,s,'execution.'+p.action,p.productionId?'production_order':'order',p.productionId||p.orderId,{...p,affectedJobs:state.active,runningJobs:state.running});
   return {status:200,body:await snapshot(c,s,p.orderId,p.productionId)};
  });return reply.code(result.status).send(result.body);
 });
}
module.exports={routes,snapshot};
