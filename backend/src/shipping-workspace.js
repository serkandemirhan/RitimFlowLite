'use strict';
const crypto=require('node:crypto');
const {scoped,data,identifier,qty,number,fail,cmd,lockedOrder,audit}=require('./orders-planning');
const {inTransaction}=require('./db'),{authorizeScope}=require('./authorization');
const shipping=require('./shipping-service');

// One authoritative projection for the selector, the product form and the write.
async function products(c,s,order,snapshot=null){
 const v=snapshot||await shipping.view(c,s,order.id);
 const items=order.itemized?(await c.query('SELECT id,part_number,part_name,quantity FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY line_number',[s.tenantId,s.siteId,order.id])).rows:[{id:order.id,part_name:order.part_name,part_number:order.part_number,quantity:order.ordered_qty}];
 const balances=new Map(items.map(i=>[i.id,{allocated:0,dispatched:0,delivered:0,returned:0}]));
 if(order.itemized){
  const events=await c.query(`SELECT p.order_item_id,e.event_type,SUM(e.quantity_pieces) n FROM effective_shipping_events e
   JOIN production_output_lots l ON (l.tenant_id,l.site_id,l.id)=(e.tenant_id,e.site_id,e.output_lot_id)
   JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id)
   JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
   WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.order_id=$3 GROUP BY p.order_item_id,e.event_type`,[s.tenantId,s.siteId,order.id]);
  for(const e of events.rows){const b=balances.get(e.order_item_id);if(b)b[{allocate:'allocated',dispatch:'dispatched',deliver:'delivered'}[e.event_type]]=number(e.n);}
  const returned=await c.query(`SELECT p.order_item_id,SUM(r.quantity_pieces) n FROM rma_receipts r
   JOIN rma_authorizations a ON (a.tenant_id,a.site_id,a.id)=(r.tenant_id,r.site_id,r.rma_id)
   JOIN effective_shipping_events e ON (e.tenant_id,e.site_id,e.id)=(a.tenant_id,a.site_id,a.delivery_id)
   JOIN production_output_lots l ON (l.tenant_id,l.site_id,l.id)=(e.tenant_id,e.site_id,e.output_lot_id)
   JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id)
   JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
   WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.order_id=$3 GROUP BY p.order_item_id`,[s.tenantId,s.siteId,order.id]);
  for(const r of returned.rows)if(balances.has(r.order_item_id))balances.get(r.order_item_id).returned=number(r.n);
 }else{const b=balances.get(order.id);b.allocated=v.totals.allocated;b.dispatched=v.totals.dispatched;b.delivered=v.totals.delivered;const legacy=await c.query(`SELECT COALESCE((SELECT SUM(quantity_pieces) FROM shipments WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0)-COALESCE((SELECT SUM(quantity_pieces) FROM customer_returns WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0) legacy,COALESCE((SELECT SUM(quantity_pieces) FROM rma_receipts WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3),0) returned`,[s.tenantId,s.siteId,order.id]);const r=legacy.rows[0];b.allocated+=Number(r.legacy);b.dispatched+=Number(r.legacy);b.delivered+=Number(r.legacy);b.returned=number(r.returned);}
 const metadata=new Map();
 if(v.returnedLots.length){const rows=await c.query(`SELECT l.id,p.order_item_id FROM production_output_lots l
  JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id)
  LEFT JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
  WHERE l.tenant_id=$1 AND l.site_id=$2 AND l.order_id=$3 AND l.id=ANY($4::uuid[])`,[s.tenantId,s.siteId,order.id,v.returnedLots.map(l=>l.lotId)]);for(const r of rows.rows)metadata.set(r.id,r.order_item_id);}
 const sources=[...v.lots.map(l=>({...l,releaseId:null})),...v.returnedLots.map(l=>({...l,orderItemId:metadata.get(l.lotId)}))];
 let globalBudget=order.execution_hold?0:number(v.totals.availableToShip);
 const rows=items.map(i=>{const b=balances.get(i.id),allocated=number(b.allocated-b.returned),dispatched=number(b.dispatched-b.returned),delivered=number(b.delivered-b.returned),ordered=number(i.quantity);let budget=Math.max(0,Math.min(ordered-allocated,globalBudget));const selected=[];
  for(const source of sources){if((order.itemized?source.orderItemId:order.id)!==i.id||!source.availableToShip||!budget)continue;const amount=Math.min(number(source.availableToShip),budget);selected.push({lotId:source.lotId,releaseId:source.releaseId||null,available:amount,approvedAvailable:source.releaseId?amount:Math.min(amount,number(source.availableApproved))});budget-=amount;}
  const ready=selected.reduce((n,l)=>number(n+l.available),0);globalBudget-=ready;
  return {id:i.id,partName:i.part_name||order.part_name,partNumber:i.part_number||null,orderedQuantity:ordered,dispatchedQuantity:dispatched,deliveredQuantity:delivered,awaitingDispatch:Math.max(0,allocated-dispatched),remainingQuantity:Math.max(0,ordered-dispatched),readyQuantity:ready,uninspectedReadyQuantity:selected.reduce((n,l)=>n+Math.max(0,l.available-l.approvedAvailable),0),sources:selected};
 });
 const lineage=(await c.query('SELECT l.id,w.production_order_id FROM production_output_lots l JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id) WHERE l.tenant_id=$1 AND l.site_id=$2 AND l.order_id=$3',[s.tenantId,s.siteId,order.id])).rows,productions=new Map();
 const parent=lot=>{const id=lineage.find(l=>l.id===lot)?.production_order_id;if(!id)return null;if(!productions.has(id))productions.set(id,{id,readyQuantity:0,dispatchedQuantity:0});return productions.get(id)};
 for(const i of rows)for(const source of i.sources){const p=parent(source.lotId);if(p)p.readyQuantity+=source.available;}
 for(const event of v.events)if(event.type==='dispatch'){const p=parent(event.outputLotId);if(p)p.dispatchedQuantity+=event.quantity;}
 return {productions:[...productions.values()],orderId:order.id,orderNumber:order.order_number,customer:order.customer,products:rows,readyQuantity:rows.reduce((n,i)=>number(n+i.readyQuantity),0)};
}

