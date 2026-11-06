'use strict';
const {inTransaction}=require('./db');
const {authorizeScope}=require('./authorization');
const {data,payload,identifier,str,cmd,audit,fail}=require('./orders-planning');
function input(action,b){
 if(!Number.isSafeInteger(b.version)||b.version<1)fail(400,'INVALID_INPUT','Geçerli kayıt sürümü gerekli.');
 const p={version:b.version};
 if(action==='company')return {...p,name:str(b.name,'Firma adı')};
 if(action==='site')return {...p,id:identifier(b.id),create:b.create===true,code:str(b.code,'Tesis kodu'),name:str(b.name,'Tesis adı')};
 if(action==='member'){
  if(!['manager','planner','operator','quality','logistics','viewer','none'].includes(b.role))fail(400,'INVALID_INPUT','Geçerli rol seçin.');
  return {...p,userId:identifier(b.userId),siteId:identifier(b.siteId),role:b.role};
 }
 fail(400,'INVALID_INPUT','Geçersiz işlem.');
}
async function call(c,action,p){
 let r;try{r=await c.query('SELECT ritim_admin_workspace($1,$2::jsonb) AS workspace',[action,JSON.stringify(p)]);}catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Bu kullanıcı veya tesis için yetkiniz yok.');throw e;}
 const w=r.rows[0].workspace;if(w?.conflict)fail(409,'STALE_VERSION','Bilgiler değişti. Sayfayı yenileyip tekrar deneyin.');return w;
}
async function read(pool,s){return inTransaction(pool,async c=>{await authorizeScope(c,{...s,capability:'members.manage'});return call(c,'read',{});});}
async function change(req,action,b){const p=input(action,b),s=data(req);return cmd(req,'workspace.'+action,'members.manage',p,async c=>{
 const workspace=await call(c,action,p);await audit(c,s,'workspace.'+action,'tenant',s.tenantId,p);return {status:200,body:workspace};
});}
function routes(api){
 api.get('/sites/:tenantId/:siteId/administration',req=>read(api.pgPool,data(req)));
 api.post('/sites/:tenantId/:siteId/administration/:action',async(req,reply)=>{const r=await change(req,req.params.action,payload(req));return reply.code(r.status).send(r.body);});
}
module.exports={routes,read,change,input};
