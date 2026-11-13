'use strict';
const crypto=require('node:crypto');
const {data,payload,identifier,qty,str,cmd,scoped,audit,lockedOrder,number,fail}=require('./orders-planning');
async function losses(c,s,order){
 const args=[s.tenantId,s.siteId,order];
 const rows=(await c.query(`SELECT e.id,'production_event' kind,e.quantity_pieces quantity,w.work_order_number label FROM effective_production_events e JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(e.tenant_id,e.site_id,e.work_order_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 AND e.kind IN ('scrap','setup_scrap') AND EXISTS(SELECT 1 FROM effective_production_ledger i JOIN effective_production_ledger x ON (x.tenant_id,x.site_id,x.order_id,x.work_order_id,x.production_event_id,x.lot_id,x.quantity_pieces)=(i.tenant_id,i.site_id,i.order_id,i.work_order_id,i.production_event_id,i.lot_id,i.quantity_pieces) WHERE (i.tenant_id,i.site_id,i.order_id,i.work_order_id,i.production_event_id,i.quantity_pieces)=(w.tenant_id,w.site_id,w.order_id,w.id,e.id,e.quantity_pieces) AND i.kind='consume' AND x.kind=e.kind)
 UNION ALL SELECT d.id,'disposition',d.quantity_pieces,w.work_order_number FROM output_dispositions d JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(d.tenant_id,d.site_id,d.work_order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.order_id=$3 AND d.outcome='rejected'
 UNION ALL SELECT id,'rma_disposition',quantity_pieces,'Müşteri iadesi' FROM rma_dispositions WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND outcome='scrap'`,args)).rows;
 const approvals=(await c.query('SELECT a.*,COALESCE((SELECT SUM(p.quantity) FROM production_orders p WHERE (p.tenant_id,p.site_id,p.compensation_id)=(a.tenant_id,a.site_id,a.id) AND p.cancelled_at IS NULL),0) allocated FROM production_compensations a WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY created_at,id',args)).rows;
 for(const a of approvals)a.order_item_id=await require('./order-items').compensationItem(c,s,a.id);return {losses:rows.map(x=>{const used=approvals.filter(a=>a[x.kind+'_id']===x.id).reduce((n,a)=>n+number(a.quantity),0);return {id:x.id,kind:x.kind,label:x.label,quantity:number(x.quantity),available:number(x.quantity)-used}}),approvals:approvals.map(x=>({orderItemId:x.order_item_id,id:x.id,quantity:number(x.quantity),allocated:number(x.allocated),available:number(x.quantity)-number(x.allocated),reason:x.reason}))};
}
async function closing(c,s,id,acceptRemainder=false){
 const o=await lockedOrder(c,s,id),args=[s.tenantId,s.siteId,id];
 const ship=await require('./shipping-service').view(c,s,id);
 const returned=number((await c.query('SELECT COALESCE(SUM(quantity_pieces),0) n FROM rma_receipts WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3',args)).rows[0].n);
 const netDelivered=ship.totals.delivered-returned,reasons=[],remainingItems=[];
 const closures=(await c.query('SELECT item_id,quantity,reason,created_at::text created_at FROM order_quantity_closures WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3',args)).rows;
 const closedQuantity=closures.reduce((n,x)=>n+number(x.quantity),0);
 for(const item of await require('./order-items').items(c,s,id)){
  const delivered=o.itemized?await require('./order-items').shippingBalance(c,s,id,item.id,'deliver'):netDelivered;
  const waived=number(closures.find(x=>x.item_id===item.id)?.quantity||0),remaining=item.orderedQuantity-delivered-waived;
  if(remaining>0)remainingItems.push({itemId:item.id,partName:item.partName,quantity:remaining,delivered,orderedQuantity:item.orderedQuantity});
  if(remaining<0||remaining>0&&!acceptRemainder)reasons.push(item.lineNumber+'. ürün: '+(item.partName||item.partNumber||'Ürün')+' · Teslim '+delivered+' / '+item.orderedQuantity+(waived?' · Kapatılan '+waived:''));
 }
 if(netDelivered+closedQuantity!==number(o.ordered_qty)&&!acceptRemainder)reasons.push('Net teslimat ve gerekçeyle kapatılan miktar sipariş miktarına eşit olmalı');
 if(acceptRemainder){
  const facts=await require('./workflow-summary').facts(c,s,{orderId:id});
  if(facts.some(x=>x.remainingInput>0||x.supplierOutstanding>0||x.qualityPending>0||x.repairPending>0))reasons.push('Malzeme, fason ve kalite bakiyeleri çözülmeli.');
  const outputs=(await c.query('SELECT id FROM production_output_lots WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3',args)).rows;
  for(const lot of outputs){const balance=await require('./output-reservations').lotView(c,s,id,lot.id);if(balance.availableApproved>0||balance.reservations.some(x=>x.outstanding>0)){reasons.push('Sevk edilmemiş veya başka operasyona ayrılmış ürün bakiyesi çözülmeli.');break;}}
  if(netDelivered<0||netDelivered>number(o.ordered_qty))reasons.push('Teslimat miktarı uzlaştırılmalı.');
 }
 if(ship.totals.inTransit||ship.totals.awaitingDispatch)reasons.push('Açık sevkiyat var');
 if((await c.query("SELECT 1 FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND status NOT IN ('complete','cancelled') LIMIT 1",args)).rowCount)reasons.push('Tamamlanmamış iş emri var');
 if((await c.query("SELECT 1 FROM production_orders p WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND p.cancelled_at IS NULL AND (planning_state<>'planned' OR NOT EXISTS(SELECT 1 FROM work_orders w WHERE (w.tenant_id,w.site_id,w.production_order_id)=(p.tenant_id,p.site_id,p.id))) LIMIT 1",args)).rowCount)reasons.push('Planlanmamış üretim emri var');
 if((await c.query(`SELECT 1 FROM rma_authorizations a WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.order_id=$3 AND a.quantity_pieces>COALESCE((SELECT SUM(r.quantity_pieces) FROM rma_receipts r WHERE (r.tenant_id,r.site_id,r.rma_id)=(a.tenant_id,a.site_id,a.id)),0)
 UNION ALL SELECT 1 FROM rma_receipts r WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.order_id=$3 AND r.quantity_pieces>COALESCE((SELECT SUM(d.quantity_pieces) FROM rma_inspections i JOIN rma_dispositions d ON (d.tenant_id,d.site_id,d.inspection_id)=(i.tenant_id,i.site_id,i.id) WHERE (i.tenant_id,i.site_id,i.receipt_id)=(r.tenant_id,r.site_id,r.id)),0)
 UNION ALL SELECT 1 FROM rma_dispositions d WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.order_id=$3 AND ((d.outcome='approved' AND d.quantity_pieces>COALESCE((SELECT SUM(r.quantity_pieces) FROM rma_releases r WHERE (r.tenant_id,r.site_id,r.disposition_id)=(d.tenant_id,d.site_id,d.id)),0)) OR (d.outcome='rework' AND NOT EXISTS(SELECT 1 FROM rma_rework_inputs i JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(i.tenant_id,i.site_id,i.work_order_id) WHERE (i.tenant_id,i.site_id,i.disposition_id)=(d.tenant_id,d.site_id,d.id) AND w.status='complete'))) LIMIT 1`,args)).rowCount)reasons.push('Açık iade veya karantina işlemi var');
 return {orderId:id,status:o.status,version:o.version,orderedQuantity:number(o.ordered_qty),netDelivered,returned,closedQuantity,closures,remainingItems,canClose:o.status==='open'&&!o.execution_hold&&!reasons.length,reasons};
}
function routes(api){const base='/sites/:tenantId/:siteId/orders/:orderId';
 api.post(base+'/close-remainder',async(req,reply)=>{
  const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),version:b.version,reason:str(b.reason,'Müşterinin kalan miktarı kapatma gerekçesi')};
  if(!Number.isSafeInteger(p.version)||p.version<1)fail(400,'INVALID_INPUT','Güncel sürüm gerekli');
  if(b.customerAccepted!==true)fail(400,'CUSTOMER_APPROVAL_REQUIRED','Müşterinin eksik teslimatı kabul ettiğini doğrulayın.');
  const r=await cmd(req,'order.close_remainder','orders.write',{...p,customerAccepted:true},async c=>{
   const state=await closing(c,s,p.orderId,true);if(state.version!==p.version)fail(409,'VERSION_CONFLICT','Sipariş değişti; yeniden inceleyin.');
   if(!state.canClose||!state.remainingItems.length)fail(409,'CLOSING_BLOCKED',state.reasons.join('; ')||'Kapatılacak kalan miktar yok veya sipariş açık değil.');
   for(const x of state.remainingItems)await c.query('INSERT INTO order_quantity_closures(tenant_id,site_id,order_id,item_id,quantity,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.tenantId,s.siteId,p.orderId,x.itemId,x.quantity,p.reason,s.identity.userId]);
   await c.query("UPDATE orders SET status='closed',version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.orderId]);
   await audit(c,s,'order.remainder_closed','order',p.orderId,{...p,customerAccepted:true,items:state.remainingItems,netDelivered:state.netDelivered});
   return {status:200,body:await closing(c,s,p.orderId)};
  });return reply.code(r.status).send(r.body);
 });
 api.get(base+'/compensations',req=>scoped(req,(c,s)=>losses(c,s,identifier(req.params.orderId))));
 api.get(base+'/closing',req=>scoped(req,(c,s)=>closing(c,s,identifier(req.params.orderId))));
 api.post(base+'/compensations',async(req,reply)=>{const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),sourceId:identifier(b.sourceId),sourceKind:b.sourceKind,quantity:qty(b.quantity),reason:str(b.reason,'reason')};if(!['production_event','disposition','rma_disposition'].includes(p.sourceKind))fail(400,'INVALID_INPUT','Kayıp kaynağı gerekli');const r=await cmd(req,'compensation.approve','quality.write',p,async c=>{const o=await lockedOrder(c,s,p.orderId);if(o.status!=='open'&&(o.status!=='closed'||p.sourceKind!=='rma_disposition'))fail(409,'ORDER_CLOSED','Only return losses can be replaced on a closed order');const source=(await losses(c,s,p.orderId)).losses.find(x=>x.id===p.sourceId&&x.kind===p.sourceKind);if(!source||p.quantity>source.available)fail(409,'COMPENSATION_EXCEEDED','Telafi belgelenmiş kaybı aşıyor');const id=crypto.randomUUID();await c.query(`INSERT INTO production_compensations(tenant_id,site_id,order_id,id,${p.sourceKind+'_id'},quantity,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[s.tenantId,s.siteId,p.orderId,id,p.sourceId,p.quantity,p.reason,s.identity.userId]);await audit(c,s,'compensation.approved','order',p.orderId,{...p,id});return {status:201,body:{id,...p}}});return reply.code(r.status).send(r.body)});
 api.post(base+'/close',async(req,reply)=>{const s=data(req),b=payload(req),p={orderId:identifier(req.params.orderId),reason:str(b.reason,'reason')};const r=await cmd(req,'order.close','orders.write',p,async c=>{const state=await closing(c,s,p.orderId);if(!state.canClose)fail(409,'CLOSING_BLOCKED',state.reasons.join('; ')||'Sipariş zaten kapalı');await c.query("UPDATE orders SET status='closed' WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.orderId]);await audit(c,s,'order.closed','order',p.orderId,{...p,netDelivered:state.netDelivered});return {status:200,body:{...state,status:'closed',canClose:false}}});return reply.code(r.status).send(r.body)});
}
module.exports={routes,losses,closing};
