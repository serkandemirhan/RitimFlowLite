'use strict';
const {inTransaction}=require('./db'),{authorizeScope}=require('./authorization');
const {operatorOnly}=require('./permissions'),{HttpError}=require('./auth');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Deny new general read endpoints by default. Production reads require a current
// assignment, including drawing, quality results and immutable work history.
async function guard(req){
 if(!['GET','HEAD'].includes(req.method)||!req.params?.tenantId||!req.params?.siteId)return;
 const s={identity:req.auth,tenantId:req.params.tenantId,siteId:req.params.siteId};
 await inTransaction(req.server.pgPool,async c=>{
  const scope=await authorizeScope(c,{...s,capability:'site.read'});if(!operatorOnly(scope.roles))return;
  req.operatorRestricted=true;
  const route=req.routeOptions.url.replace('/api/v1/sites/:tenantId/:siteId','');
  if(['/capabilities','/operator/work-orders','/operator/notifications','/workspace-preferences','/recovery'].includes(route))return;
  if(['/master-data/:kind','/master-data/:kind/:recordId','/master-data/:kind/page'].includes(route)&&req.params.kind==='scrap-reasons')return;
  if(route==='/recovery/:recoveryId'&&uuid.test(req.params.recoveryId||''))return;
  const prefix='/orders/:orderId/work-orders/:workOrderId';
  const suffix=route.startsWith(prefix)?route.slice(prefix.length):null;
  if(['drawing','drawing/document','production/summary','production/balances','production/history','quality','quality/history','handoff','documents'].some(x=>suffix==='/'+x)){
   if(!uuid.test(req.params.orderId||'')||!uuid.test(req.params.workOrderId||''))throw new HttpError(400,'INVALID_INPUT','Geçerli iş emri gerekli.');
   const assigned=await c.query('SELECT 1 FROM work_assignments a JOIN work_orders w ON (w.tenant_id,w.site_id,w.id)=(a.tenant_id,a.site_id,a.work_order_id) WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.user_id=$3 AND a.released_at IS NULL AND w.id=$4 AND w.order_id=$5',[s.tenantId,s.siteId,s.identity.userId,req.params.workOrderId,req.params.orderId]);
   if(assigned.rowCount)return;
   throw new HttpError(404,'NOT_FOUND','İş emri bulunamadı.');
  }
  if(route==='/work-documents/:documentId'&&uuid.test(req.params.documentId||'')){
   const assigned=await c.query('SELECT 1 FROM work_documents d JOIN work_assignments a ON (a.tenant_id,a.site_id,a.work_order_id)=(d.tenant_id,d.site_id,d.work_order_id) WHERE d.tenant_id=$1 AND d.site_id=$2 AND d.id=$3 AND a.user_id=$4 AND a.released_at IS NULL',[s.tenantId,s.siteId,req.params.documentId,s.identity.userId]);
   if(assigned.rowCount)return;
   throw new HttpError(404,'NOT_FOUND','Belge bulunamadı.');
  }
  throw new HttpError(403,'OPERATOR_SCREEN_ONLY','Operatörler yalnızca kendilerine atanmış üretim işlerine erişebilir.');
 });
}
module.exports={guard};
