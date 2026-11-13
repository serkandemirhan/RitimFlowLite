'use strict';
const {number,audit}=require('./orders-planning');
// Production history is never rewritten. Rejected pieces and scrap cannot satisfy
// the useful-output target. Physical input remains a separate prerequisite.
async function read(c,s,id){
 const r=(await c.query(`SELECT w.*,op.kind,op.sequence,
 COALESCE((SELECT SUM(e.quantity_pieces) FROM effective_production_events e WHERE (e.tenant_id,e.site_id,e.work_order_id)=(w.tenant_id,w.site_id,w.id) AND e.kind IN ('good','pending')),0) produced,
 COALESCE((SELECT SUM(d.quantity_pieces) FROM output_dispositions d WHERE (d.tenant_id,d.site_id,d.work_order_id)=(w.tenant_id,w.site_id,w.id) AND d.outcome='approved'),0) approved,
 COALESCE((SELECT SUM(d.quantity_pieces) FROM output_dispositions d WHERE (d.tenant_id,d.site_id,d.work_order_id)=(w.tenant_id,w.site_id,w.id) AND d.outcome IN ('rejected','rework')),0) rejected,
 COALESCE((SELECT SUM(b.quantity_pieces) FROM shipping_quality_bypasses b WHERE (b.tenant_id,b.site_id,b.work_order_id)=(w.tenant_id,w.site_id,w.id)),0) bypassed,
 COALESCE((SELECT SUM(e.quantity_pieces) FROM effective_production_events e WHERE (e.tenant_id,e.site_id,e.work_order_id)=(w.tenant_id,w.site_id,w.id) AND e.kind IN ('scrap','setup_scrap')),0) scrap,
 (SELECT payload->>'state' FROM audit_events e WHERE (e.tenant_id,e.site_id,e.entity_id)=(w.tenant_id,w.site_id,w.id) AND e.event_type='operator.lifecycle' ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) lifecycle
 FROM work_orders w JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.id=$3`,[s.tenantId,s.siteId,id])).rows[0];
 if(!r)return null;
 const target=number(r.planned_qty),produced=number(r.produced),approved=number(r.approved),rejected=number(r.rejected),bypassed=number(r.bypassed),scrap=number(r.scrap);
 return {...r,target,produced,approved,rejected,bypassed,scrap,useful:produced-rejected,pending:Math.max(0,produced-approved-rejected-bypassed),missing:Math.max(0,target-(produced-rejected))};
}
async function sync(c,s,id){
 const x=await read(c,s,id);if(!x||!x.production_order_id||x.kind!=='internal'||x.purpose!=='normal'||x.status==='cancelled')return null;
 // Never reopen a manually completed historical job.
 if(x.status==='complete'&&x.lifecycle!=='completed')return null;
 const facts=(await require('./workflow-summary').facts(c,s,{ids:[id]}))[0];
 if(!facts||facts.executionHeld||facts.blockers.some(b=>['closed','held','order_held','unplanned','reconciliation','operator_revoked','drawing','repair_task','transit','repair'].includes(b.code)))return x;
 let lifecycle=null,status=x.status,message='';
 if(x.useful>=x.target){
  if(x.pending>0){lifecycle='awaiting_quality';status='paused';message='İstenen üretim hedefi tamamlandı. Kalite onayı bekleniyor.';}
  else {lifecycle='completed';status='complete';message=x.bypassed?'İş emri kapatıldı. '+x.bypassed+' adet kalite kontrolü yapılmadan sevk edildi.':'Kalite onayları tamamlandı; iş emri kapatıldı.';}
 }else if(x.lifecycle==='awaiting_quality'||x.lifecycle==='completed'||x.lifecycle==='needs_production'){
  lifecycle='needs_production';status=x.status==='running'?'running':'paused';message='Kalite sonucu nedeniyle '+x.missing+' adet eksik. İş emri yeniden üretime açıldı.';
 }
 if(!lifecycle)return x;
 if(lifecycle==='completed'){
  const balance=await require('./production-execution').reconciled(c,s,id);
  const incoming=await c.query(`SELECT 1 FROM flow_transfers t WHERE t.tenant_id=$1 AND t.site_id=$2 AND t.destination_work_order_id=$3
   AND NOT EXISTS(SELECT 1 FROM physical_ledger l WHERE (l.tenant_id,l.site_id,l.transfer_id)=(t.tenant_id,t.site_id,t.id) AND l.event_type='accept') LIMIT 1`,[s.tenantId,s.siteId,id]);
  if(balance.remainingUsableInput||incoming.rowCount)return x;
 }
 if(lifecycle==='awaiting_quality'){
  const p=await require('./final-control').context(c,s,id);
  if(p?.final_control_enabled&&p.is_final)await c.query(`INSERT INTO final_control_tasks(tenant_id,site_id,order_id,id,work_order_id)
   SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM work_orders w WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.production_order_id=$4 AND w.id<>$5 AND w.purpose='normal' AND w.status<>'complete') ON CONFLICT DO NOTHING`,[s.tenantId,s.siteId,x.order_id,p.id,id]);
 }
 if(status!==x.status)await c.query('UPDATE work_orders SET status=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,id,status]);
 if(lifecycle!==x.lifecycle)await audit(c,s,'operator.lifecycle','work_order',id,{state:lifecycle,message,target:x.target,approved:x.approved,pending:x.pending,missing:x.missing,shippedUninspected:x.bypassed});
 return {...x,status,lifecycle,message};
}
module.exports={read,sync};
