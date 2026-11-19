'use strict';
// Customer projections are explicit allowlists, never the internal order views.
const crypto=require('node:crypto');
const {inTransaction}=require('./db');
const {identifier,fail,scoped}=require('./orders-planning');
async function access(pool,identity,shareId,fn){
 if(!identity?.verified||!identity.userId)fail(401,'UNAUTHENTICATED','Giriş gerekli.');
 return inTransaction(pool,async c=>{const r=await c.query('SELECT ritim_portal_access($1,$2) share',[identity.userId,identifier(shareId)]);const s=r.rows[0]?.share;if(!s)fail(404,'NOT_FOUND','Paylaşılan sipariş bulunamadı.');return fn(c,s);});
}
async function projection(c,s){
 const args=[s.tenantId,s.siteId,s.orderId];
 const order=(await c.query('SELECT id,order_number "orderNumber",customer,ordered_qty "orderedQuantity",due_date::text "dueDate",status,execution_hold "executionHold" FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3',args)).rows[0];
 if(!order)fail(404,'NOT_FOUND','Sipariş bulunamadı.');order.orderedQuantity=Number(order.orderedQuantity);
 order.items=(await c.query('SELECT id,line_number "lineNumber",part_number "partNumber",part_name "partName",quantity,due_date::text "dueDate" FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND removed_at IS NULL ORDER BY line_number',args)).rows.map(x=>({...x,quantity:Number(x.quantity)}));
 order.workOrders=(await c.query(`SELECT w.id,w.production_order_id "productionOrderId",w.work_order_number number,w.status,w.planned_qty quantity,op.name "operationName",op.sequence,
 COALESCE((SELECT SUM(e.quantity_pieces) FROM effective_production_events e WHERE (e.tenant_id,e.site_id,e.work_order_id)=(w.tenant_id,w.site_id,w.id)),0) "recordedProduction"
 FROM work_orders w JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 ORDER BY op.sequence,w.work_order_number`,args)).rows.map(x=>({...x,quantity:Number(x.quantity),recordedProduction:Number(x.recordedProduction)}));
 order.productionOrders=(await c.query('SELECT id,order_item_id "orderItemId",number,quantity,planning_state "planningState",planned_date::text "plannedDate",cancelled_at "cancelledAt" FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY created_at,id',args)).rows.map(p=>{const jobs=order.workOrders.filter(w=>w.productionOrderId===p.id);const status=order.status==='cancelled'||p.cancelledAt?'cancelled':order.executionHold||p.planningState==='held'?'held':jobs.length&&jobs.every(w=>w.status==='complete')?'completed':jobs.some(w=>w.status==='running')?'running':jobs.some(w=>w.status==='paused')?'paused':jobs.some(w=>w.status==='complete')?'waiting':p.planningState;return {id:p.id,orderItemId:p.orderItemId,number:p.number,quantity:Number(p.quantity),plannedDate:p.plannedDate,status};});
 order.quality=null;order.documents=[];
 if(s.includeQuality){
  order.quality=(await c.query(`SELECT d.id,d.work_order_id "workOrderId",d.outcome,d.quantity_pieces quantity,d.occurred_at "occurredAt" FROM output_dispositions d WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.order_id=$3 ORDER BY d.occurred_at,d.id`,args)).rows.map(x=>({...x,quantity:Number(x.quantity)}));
  order.qualitySummary=(await c.query(`SELECT w.id "workOrderId",COALESCE(e.quantity,0) "inspectionQuantity",COALESCE(q.approved,0) approved,COALESCE(q.rejected,0) rejected,COALESCE(q.rework,0) rework,GREATEST(0,COALESCE(e.quantity,0)-COALESCE(q.decided,0)-COALESCE(b.quantity,0)) pending,COALESCE(b.quantity,0) "uninspectedShippingQuantity"
  FROM work_orders w
  LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) quantity FROM effective_production_events WHERE tenant_id=w.tenant_id AND site_id=w.site_id AND work_order_id=w.id AND kind IN ('good','pending')) e ON true
  LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) decided,SUM(quantity_pieces) FILTER(WHERE outcome='approved') approved,SUM(quantity_pieces) FILTER(WHERE outcome='rejected') rejected,SUM(quantity_pieces) FILTER(WHERE outcome='rework') rework FROM output_dispositions WHERE tenant_id=w.tenant_id AND site_id=w.site_id AND work_order_id=w.id) q ON true
  LEFT JOIN LATERAL(SELECT SUM(quantity_pieces) quantity FROM shipping_quality_bypasses WHERE tenant_id=w.tenant_id AND site_id=w.site_id AND work_order_id=w.id) b ON true
  WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3 ORDER BY w.id`,args)).rows.map(x=>{const v=Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='workOrderId'?v:Number(v)]));return {...v,status:v.pending?'pending':v.uninspectedShippingQuantity?'uninspected_shipping':v.inspectionQuantity?'inspected':'no_recorded_control'};});
  order.uninspectedShippingQuantity=Number((await c.query('SELECT COALESCE(SUM(b.quantity_pieces),0) n FROM shipping_quality_bypasses b JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(b.tenant_id,b.site_id,b.work_order_id) WHERE w.tenant_id=$1 AND w.site_id=$2 AND w.order_id=$3',args)).rows[0].n);
 }
 if(s.includeQuality&&s.includeDocuments)order.documents=(await c.query(`SELECT DISTINCT d.id,d.filename,d.mime,d.work_order_id "workOrderId" FROM work_documents d JOIN quality_document_links l ON (l.tenant_id,l.site_id,l.document_id)=(d.tenant_id,d.site_id,d.id) JOIN output_dispositions q ON (q.tenant_id,q.site_id,q.id)=(l.tenant_id,l.site_id,l.decision_id) JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(d.tenant_id,d.site_id,d.work_order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND w.order_id=$3 AND q.order_id=$3 AND q.work_order_id=w.id AND d.context='quality' ORDER BY d.filename,d.id`,args)).rows;
 if(s.permissions?.production===false)order.productionOrders=[];
 if(s.permissions?.workOrders===false)order.workOrders=[];
 order.media=await require('./customer-collaboration').media(c,{...s,external:true});
 return {order:{...order,permissions:s.permissions,shareId:s.id,tenantId:s.tenantId,siteId:s.siteId,includeQuality:s.includeQuality,includeDocuments:s.includeDocuments},updatedAt:new Date().toISOString()};
}
async function detail(pool,identity,id){return access(pool,identity,id,projection);}
async function document(c,s,id){
 if(!s.includeQuality||!s.includeDocuments||s.permissions?.download===false)fail(404,'NOT_FOUND','Belge bulunamadı.');
 const r=await c.query(`SELECT d.filename,d.mime,d.content FROM work_documents d JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(d.tenant_id,d.site_id,d.work_order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND w.order_id=$3 AND d.id=$4 AND d.context='quality' AND EXISTS(SELECT 1 FROM quality_document_links l JOIN output_dispositions q ON (q.tenant_id,q.site_id,q.id)=(l.tenant_id,l.site_id,l.decision_id) WHERE (l.tenant_id,l.site_id,l.document_id)=(d.tenant_id,d.site_id,d.id) AND q.order_id=$3 AND q.work_order_id=w.id)`,[s.tenantId,s.siteId,s.orderId,identifier(id)]);
 if(!r.rowCount)fail(404,'NOT_FOUND','Belge bulunamadı.');const d=r.rows[0];return {filename:d.filename,mime:d.mime,contentBase64:d.content.toString('base64')};
}
async function manage(c,action,p){try{return (await c.query('SELECT ritim_portal_manage($1,$2::jsonb) result',[action,JSON.stringify(p)])).rows[0].result;}catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Firma yöneticisi yetkisi gerekli.');if(e.code==='P0002')fail(404,'NOT_FOUND','Hesap veya sipariş bulunamadı.');throw e;}}
function routes(api){
 api.addHook('preHandler',async req=>{
  if(!req.routeOptions.url.includes('/customer-portal/'))return;
  const r=await req.server.pgPool.query("SELECT EXISTS(SELECT 1 FROM ritim_schema_versions() WHERE version='076') AND to_regprocedure('ritim_portal_access(uuid,uuid)') IS NOT NULL available");
  if(!r.rows[0]?.available)fail(503,'FEATURE_NOT_ENABLED','Müşteri paneli henüz etkinleştirilmedi. Firma yöneticinizle iletişime geçin.');
 });
 const admin='/sites/:tenantId/:siteId/customer-portal/shares',base='/customer-portal/orders';
 const settings='/sites/:tenantId/:siteId/customer-portal/customers/:customerId/settings';
 async function customerSettings(req,save){return scoped(req,async c=>{
  if(!(await c.query("SELECT to_regprocedure('ritim_portal_settings(text,jsonb)') IS NOT NULL ok")).rows[0].ok)fail(503,'FEATURE_NOT_ENABLED','Paylaşım ayarları için 078 veritabanı güncellemesi gerekli.');
  const p={customerId:identifier(req.params.customerId)};
  if(save){const b=req.body||{};for(const key of ['automatic','accessEnabled','includeQuality','includeDocuments']){if(typeof b[key]!=='boolean')fail(400,'INVALID_INPUT','Geçersiz paylaşım ayarı.');p[key]=b[key];}
   if(!Number.isSafeInteger(b.version)||b.version<0)fail(400,'INVALID_INPUT','Geçersiz ayar sürümü.');
   p.version=b.version;p.permissions=require('./customer-collaboration').options(b.permissions);p.auditId=crypto.randomUUID();
  }
  try{return {settings:(await c.query('SELECT ritim_portal_settings($1,$2::jsonb) result',[save?'save':'get',JSON.stringify(p)])).rows[0].result};}
  catch(e){if(e.code==='40001')fail(409,'VERSION_CONFLICT','Ayarlar değişti. Pencereyi yeniden açın.');if(e.code==='42501')fail(403,'FORBIDDEN','Firma yöneticisi yetkisi gerekli.');if(e.code==='P0002')fail(404,'NOT_FOUND','Müşteri bulunamadı.');throw e;}
 },'members.manage');}
 api.get(settings,req=>customerSettings(req,false));
 api.put(settings,req=>customerSettings(req,true));
 api.post(admin+'/lookup-user',req=>scoped(req,async c=>{const username=req.body?.username;if(typeof username!=='string'||! /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(username.trim()))fail(400,'INVALID_INPUT','Geçerli kullanıcı adı gerekli.');return {user:await manage(c,'lookup',{username:username.trim().toLowerCase()})};},'members.manage'));
 api.get(admin,req=>scoped(req,async(c,s)=>({collaborationEnabled:await require('./customer-collaboration').available(c),shares:await manage(c,'list',{}),customers:(await c.query('SELECT id,name FROM master_customers WHERE tenant_id=$1 AND site_id=$2 AND deleted_at IS NULL ORDER BY name',[s.tenantId,s.siteId])).rows,orders:(await c.query('SELECT id,customer_id "customerId",order_number "orderNumber" FROM orders WHERE tenant_id=$1 AND site_id=$2 AND customer_id IS NOT NULL ORDER BY created_at DESC',[s.tenantId,s.siteId])).rows}),'members.manage'));
 api.put(admin,req=>scoped(req,async c=>{const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['customerId','userId','orderId','includeQuality','includeDocuments','permissions'].includes(k)))fail(400,'INVALID_INPUT','Geçersiz paylaşım.');for(const k of ['includeQuality','includeDocuments'])if(b[k]!==undefined&&typeof b[k]!=='boolean')fail(400,'INVALID_INPUT','Geçersiz paylaşım seçeneği.');return {share:await manage(c,'save',{id:crypto.randomUUID(),auditId:crypto.randomUUID(),customerId:identifier(b.customerId),userId:identifier(b.userId),orderId:identifier(b.orderId),includeQuality:!!b.includeQuality,includeDocuments:!!b.includeDocuments,...(b.permissions?{permissions:require('./customer-collaboration').options(b.permissions)}:{})})};},'members.manage'));
 api.delete(admin+'/:shareId',req=>scoped(req,async c=>({share:await manage(c,'revoke',{id:identifier(req.params.shareId),auditId:crypto.randomUUID()})}),'members.manage'));
 api.get(base,req=>inTransaction(req.server.pgPool,async c=>(await c.query('SELECT ritim_portal_order_list($1) result',[req.auth.userId])).rows[0].result));
 api.get(base+'/:shareId',req=>detail(req.server.pgPool,req.auth,req.params.shareId));
 api.get(base+'/:shareId/documents/:documentId',req=>access(req.server.pgPool,req.auth,req.params.shareId,(c,s)=>document(c,s,req.params.documentId)));
 require('./customer-portal-stream').routes(api,{base,detail});
 require('./customer-collaboration').routes(api);
}
module.exports={routes,access,projection,detail,document,manage};