async function ready(c,s,q={},allItems=false){
 if(Object.keys(q).some(k=>!['q','after','limit','include'].includes(k)))fail(400,'INVALID_INPUT','Geçersiz seçim filtresi.');
 const term=q.q??'',limit=q.limit===undefined?30:Number(q.limit),after=q.after?identifier(q.after):null,include=q.include?identifier(q.include):null;
 if(typeof term!=='string'||term.length>120||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Geçersiz seçim filtresi.');
 // Discard unfinished orders in SQL; only reconcile actual final-output candidates.
 const candidates=await c.query(`SELECT o.* FROM orders o WHERE o.tenant_id=$1 AND o.site_id=$2 AND o.status IN ('open','closed') AND NOT o.execution_hold
  AND ($3='' OR strpos(lower(concat_ws(' ',o.order_number,o.customer,o.part_name,o.part_number)),lower($3))>0 OR EXISTS(SELECT 1 FROM order_items i WHERE i.tenant_id=o.tenant_id AND i.site_id=o.site_id AND i.order_id=o.id AND strpos(lower(concat_ws(' ',i.part_name,i.part_number)),lower($3))>0))
  AND (EXISTS(SELECT 1 FROM production_output_lots l JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(l.tenant_id,l.site_id,l.work_order_id)
   JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
   WHERE l.tenant_id=o.tenant_id AND l.site_id=o.site_id AND l.order_id=o.id AND w.status='complete'
   AND op.sequence=(SELECT count(*)-1 FROM operations r WHERE r.tenant_id=w.tenant_id AND r.site_id=w.site_id AND r.order_id=w.order_id AND r.production_order_id IS NOT DISTINCT FROM w.production_order_id))
   OR EXISTS(SELECT 1 FROM rma_releases r WHERE r.tenant_id=o.tenant_id AND r.site_id=o.site_id AND r.order_id=o.id)) ORDER BY o.id`,[s.tenantId,s.siteId,term.trim()]);
 const eligible=[];let unavailable=0;
 for(const order of candidates.rows){try{const p=await products(c,s,order);if(p.readyQuantity>0)eligible.push({id:order.id,orderNumber:order.order_number,customer:order.customer,partName:order.part_name,status:order.status,readyQuantity:p.readyQuantity,readyProductCount:p.products.filter(i=>i.readyQuantity>0).length});}catch(e){if(['INTEGRITY_ERROR','PRODUCTION_RECONCILIATION_REQUIRED','OPERATION_UNSUPPORTED'].includes(e.code))unavailable++;else throw e;}}
 const rows=eligible.filter(o=>!after||o.id>after);return {items:allItems?rows:rows.slice(0,limit),total:eligible.length,nextAfter:rows.length>limit?rows[limit-1].id:null,selected:eligible.find(o=>o.id===include)||null,unavailable};
}

function routes(api){
 api.get('/sites/:tenantId/:siteId/shipping/ready-orders',req=>inTransaction(req.server.pgPool,async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const s=data(req);await authorizeScope(c,{...s,capability:'orders.read'});return ready(c,s,req.query||{});}));
 const base='/sites/:tenantId/:siteId/orders/:orderId/shipping';
 api.get(base+'/products',req=>scoped(req,async(c,s)=>products(c,s,await lockedOrder(c,s,identifier(req.params.orderId)))));
 api.post(base+'/orders/:shippingOrderId/confirm-delivery',async(req,reply)=>{
  const s=data(req),b=req.body||{},p={orderId:identifier(req.params.orderId),shippingOrderId:identifier(req.params.shippingOrderId),quantity:qty(b.quantity),confirmed:b.confirmed};
  if(p.confirmed!==true)fail(400,'INVALID_INPUT','Müşteriye fiziksel teslimatı doğrulayın.');
  const result=await cmd(req,'shipping.confirm_delivery','shipment.write',p,async c=>{
   const order=await lockedOrder(c,s,p.orderId);await require('./after-sales').assertShipping(c,s,order);
   const dispatches=(await c.query(`SELECT e.*,e.quantity_pieces-COALESCE((SELECT SUM(d.quantity_pieces) FROM effective_shipping_events d WHERE d.tenant_id=e.tenant_id AND d.site_id=e.site_id AND d.order_id=e.order_id AND d.shipping_order_id=e.shipping_order_id AND d.dispatch_id=e.id AND d.event_type='deliver'),0) remaining
    FROM effective_shipping_events e WHERE e.tenant_id=$1 AND e.site_id=$2 AND e.order_id=$3 AND e.shipping_order_id=$4 AND e.event_type='dispatch' ORDER BY e.sequence`,[s.tenantId,s.siteId,p.orderId,p.shippingOrderId])).rows.filter(e=>Number(e.remaining)>0);
   if(dispatches.reduce((n,e)=>number(n+number(e.remaining)),0)!==p.quantity)fail(409,'DELIVERY_CHANGED','Teslim bekleyen miktar değişti. Sevkiyatı yenileyip tekrar kontrol edin.');
   for(const e of dispatches)await c.query("INSERT INTO shipping_events(tenant_id,site_id,order_id,id,shipping_order_id,event_type,allocation_id,dispatch_id,output_lot_id,quantity_pieces,actor_id,idempotency_key,rma_release_id) VALUES($1,$2,$3,$4,$5,'deliver',$6,$7,$8,$9,$10,$11,$12)",[s.tenantId,s.siteId,p.orderId,crypto.randomUUID(),p.shippingOrderId,e.allocation_id,e.id,e.output_lot_id,e.remaining,s.identity.userId,req.headers['idempotency-key'],e.rma_release_id]);
   await audit(c,s,'shipping.delivery_confirmed','order',p.orderId,p);return {status:201,body:{id:p.shippingOrderId,orderId:p.orderId,quantity:p.quantity,delivered:true}};
  });return reply.code(result.status).send(result.body);
 });
 api.post(base+'/dispatch-products',async(req,reply)=>{
  const s=data(req),b=req.body||{},orderId=identifier(req.params.orderId);
  if(b.confirmed!==true||!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)fail(400,'INVALID_INPUT','Gönderilecek ürünleri seçin ve fiziksel çıkışı doğrulayın.');
  const lines=b.lines.map(i=>({orderItemId:identifier(i.orderItemId),quantity:qty(i.quantity)}));if(new Set(lines.map(i=>i.orderItemId)).size!==lines.length)fail(400,'INVALID_INPUT','Aynı ürün iki kez seçilemez.');
  const p={orderId,confirmed:true,lines};
  const r=await cmd(req,'shipping.dispatch_products','shipment.write',p,async c=>{
   const order=await lockedOrder(c,s,orderId);await require('./after-sales').assertShipping(c,s,order);const snapshot=await products(c,s,order);
   for(const line of lines){const product=snapshot.products.find(i=>i.id===line.orderItemId);if(!product||line.quantity>product.readyQuantity)fail(409,'SHIPPING_QUANTITY_EXCEEDED','Sevke hazır miktar değişti. Ürün listesini yenileyip adetleri kontrol edin.');}
   const id=crypto.randomUUID();await c.query('INSERT INTO shipping_orders(tenant_id,site_id,order_id,id,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)',[s.tenantId,s.siteId,orderId,id,s.identity.userId,req.headers['idempotency-key']]);
   const events=[];
   for(const line of lines){let remaining=line.quantity;const product=snapshot.products.find(i=>i.id===line.orderItemId);
    for(const source of product.sources){if(!remaining)break;const amount=Math.min(remaining,source.available),uninspected=Math.max(0,amount-source.approvedAvailable),before=uninspected?await shipping.availableLot(c,s,orderId,source.lotId):null,allocation=crypto.randomUUID(),dispatch=crypto.randomUUID();
     for(const [eventId,type,dispatchId]of [[allocation,'allocate',null],[dispatch,'dispatch',dispatch]])await c.query('INSERT INTO shipping_events(tenant_id,site_id,order_id,id,shipping_order_id,event_type,allocation_id,dispatch_id,output_lot_id,quantity_pieces,actor_id,idempotency_key,rma_release_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[s.tenantId,s.siteId,orderId,eventId,id,type,allocation,dispatchId,source.lotId,amount,s.identity.userId,req.headers['idempotency-key'],source.releaseId]);
     if(uninspected)await require('./final-control').recordBypass(c,s,orderId,{...before,lotId:source.lotId},allocation,uninspected);
     events.push({uninspectedQuantity:uninspected,orderItemId:line.orderItemId,outputLotId:source.lotId,rmaReleaseId:source.releaseId,allocationId:allocation,dispatchId:dispatch,quantity:amount});remaining-=amount;
    }
   }
   await audit(c,s,'shipping.products_dispatched','order',orderId,{shippingOrderId:id,lines,events});return {status:201,body:{id,orderId,quantity:lines.reduce((n,i)=>number(n+i.quantity),0),lines,events,uninspectedQuantity:events.reduce((n,e)=>n+e.uninspectedQuantity,0),delivered:false}};
  });return reply.code(r.status).send(r.body);
 });
}
module.exports={routes,products,ready};
