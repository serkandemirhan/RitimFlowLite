'use strict';
const crypto=require('node:crypto');
const {scoped,identifier,fail,audit,lockedOrder}=require('./orders-planning');
const {access}=require('./customer-portal');
const id=()=>crypto.randomUUID();
const statuses=['submitted','reviewing','waiting_customer','approved','rejected','applied','withdrawn'];
const permissions=['production','workOrders','drawings','videos','requests','download'];
function text(value,max=8000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,'INVALID_INPUT','Metin boş olamaz veya çok uzun.');return value.trim();}
function version(value){if(!Number.isSafeInteger(value)||value<1)fail(400,'INVALID_INPUT','Geçerli kayıt sürümü gerekli.');return value;}
function options(value){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!permissions.includes(k))||Object.values(value).some(v=>typeof v!=='boolean'))fail(400,'INVALID_INPUT','Geçersiz erişim izinleri.');return Object.fromEntries(permissions.map(k=>[k,value[k]===true]));}
function proposed(value={}){
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['quantity','dueDate','orderItemId','drawingFileId','drawingRevision'].includes(k)))fail(400,'INVALID_INPUT','Geçersiz değişiklik.');
 const p={};
 if(value.quantity!==undefined){if(!Number.isSafeInteger(value.quantity)||value.quantity<1)fail(400,'INVALID_INPUT','Miktar pozitif tam sayı olmalı.');p.quantity=value.quantity;}
 if(value.dueDate!==undefined){if(typeof value.dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)||Number.isNaN(Date.parse(value.dueDate))||new Date(value.dueDate).toISOString().slice(0,10)!==value.dueDate)fail(400,'INVALID_INPUT','Geçerli termin gerekli.');p.dueDate=value.dueDate;}
 for(const k of ['orderItemId','drawingFileId'])if(value[k])p[k]=identifier(value[k]);
 if(value.drawingRevision)p.drawingRevision=text(value.drawingRevision,120);
 return p;
}
function fileInput(b){
 const filename=text(b.filename,180);if(/[\\/\x00-\x1f]/.test(filename))fail(400,'INVALID_FILE','Geçersiz dosya adı.');
 if(typeof b.contentBase64!=='string'||b.contentBase64.length>4194304||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.contentBase64))fail(400,'INVALID_FILE','Dosya en fazla 3 MB olabilir.');
 const content=Buffer.from(b.contentBase64,'base64');if(!content.length||content.length>3145728||content.toString('base64')!==b.contentBase64)fail(400,'INVALID_FILE','Geçersiz dosya.');
 const mime=b.mime,valid=mime==='application/pdf'?content.subarray(0,5).toString()==='%PDF-':mime==='image/png'?content.subarray(0,8).toString('hex')==='89504e470d0a1a0a':mime==='image/jpeg'?content.subarray(0,3).toString('hex')==='ffd8ff':mime==='video/mp4'?content.subarray(4,8).toString()==='ftyp':false;
 if(!valid)fail(400,'INVALID_FILE','PDF, PNG, JPEG veya MP4 dosyası gerekli.');
 return {filename,mime,content,sha256:crypto.createHash('sha256').update(content).digest('hex')};
}
const args=s=>[s.tenantId,s.siteId];
async function available(c){return !!(await c.query("SELECT to_regclass('portal_requests') IS NOT NULL ok")).rows[0].ok;}
async function account(c,action,p){try{return (await c.query('SELECT ritim_portal_accounts($1,$2::jsonb) result',[action,JSON.stringify(p)])).rows[0].result;}catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Yalnız kendi müşteri hesaplarınızı yönetebilirsiniz.');if(e.code==='P0002')fail(404,'NOT_FOUND','Müşteri hesabı bulunamadı.');throw e;}}
async function snapshot(c,s,orderId){
 const o=(await c.query('SELECT id,version,ordered_qty::text quantity,due_date::text "dueDate",status,itemized FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),orderId])).rows[0];
 if(!o)fail(404,'NOT_FOUND','Sipariş bulunamadı.');
 o.items=(await c.query('SELECT id,quantity::text quantity,due_date::text "dueDate" FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND removed_at IS NULL ORDER BY line_number',[...args(s),orderId])).rows;
 o.drawing=(await c.query('SELECT revision_id FROM drawing_publications WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 ORDER BY sequence DESC LIMIT 1',[...args(s),orderId])).rows[0]?.revision_id||null;
 return o;
}
async function requestRow(c,s,requestId,lock=false){
 const r=(await c.query('SELECT * FROM portal_requests WHERE tenant_id=$1 AND site_id=$2 AND id=$3'+(lock?' FOR UPDATE':''),[...args(s),identifier(requestId)])).rows[0];
 if(!r||(s.external&&(r.order_id!==s.orderId||r.customer_id!==s.customerId)))fail(404,'NOT_FOUND','Talep bulunamadı.');return r;
}
function publicRequest(r){return {id:r.id,orderId:r.order_id,customerId:r.customer_id,title:r.title,kind:r.kind,proposed:r.proposed,baseline:r.baseline,status:r.status,version:r.version,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at,orderNumber:r.order_number,customer:r.customer,unread:r.unread===true};}
async function list(c,s){
 const rows=(await c.query(`SELECT r.*,CASE WHEN $4 THEN GREATEST(r.created_at,(SELECT MAX(created_at) FROM portal_messages pm WHERE (pm.tenant_id,pm.site_id,pm.request_id)=(r.tenant_id,r.site_id,r.id) AND NOT pm.internal),(SELECT MAX(pf.created_at) FROM portal_files pf JOIN portal_messages pm ON (pm.tenant_id,pm.site_id,pm.id)=(pf.tenant_id,pf.site_id,pf.message_id) WHERE (pf.tenant_id,pf.site_id,pf.request_id)=(r.tenant_id,r.site_id,r.id) AND NOT pm.internal AND pf.revoked_at IS NULL)) ELSE r.updated_at END updated_at,o.order_number,o.customer,EXISTS(SELECT 1 FROM portal_messages m WHERE (m.tenant_id,m.site_id,m.request_id)=(r.tenant_id,r.site_id,r.id) AND (NOT $4 OR NOT m.internal) AND m.actor_id<>$3 AND m.created_at>COALESCE((SELECT seen_at FROM portal_reads v WHERE (v.tenant_id,v.site_id,v.request_id,v.user_id)=(r.tenant_id,r.site_id,r.id,$3)),'-infinity')) unread FROM portal_requests r JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(r.tenant_id,r.site_id,r.order_id) WHERE r.tenant_id=$1 AND r.site_id=$2 AND (NOT $4 OR (r.order_id=$5 AND r.customer_id=$6 AND o.customer_id=$6)) ORDER BY r.updated_at DESC,r.id LIMIT 501`,[...args(s),s.identity.userId,!!s.external,s.orderId||null,s.customerId||null])).rows;
 return {requests:rows.slice(0,500).map(publicRequest),truncated:rows.length>500};
}
async function detail(c,s,requestId){
 const r=await requestRow(c,s,requestId);
 const messages=(await c.query('SELECT id,side,internal,body,status,created_at "createdAt" FROM portal_messages WHERE tenant_id=$1 AND site_id=$2 AND request_id=$3 AND (NOT $4 OR NOT internal) ORDER BY created_at,id',[...args(s),r.id,!!s.external])).rows;
 const files=(await c.query(`SELECT f.id,f.message_id "messageId",f.filename,f.mime,f.category,octet_length(f.content) size FROM portal_files f JOIN portal_messages m ON (m.tenant_id,m.site_id,m.id)=(f.tenant_id,f.site_id,f.message_id) WHERE f.tenant_id=$1 AND f.site_id=$2 AND f.request_id=$3 AND f.revoked_at IS NULL AND (NOT $4 OR NOT m.internal) ORDER BY f.created_at,f.id`,[...args(s),r.id,!!s.external])).rows;
 const revisions=(await c.query('SELECT number,before_state "before",after_state "after",reason,created_at "createdAt" FROM portal_revisions WHERE tenant_id=$1 AND site_id=$2 AND request_id=$3 ORDER BY number',[...args(s),r.id])).rows;
 return {request:publicRequest(r),messages,files:s.external&&!s.permissions?.videos?files.filter(f=>!f.mime.startsWith('video/')):files,revisions};
}
async function message(c,s,r,b){
 if(b.internal!==undefined&&typeof b.internal!=='boolean')fail(400,'INVALID_INPUT','Not türü geçersiz.');
 if(s.external&&(b.internal||b.status||b.proposed))fail(403,'FORBIDDEN','Müşteri yalnız yanıt gönderebilir.');
 if(s.external&&['applied','rejected','withdrawn'].includes(r.status))fail(409,'REQUEST_CLOSED','Bu talep kapalı. Yeni talep oluşturun.');
 if(b.version!==r.version)fail(409,'VERSION_CONFLICT','Talep değişti. Yenileyip tekrar deneyin.');
 const internal=b.internal===true,next=b.status||r.status;
 const transitions={submitted:['reviewing','waiting_customer','approved','rejected'],reviewing:['waiting_customer','approved','rejected'],waiting_customer:['reviewing','approved','rejected'],approved:['reviewing','rejected'],rejected:[],applied:[],withdrawn:[]};
 if(!statuses.includes(next)||next!==r.status&&!transitions[r.status].includes(next)||internal&&(b.status||b.proposed))fail(409,'INVALID_TRANSITION','Bu durum değişikliğine izin verilmiyor.');
 const mid=identifier(b.id),body=text(b.body);
 await c.query('INSERT INTO portal_messages(tenant_id,site_id,id,request_id,actor_id,side,internal,body,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...args(s),mid,r.id,s.identity.userId,s.external?'customer':'staff',internal,body,next!==r.status?next:null]);
 let changes=r.proposed,baseline=r.baseline;
 if(b.proposed){changes=proposed(b.proposed);baseline=await snapshot(c,s,r.order_id);if(['approved','applied','rejected','withdrawn'].includes(r.status)&&next!=='reviewing')fail(409,'REVIEW_REQUIRED','Değişiklik için talebi yeniden incelemeye alın.');}
 if(next==='approved'&&r.kind==='change'&&!Object.keys(changes).some(k=>['quantity','dueDate','drawingFileId'].includes(k)))fail(400,'CHANGE_REQUIRED','Onaydan önce uygulanacak değişikliği belirtin.');
 await c.query('UPDATE portal_requests SET status=$4,proposed=$5,baseline=$6,version=version+1,updated_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),r.id,next,JSON.stringify(changes),JSON.stringify(baseline)]);
 await audit(c,s,'portal.message','portal_request',r.id,{messageId:mid,internal,status:next});
 return {id:mid,version:r.version+1};
}
async function addFile(c,s,b,requestId){
 const f=fileInput(b),fileId=identifier(b.id);let messageId=null,category=b.category||'document',orderId=s.orderId;
 if(requestId){
  const r=await requestRow(c,s,requestId,true);orderId=r.order_id;messageId=identifier(b.messageId);category='attachment';
  const m=(await c.query('SELECT * FROM portal_messages WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND request_id=$4',[...args(s),messageId,r.id])).rows[0];
  if(!m||m.actor_id!==s.identity.userId||s.external&&m.internal)fail(404,'NOT_FOUND','Kendi mesajınıza dosya ekleyebilirsiniz.');
  if(['approved','applied','rejected','withdrawn'].includes(r.status))fail(409,'REQUEST_CLOSED','Onaylı veya kapalı talebe dosya eklenemez.');
  const count=(await c.query('SELECT count(*)::int n FROM portal_files WHERE tenant_id=$1 AND site_id=$2 AND message_id=$3',[...args(s),messageId])).rows[0].n;
  if(count>=10)fail(409,'FILE_LIMIT','Bir mesaja en fazla 10 dosya eklenebilir.');
 }else{
  if(s.external)fail(403,'FORBIDDEN','Yayın yetkisi gerekli.');orderId=identifier(b.orderId);await lockedOrder(c,s,orderId);
  if(!['document','video','drawing'].includes(category)||category==='video'&&f.mime!=='video/mp4'||category==='drawing'&&f.mime!=='application/pdf'||f.mime==='video/mp4'&&category!=='video')fail(400,'INVALID_FILE','Dosya türü yayın türüne uymuyor.');
 }
 await c.query('INSERT INTO portal_files(tenant_id,site_id,id,order_id,request_id,message_id,category,filename,mime,content,sha256,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[...args(s),fileId,orderId,requestId||null,messageId,category,f.filename,f.mime,f.content,f.sha256,s.identity.userId]);
 if(requestId)await c.query('UPDATE portal_requests SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),requestId]);
 await audit(c,s,'portal.file_added','portal_file',fileId,{orderId,requestId:requestId||null,sha256:f.sha256});return {id:fileId};
}
async function download(c,s,fileId){
 const f=(await c.query('SELECT * FROM portal_files WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND revoked_at IS NULL',[...args(s),identifier(fileId)])).rows[0];
 if(!f||s.external&&f.order_id!==s.orderId)fail(404,'NOT_FOUND','Dosya bulunamadı.');
 if(s.external){
  if(f.mime.startsWith('video/')&&!s.permissions?.videos)fail(404,'NOT_FOUND','Dosya bulunamadı.');
  if(f.request_id){if(!s.permissions.requests)fail(404,'NOT_FOUND','Dosya bulunamadı.');await requestRow(c,s,f.request_id);const m=(await c.query('SELECT internal FROM portal_messages WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),f.message_id])).rows[0];if(!m||m.internal)fail(404,'NOT_FOUND','Dosya bulunamadı.');}
  else if(!canFile(s,f))fail(404,'NOT_FOUND','Dosya bulunamadı.');
 }
 if(crypto.createHash('sha256').update(f.content).digest('hex')!==f.sha256)fail(409,'INTEGRITY_ERROR','Dosya doğrulanamadı.');
 return {filename:f.filename,mime:f.mime,contentBase64:f.content.toString('base64'),allowDownload:!s.external||s.permissions.download===true};
}
function canFile(s,f){return f.category==='video'?s.permissions?.videos:f.category==='drawing'?s.permissions?.drawings:s.includeDocuments;}
async function media(c,s){if(!await available(c))return [];return (await c.query('SELECT id,filename,mime,category,octet_length(content) size FROM portal_files WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND request_id IS NULL AND revoked_at IS NULL ORDER BY created_at,id',[...args(s),s.orderId])).rows.filter(f=>!s.external||canFile(s,f));}
async function apply(c,s,r,b){
 if(r.kind!=='change')fail(400,'CHANGE_REQUIRED','Yalnız değişiklik talebi revizyon oluşturabilir.');
 if(r.status!=='approved'||r.version!==b.version)fail(409,'VERSION_CONFLICT','Onaylı güncel talep gerekli.');
 const reason=text(b.body,120),o=await lockedOrder(c,s,r.order_id),before=await snapshot(c,s,r.order_id),p=r.proposed;
 if(o.status!=='open')fail(409,'ORDER_CLOSED','Sipariş açık değil.');
 if(!require('node:util').isDeepStrictEqual(before,r.baseline))fail(409,'ORDER_CHANGED','Sipariş veya resim değişti. Talebi incelemeye alıp güncel değerlerle tekrar onaylayın.');
 if(b.impactReviewed!==true)fail(400,'IMPACT_REQUIRED','Üretim ve termin etkisini değerlendirin.');
 const itemId=p.orderItemId||(!o.itemized?o.id:null);
 if(p.quantity!==undefined){
  if(!itemId||!before.items.some(i=>i.id===itemId))fail(400,'ITEM_REQUIRED','Değiştirilecek sipariş kalemini seçin.');
  const allocated=Number((await c.query('SELECT COALESCE(SUM(quantity),0) n FROM production_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND order_item_id=$4 AND cancelled_at IS NULL AND compensation_id IS NULL',[...args(s),r.order_id,itemId])).rows[0].n);
  const legacy=Number((await c.query('SELECT COALESCE(MAX(planned_qty),0) n FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND production_order_id IS NULL',[...args(s),r.order_id])).rows[0].n);
  if(p.quantity<Math.max(allocated,legacy))fail(409,'PRODUCTION_IMPACT','Miktar mevcut üretim planının altına düşüyor. Önce kalan planı düzenleyin.');
  if(o.itemized){await c.query('UPDATE order_items SET quantity=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),itemId,p.quantity]);await c.query('UPDATE orders SET ordered_qty=(SELECT SUM(quantity) FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND removed_at IS NULL),version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),r.order_id]);}
  else await c.query('UPDATE orders SET ordered_qty=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),r.order_id,p.quantity]);
 }
 if(p.dueDate){
  if(p.orderItemId&&o.itemized){if(!before.items.some(i=>i.id===p.orderItemId))fail(400,'ITEM_REQUIRED','Sipariş kalemi bulunamadı.');await c.query('UPDATE order_items SET due_date=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),p.orderItemId,p.dueDate]);await c.query('UPDATE orders SET due_date=(SELECT MAX(due_date) FROM order_items WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND removed_at IS NULL),version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),r.order_id]);}
  else await c.query('UPDATE orders SET due_date=$4,version=version+1 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[...args(s),r.order_id,p.dueDate]);
 }
 if(p.drawingFileId){
  if(!p.drawingRevision)fail(400,'REVISION_REQUIRED','Teknik resim revizyon etiketi gerekli.');
  const f=(await c.query(`SELECT f.* FROM portal_files f JOIN portal_messages m ON (m.tenant_id,m.site_id,m.id)=(f.tenant_id,f.site_id,f.message_id) WHERE f.tenant_id=$1 AND f.site_id=$2 AND f.id=$3 AND f.request_id=$4 AND NOT m.internal AND f.revoked_at IS NULL AND f.mime='application/pdf'`,[...args(s),p.drawingFileId,r.id])).rows[0];
  if(!f)fail(400,'DRAWING_REQUIRED','Talebe eklenmiş, müşteriye açık PDF seçin.');
  const active=(await c.query("SELECT 1 FROM work_orders WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND status='running' LIMIT 1",[...args(s),r.order_id])).rowCount;
  if(active)fail(409,'PAUSE_REQUIRED','Resim değişmeden önce çalışan iş emirlerini duraklatın. Yeni resim kalan tüm işler için geçerli olacak.');
  await require('./drawing-acknowledgement').publish(c,s,r.order_id,p.drawingRevision,reason,f.content);
  await c.query("INSERT INTO portal_files(tenant_id,site_id,id,order_id,category,filename,mime,content,sha256,actor_id) VALUES($1,$2,$3,$4,'drawing',$5,$6,$7,$8,$9)",[...args(s),id(),r.order_id,f.filename,f.mime,f.content,f.sha256,s.identity.userId]);
 }
 const after=await snapshot(c,s,r.order_id),n=Number((await c.query('SELECT COALESCE(MAX(number),0)+1 n FROM portal_revisions WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3',[...args(s),r.order_id])).rows[0].n);
 await c.query('INSERT INTO portal_revisions(tenant_id,site_id,order_id,request_id,number,before_state,after_state,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...args(s),r.order_id,r.id,n,JSON.stringify(before),JSON.stringify(after),reason,s.identity.userId]);
 await c.query("UPDATE portal_requests SET status='applied',revision=$4,version=version+1,updated_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3",[...args(s),r.id,n]);
 await c.query("INSERT INTO portal_messages(tenant_id,site_id,id,request_id,actor_id,side,body,status) VALUES($1,$2,$3,$4,$5,'staff',$6,'applied')",[...args(s),identifier(b.id),r.id,s.identity.userId,reason]);
 await audit(c,s,'portal.revision_applied','order',r.order_id,{requestId:r.id,revision:n,before,after,reason});return {revision:n};
}
function routes(api){
 const customer='/customer-portal/orders/:shareId/collaboration',admin='/sites/:tenantId/:siteId/customer-portal/collaboration';
 const run=(req,fn)=>scoped(req,fn,'members.manage');
 const external=(req,fn)=>access(req.server.pgPool,req.auth,req.params.shareId,(c,s)=>{s={...s,external:true,identity:req.auth};if(!s.permissions?.requests)fail(403,'FORBIDDEN','Talep erişimi açık değil.');return fn(c,s);});
 api.addHook('preHandler',async req=>{if((req.routeOptions.url.includes('/collaboration')||req.routeOptions.url.includes('/customer-portal/orders/:shareId/media/'))&&!await available(req.server.pgPool))fail(503,'FEATURE_NOT_ENABLED','Müşteri talepleri veritabanı güncellemesi bekleniyor.');});
 for(const [base,scope] of [[customer,external],[admin,run]]){
  api.get(base+'/requests',req=>scope(req,list));
  api.get(base+'/requests/:requestId',req=>scope(req,(c,s)=>detail(c,s,req.params.requestId)));
  api.post(base+'/requests/:requestId/read',req=>scope(req,async(c,s)=>{const r=await requestRow(c,s,req.params.requestId);await c.query('INSERT INTO portal_reads(tenant_id,site_id,request_id,user_id,seen_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(tenant_id,site_id,request_id,user_id) DO UPDATE SET seen_at=EXCLUDED.seen_at',[...args(s),r.id,s.identity.userId]);return {read:true};}));
  api.post(base+'/requests/:requestId/messages',req=>scope(req,async(c,s)=>message(c,s,await requestRow(c,s,req.params.requestId,true),{...req.body,version:version(req.body?.version)})));
  api.post(base+'/requests/:requestId/files',{bodyLimit:4300000},req=>scope(req,(c,s)=>addFile(c,s,req.body,identifier(req.params.requestId))));
  api.get(base+'/files/:fileId',req=>scope(req,(c,s)=>download(c,s,req.params.fileId)));
 }
 // Aggregate only shares authorized for this identity; re-check each scope to handle revocation.
 api.get('/customer-portal/collaboration/requests',async req=>{
  const visible=await require('./db').inTransaction(req.server.pgPool,async c=>(await c.query('SELECT ritim_portal_order_list($1) result',[req.auth.userId])).rows[0].result);
  const requests=[];let truncated=visible.truncated===true;
  for(const order of visible.orders){
   try{await access(req.server.pgPool,req.auth,order.shareId,async(c,s)=>{
    if(!s.permissions?.requests)return;
    const result=await list(c,{...s,external:true,identity:req.auth});truncated||=result.truncated;
    requests.push(...result.requests.map(r=>({id:r.id,shareId:order.shareId,title:r.title,kind:r.kind,status:r.status,createdAt:r.createdAt,updatedAt:r.updatedAt,orderNumber:r.orderNumber,customer:r.customer,unread:r.unread})));
   });}catch(e){if(e.statusCode!==404)throw e;}
  }
  requests.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)||a.id.localeCompare(b.id));
  return {requests,truncated};
 });
 api.get('/customer-portal/orders/:shareId/media/:fileId',req=>access(req.server.pgPool,req.auth,req.params.shareId,(c,s)=>download(c,{...s,external:true,identity:req.auth},req.params.fileId)));
 api.post(customer+'/requests',req=>external(req,async(c,s)=>{
  const b=req.body||{},rid=identifier(b.id),mid=identifier(b.messageId),title=text(b.title,120),body=text(b.body),p=proposed(b.proposed);
  if(!['change','question'].includes(b.kind))fail(400,'INVALID_INPUT','Talep türü gerekli.');
  const o=await lockedOrder(c,s,s.orderId);if(o.status!=='open'&&b.kind==='change')fail(409,'ORDER_CLOSED','Kapalı sipariş için yalnız soru gönderebilirsiniz.');
  const baseline=await snapshot(c,s,s.orderId);if(p.orderItemId&&!baseline.items.some(i=>i.id===p.orderItemId))fail(400,'ITEM_REQUIRED','Geçersiz sipariş kalemi.');
  if(p.drawingFileId)fail(400,'INVALID_INPUT','Çizimi talep açtıktan sonra ekleyin.');
  await c.query('INSERT INTO portal_requests(tenant_id,site_id,id,customer_id,order_id,created_by,title,kind,proposed,baseline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...args(s),rid,s.customerId,s.orderId,s.identity.userId,title,b.kind,JSON.stringify(p),JSON.stringify(baseline)]);
  await c.query("INSERT INTO portal_messages(tenant_id,site_id,id,request_id,actor_id,side,body) VALUES($1,$2,$3,$4,$5,'customer',$6)",[...args(s),mid,rid,s.identity.userId,body]);
  await audit(c,s,'portal.request_created','portal_request',rid,{orderId:s.orderId});return {id:rid,messageId:mid};
 }));
 api.post(admin+'/requests/:requestId/apply',req=>run(req,async(c,s)=>apply(c,s,await requestRow(c,s,req.params.requestId,true),{...req.body,version:version(req.body?.version)})));
 api.get(admin+'/accounts',req=>run(req,async c=>({accounts:await account(c,'list',{})})));
 api.post(admin+'/accounts/:action',req=>run(req,async(c,s)=>{
  const b=req.body||{},action=req.params.action,p={customerId:identifier(b.customerId),auditId:id()};
  if(['block-customer','unblock-customer'].includes(action)){
   const accounts=(await account(c,'list',{})).filter(a=>a.customerId===p.customerId);
   for(const a of accounts)await account(c,action==='block-customer'?'block':'unblock',{...p,auditId:id(),userId:a.userId});
   return {updated:accounts.length};
  }
  if(action==='create'||action==='password'){
   if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||b.password!==b.confirmation)fail(400,'INVALID_PASSWORD','Şifreler aynı ve 12–128 karakter olmalı.');
   const providers=req.server.portalProviders;if(!providers?.userProvider||!providers.passwordProvider)fail(503,'USERS_UNAVAILABLE','Hesap yönetimi bağlantısı etkin değil.');
   if(action==='create'){
    p.username=require('./workspace-users').username(b.username);p.name=text(b.name,120);
    // A provider timeout can leave an Auth identity behind after SQL rollback.
    // Retrying the same tenant/username must address that same identity.
    const bytes=crypto.createHash('sha256').update('ritim-portal-user-v1:'+s.tenantId+':'+p.username).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=bytes.toString('hex');p.userId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    await account(c,'create',p);await providers.userProvider({...p,tenantId:s.tenantId},b.password);
   }
   else{p.userId=identifier(b.userId);const target=await account(c,'password-target',p);await providers.passwordProvider(target,b.password);await audit(c,s,'portal.password_changed','user',p.userId,{});}
  }else if(['block','unblock'].includes(action)){p.userId=identifier(b.userId);await account(c,action,p);}else fail(400,'INVALID_INPUT','Geçersiz hesap işlemi.');
  return {userId:p.userId};
 }));
 api.post(admin+'/media',{bodyLimit:4300000},req=>run(req,(c,s)=>addFile(c,s,req.body)));
 api.get(admin+'/media',req=>run(req,async(c,s)=>({files:await media(c,{...s,orderId:identifier(req.query.orderId)})})));
 api.delete(admin+'/media/:fileId',req=>run(req,async(c,s)=>{const r=await c.query('UPDATE portal_files SET revoked_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND request_id IS NULL RETURNING id',[...args(s),identifier(req.params.fileId)]);if(!r.rowCount)fail(404,'NOT_FOUND','Yayın bulunamadı.');await audit(c,s,'portal.media_revoked','portal_file',req.params.fileId,{});return {revoked:true};}));
}
module.exports={routes,options,proposed,fileInput,available,media,download,apply};
