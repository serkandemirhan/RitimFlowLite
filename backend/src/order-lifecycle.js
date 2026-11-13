'use strict';
const crypto=require('node:crypto');
const {data,payload,identifier,qty,str,number,cmd,scoped,lockedOrder,audit,fail}=require('./orders-planning');
const date=require('./planning-experience').date;
function version(v){if(!Number.isSafeInteger(v)||v<1)fail(400,'INVALID_INPUT','Güncel kayıt sürümü gerekli');return v}
async function replacementLinks(c,s,id){return (await c.query(`SELECT r.previous_id,r.next_id,r.reason,r.created_at::text created_at,p.number previous_number,n.number next_number
 FROM production_order_replacements r JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(r.tenant_id,r.site_id,r.previous_id)
 JOIN production_orders n ON (n.tenant_id,n.site_id,n.id)=(r.tenant_id,r.site_id,r.next_id)
 WHERE r.tenant_id=$1 AND r.site_id=$2 AND (r.previous_id=$3 OR r.next_id=$3) ORDER BY r.created_at`,[s.tenantId,s.siteId,id])).rows;}
async function replacementPreview(c,s,orderId,id){
 const order=await lockedOrder(c,s,orderId),p=(await c.query('SELECT * FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND id=$4 FOR UPDATE',[s.tenantId,s.siteId,orderId,id])).rows[0];
 if(!p)fail(404,'NOT_FOUND','Üretim emri bulunamadı');
 const reasons=[],args=[s.tenantId,s.siteId,id];
 if(order.status!=='open'||order.execution_hold)reasons.push('Sipariş açık olmalı ve durdurulmuş olmamalı.');
 if(p.cancelled_at)reasons.push('Üretim emri zaten iptal edilmiş.');
 const jobs=(await c.query('SELECT id,status,work_order_number FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND production_order_id=$3 ORDER BY id FOR UPDATE',args)).rows;
 // First release deliberately does not invent transfers from an old production identity.
 // Any recorded physical activity must be reconciled by an explicit future stock workflow.
 for(const [table,column,label] of [['production_events','work_order_id','Üretim veya hurda kaydı var.'],['physical_ledger','work_order_id','Fiziksel malzeme hareketi var.'],['reservations','work_order_id','Malzeme ayırması var.'],['production_supplier_events','work_order_id','Fason hareketi var.']]){
  if((await c.query(`SELECT 1 FROM ${table} x JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(x.tenant_id,x.site_id,x.${column}) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.production_order_id=$3 LIMIT 1`,args)).rowCount)reasons.push(label);
 }
 if((await c.query('SELECT 1 FROM raw_material_issues WHERE tenant_id=$1 AND site_id=$2 AND production_order_id=$3 LIMIT 1',args)).rowCount)reasons.push('Hammadde teslim kaydı var.');
 if((await c.query('SELECT 1 FROM inventory_lots WHERE tenant_id=$1 AND site_id=$2 AND expected_production_id=$3 LIMIT 1',args)).rowCount)reasons.push('Bu üretim emrine bağlı stok lotu var.');
 if(jobs.some(x=>x.status==='complete'))reasons.push('Tamamlanmış iş emri var.');
 if((await replacementLinks(c,s,id)).some(x=>x.previous_id===id))reasons.push('Yerine yeni üretim emri zaten oluşturulmuş.');
 return {orderId,id,number:p.number,quantity:number(p.quantity),version:p.version,canReplace:!reasons.length,reasons,jobs,orderItemId:p.order_item_id,compensationId:p.compensation_id};
}
async function itemChange(c,s,p){
 const o=await lockedOrder(c,s,p.orderId);if(o.status!=='open'||o.execution_hold)fail(409,'ORDER_CLOSED','Siparişi açın ve durdurmayı kaldırın.');
 if(!o.itemized)fail(409,'ORDER_ITEMS_REQUIRED','Eski tek ürünlü sipariş için Siparişi düzenle işlemini kullanın.');
 if(o.version!==p.version)fail(409,'VERSION_CONFLICT','Sipariş değişti; güncel kaydı açın.');
 const rows=await require('./order-items').items(c,s,p.orderId),old=p.itemId?rows.find(x=>x.id===p.itemId):null;
 if(p.action!=='add'&&!old)fail(404,'NOT_FOUND','Ürün kalemi bulunamadı');
 const bound=old&&(await c.query('SELECT 1 FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_item_id=$3 LIMIT 1',[s.tenantId,s.siteId,old.id])).rowCount>0;
 if(old&&p.action==='remove'&&(bound||rows.length===1))fail(409,'ITEM_LINKED','Son ürün veya üretim geçmişi bulunan kalem kaldırılamaz.');
 if(old&&p.action==='update'){
  const delivered=await require('./order-items').shippingBalance(c,s,p.orderId,old.id,'dispatch');
  if(p.quantity<Math.max(old.allocated,delivered))fail(409,'QUANTITY_ALLOCATED','Miktar üretime ayrılmış veya sevk edilmiş miktarın altına indirilemez. Önce ilgili üretimi çözün.');
  if(bound&&p.partId!==old.partId)fail(409,'IDENTITY_LOCKED','Üretim geçmişi bulunan ürün değiştirilemez.');
 }
 let after=null;
 if(p.action==='remove')await c.query('UPDATE order_items SET removed_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,old.id]);
 else{
  const part=(await c.query('SELECT id,code,name,default_materials FROM master_parts WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND deleted_at IS NULL FOR SHARE',[s.tenantId,s.siteId,p.partId])).rows[0];
  if(!part)fail(409,'MASTER_RECORD_UNAVAILABLE','Kayıtlı ürün seçin.');
  if(p.action==='add'){
   if(rows.length>=100)fail(409,'ITEM_LIMIT','En fazla 100 ürün kalemi olabilir.');
   const line=number((await c.query('SELECT COALESCE(MAX(line_number),0) n FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3',[s.tenantId,s.siteId,p.orderId])).rows[0].n)+1;
   const materials=await require('./order-item-materials').resolve(c,s,part.default_materials||[]),id=crypto.randomUUID();
   await c.query('INSERT INTO order_items(tenant_id,site_id,order_id,id,line_number,part_id,part_number,part_name,quantity,due_date,materials) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[s.tenantId,s.siteId,p.orderId,id,line,part.id,part.code,part.name,p.quantity,p.dueDate,JSON.stringify(materials)]);after={...p,id};
  }else{
   const materials=p.partId===old.partId?old.materials:await require('./order-item-materials').resolve(c,s,part.default_materials||[]);
   await c.query('UPDATE order_items SET part_id=$4,part_number=$5,part_name=$6,quantity=$7,due_date=$8,materials=$9 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,old.id,part.id,part.code,part.name,p.quantity,p.dueDate,JSON.stringify(materials)]);after={...p,id:old.id};
  }
 }
 const updated=await require('./order-items').items(c,s,p.orderId),total=number(updated.reduce((n,x)=>n+x.orderedQuantity,0)),due=updated.map(x=>x.dueDate).filter(Boolean).sort()[0]||null;
 await c.query('UPDATE orders SET ordered_qty=$4,due_date=$5,part_name=$6,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,p.orderId,total,due,updated.length===1?updated[0].partName:updated.length+' ürün']);
 await audit(c,s,'order.items_changed','order',p.orderId,{action:p.action,reason:p.reason,before:old,after});
 return {items:updated,version:o.version+1};
}
function routes(api){
 const base='/sites/:tenantId/:siteId';
 api.post(base+'/orders/:orderId/items/change',async(req,reply)=>{
  const b=payload(req),s=data(req),p={orderId:identifier(req.params.orderId),version:version(b.version),action:b.action,itemId:b.itemId?identifier(b.itemId):null,reason:str(b.reason,'Gerekçe')};
  if(!['add','update','remove'].includes(p.action))fail(400,'INVALID_INPUT','Geçersiz ürün işlemi');
  if(p.action!=='remove')Object.assign(p,{partId:identifier(b.partId),quantity:qty(b.quantity),dueDate:date(b.dueDate)});
  const r=await cmd(req,'order.items_change','orders.write',p,async c=>({status:200,body:await itemChange(c,s,p)}));return reply.code(r.status).send(r.body);
 });
 api.get(base+'/orders/:orderId/production-orders/:productionId/replacement-preview',req=>scoped(req,(c,s)=>replacementPreview(c,s,identifier(req.params.orderId),identifier(req.params.productionId))));
 api.post(base+'/orders/:orderId/production-orders/:productionId/replace',async(req,reply)=>{
  const b=payload(req),s=data(req),p={orderId:identifier(req.params.orderId),id:identifier(req.params.productionId),version:version(b.version),reason:str(b.reason,'Gerekçe'),operations:require('./planning-experience').route(b.operations)};
  if(!p.operations.length)fail(400,'ROUTE_REQUIRED','Yeni rota gerekli');
  const r=await cmd(req,'production_order.replace','orders.write',p,async c=>{
   const old=await replacementPreview(c,s,p.orderId,p.id);if(old.version!==p.version)fail(409,'VERSION_CONFLICT','Üretim emri değişti; güncel kaydı açın.');
   if(!old.canReplace)fail(409,'REPLACEMENT_BLOCKED',old.reasons.join(' '));
   const id=crypto.randomUUID(),num=require('./record-number').recordNumber('UE');
   await c.query("UPDATE production_orders SET cancelled_at=now(),resume_state=COALESCE(resume_state,planning_state),planning_state='held',hold_reason=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,p.id,p.reason]);
   for(const j of old.jobs){if(j.status==='cancelled')continue;await c.query("UPDATE work_orders SET status='cancelled' WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[s.tenantId,s.siteId,j.id]);await audit(c,s,'production.cancel','work_order',j.id,{reason:p.reason,previousStatus:j.status,source:'replacement',replacementId:id});await audit(c,s,'operator.lifecycle','work_order',j.id,{state:'cancelled',message:'Bu iş emri iptal edildi. Çalışmayı durdurun. Yerine '+num+' üretim emri oluşturuldu.',replacementId:id});}
   await c.query('INSERT INTO production_orders(tenant_id,site_id,order_id,id,number,quantity,order_item_id,compensation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[s.tenantId,s.siteId,p.orderId,id,num,old.quantity,old.orderItemId,old.compensationId]);
   for(const [sequence,op] of (await require('./catalog-route').catalogRoute(c,s,p.operations)).entries())await c.query('INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id,setup_minutes,cycle_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[s.tenantId,s.siteId,p.orderId,crypto.randomUUID(),sequence,op.name,op.kind,id,op.setupMinutes,op.cycleMinutes]);
   await c.query('INSERT INTO production_order_replacements(tenant_id,site_id,order_id,previous_id,next_id,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.tenantId,s.siteId,p.orderId,p.id,id,p.reason,s.identity.userId]);
   await audit(c,s,'production_order.replaced','production_order',p.id,{replacementId:id,reason:p.reason});await audit(c,s,'production_order.created','production_order',id,{previousId:p.id,reason:p.reason,quantity:old.quantity});
   return {status:201,body:await require('./production-orders').view(c,s,id)};
  });return reply.code(r.status).send(r.body);
 });
}
module.exports={routes,replacementLinks,replacementPreview,itemChange};
