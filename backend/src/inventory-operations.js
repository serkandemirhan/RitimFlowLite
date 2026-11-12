'use strict';
const crypto=require('node:crypto');
const {scoped,cmd,data,payload,identifier,str,audit,fail}=require('./orders-planning');
const {amount,lot,stockNumber:n}=require('./material-stock');
const quality=require('./inventory-quality');
function qualityScoped(req,fn){return scoped(req,fn,'quality.write')}
function routes(api){const base='/sites/:tenantId/:siteId/inventory';
 api.get(base+'/lots/:lotId/availability',req=>scoped(req,(c,s)=>quality.state(c,s,identifier(req.params.lotId))));
 api.get(base+'/inspection-history',req=>qualityScoped(req,async(c,s)=>{
  const limit=Number(req.query.limit||25),after=req.query.after?identifier(req.query.after):null;
  if(!Number.isInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Geçersiz sayfa boyutu');
  if(after&&!(await c.query('SELECT 1 FROM inventory_lot_inspections WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,after])).rowCount)fail(400,'INVALID_INPUT','Geçersiz sayfa konumu');
  const r=await c.query(`SELECT i.id,i.lot_id AS "lotId",l.lot_code AS "lotCode",m.description,m.base_unit unit,i.outcome,i.quantity,i.reason,i.note,COALESCE((SELECT json_agg(json_build_object('id',d.id,'filename',d.filename)) FROM inventory_documents d JOIN inventory_movements mv ON (mv.tenant_id,mv.site_id,mv.id)=(d.tenant_id,d.site_id,d.movement_id) WHERE mv.tenant_id=i.tenant_id AND mv.site_id=i.site_id AND mv.lot_id=i.lot_id AND mv.kind='receipt'),'[]'::json) documents,i.created_at AS "createdAt",ritim_inventory_actor_name(i.tenant_id,i.site_id,i.id) AS "actorName"
  FROM inventory_lot_inspections i JOIN inventory_lots l ON (l.tenant_id,l.site_id,l.id)=(i.tenant_id,i.site_id,i.lot_id) JOIN inventory_materials m ON (m.tenant_id,m.site_id,m.id)=(l.tenant_id,l.site_id,l.material_id)
  WHERE i.tenant_id=$1 AND i.site_id=$2 AND ($3::uuid IS NULL OR (i.created_at,i.id)<(SELECT created_at,id FROM inventory_lot_inspections WHERE tenant_id=$1 AND site_id=$2 AND id=$3)) ORDER BY i.created_at DESC,i.id DESC LIMIT $4`,[s.tenantId,s.siteId,after,limit+1]);
  return {items:r.rows.slice(0,limit).map(x=>({...x,quantity:n(x.quantity)})),nextAfter:r.rows.length>limit?r.rows[limit-1].id:null};
 }));
 api.post(base+'/supplier-returns',async(req,reply)=>{
  const s=data(req),b=payload(req),p={lotId:identifier(b.lotId),sourceLocationId:identifier(b.sourceLocationId),quantity:amount(b.quantity),...(b.supplierId?{supplierId:identifier(b.supplierId)}:{}),qualitySource:b.qualitySource||null,reason:str(b.reason,'reason')};
  const r=await cmd(req,'inventory.supplier_return','stock.write',p,async c=>{
   const l=await lot(c,s,p.lotId),service=require('./inventory-service');require('./material-stock').unitAmount(l,p.quantity);
   const supplier=p.supplierId||l.supplier_id;if(!supplier)fail(409,'SUPPLIER_REQUIRED','İade yapılacak malzeme tedarikçisini seçin');
   if(!(await c.query('SELECT 1 FROM outsourcing_suppliers WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND material_supplier',[s.tenantId,s.siteId,supplier])).rowCount)fail(409,'SUPPLIER_TYPE_MISMATCH','Malzeme tedarikçisi seçin');
   if(l.supplier_id&&supplier!==l.supplier_id)fail(409,'SUPPLIER_MISMATCH','Bu LOT farklı bir tedarikçiden kabul edilmiş');
   await service.location(c,s,p.sourceLocationId);if(p.quantity>await service.balance(c,s,l.id,p.sourceLocationId))fail(409,'STOCK_INSUFFICIENT','Bu konumdaki stok yetersiz');
   const parts=quality.attribution(await quality.state(c,s,l.id),p.quantity,p.qualitySource);
   const id=await service.move(c,s,req.headers['idempotency-key'],{lotId:l.id,kind:'scrap',source:p.sourceLocationId,quantity:p.quantity,documentRef:p.reason});
   await quality.record(c,s,id,parts);await c.query('INSERT INTO inventory_supplier_returns(tenant_id,site_id,movement_id,supplier_id) VALUES($1,$2,$3,$4)',[s.tenantId,s.siteId,id,supplier]);
   await audit(c,s,'inventory.supplier_returned','inventory_movement',id,{...p,supplierId:supplier});return {status:201,body:{id,...p,supplierId:supplier}};
  });return reply.code(r.status).send(r.body);
 });
 api.post(base+'/movements/:movementId/correct',async(req,reply)=>{
  const s=data(req),b=payload(req),p={movementId:identifier(req.params.movementId),reason:str(b.reason,'reason')};
  const r=await cmd(req,'inventory.correct','stock.write',p,async(c,scope)=>{
   if(!scope.roles.some(x=>['manager','tenant_admin','superadmin'].includes(x)))fail(403,'MANAGER_REQUIRED','Düzeltme için yönetici yetkisi gerekir');
   const m=(await c.query('SELECT * FROM inventory_movements WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,p.movementId])).rows[0];if(!m)fail(404,'NOT_FOUND','Hareket bulunamadı');
   await lot(c,s,m.lot_id);
   if(!['receipt','move','scrap'].includes(m.kind))fail(409,'CORRECTION_DEPENDENCY','Üretim teslimi, üretimden iade akışıyla düzeltilmelidir');
   if((await c.query(`SELECT 1 FROM inventory_movement_corrections WHERE tenant_id=$1 AND site_id=$2 AND (movement_id=$3 OR reversal_id=$3)
    UNION ALL SELECT 1 FROM inventory_supplier_returns WHERE tenant_id=$1 AND site_id=$2 AND movement_id=$3
    UNION ALL SELECT 1 FROM raw_material_returns WHERE tenant_id=$1 AND site_id=$2 AND movement_id=$3`,[s.tenantId,s.siteId,m.id])).rowCount)fail(409,'CORRECTION_DEPENDENCY','Bu hareket başka bir süreçle bağlı veya zaten düzeltilmiş');
   // Conservative: any subsequent lot movement blocks this shortcut. Never unwind a chain implicitly.
   if((await c.query('SELECT 1 FROM inventory_movements WHERE tenant_id=$1 AND site_id=$2 AND lot_id=$3 AND id<>$4 AND (occurred_at,id)>(SELECT occurred_at,id FROM inventory_movements WHERE tenant_id=$1 AND site_id=$2 AND id=$4) LIMIT 1',[s.tenantId,s.siteId,m.lot_id,m.id])).rowCount)fail(409,'CORRECTION_DEPENDENCY','Bu LOT sonradan hareket görmüş. Bağlı işlemleri kontrol edin');
   if(m.kind==='receipt'&&(await c.query('SELECT 1 FROM inventory_lot_inspections WHERE tenant_id=$1 AND site_id=$2 AND lot_id=$3 LIMIT 1',[s.tenantId,s.siteId,m.lot_id])).rowCount)fail(409,'CORRECTION_DEPENDENCY','Kalite kararı bulunan kabul bu kısayoldan düzeltilemez');
   const service=require('./inventory-service'),source=m.destination_location_id,destination=m.source_location_id;
   if(source){await service.location(c,s,source);if(n(m.quantity_pieces)>await service.balance(c,s,m.lot_id,source))fail(409,'STOCK_INSUFFICIENT','Ters hareket için fiziksel stok yetersiz')}
   if(destination)await service.location(c,s,destination);
   const id=await service.move(c,s,req.headers['idempotency-key'],{lotId:m.lot_id,kind:m.kind==='move'?'move':m.kind==='receipt'?'scrap':'receipt',source,destination,quantity:n(m.quantity_pieces),documentRef:'DUZELTME-'+crypto.randomUUID()});
   if(m.kind==='scrap'){const d=(await c.query('SELECT approved,rejected,pending FROM inventory_quality_debits WHERE tenant_id=$1 AND site_id=$2 AND movement_id=$3',[s.tenantId,s.siteId,m.id])).rows[0]||{approved:n(m.quantity_pieces),rejected:0,pending:0};await quality.record(c,s,id,d,true)}
   else if(m.kind==='receipt')await quality.record(c,s,id,{approved:0,rejected:0,pending:n(m.quantity_pieces)});
   await c.query('INSERT INTO inventory_movement_corrections(tenant_id,site_id,movement_id,reversal_id,reason) VALUES($1,$2,$3,$4,$5)',[s.tenantId,s.siteId,m.id,id,p.reason]);
   await audit(c,s,'inventory.corrected','inventory_movement',id,p);return {status:201,body:{id,...p}};
  });return reply.code(r.status).send(r.body);
 });
}
module.exports={routes};
