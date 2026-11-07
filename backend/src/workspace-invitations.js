'use strict';
const crypto=require('node:crypto');
const {inTransaction}=require('./db'),{authorizeScope}=require('./authorization');
const {cmd,data,str,identifier,audit,fail}=require('./orders-planning');
async function operation(c,action,p){try{return (await c.query('SELECT ritim_manage_invitation($1,$2::jsonb) result',[action,JSON.stringify(p)])).rows[0].result;}catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Davete erişim yetkiniz yok.');throw e;}}
async function scoped(pool,s,action,p){return inTransaction(pool,async c=>{await authorizeScope(c,{...s,capability:'members.manage'});return operation(c,action,p);});}
function list(pool,s){return scoped(pool,s,'list',{});}
async function create(req,b){
 const email=String(b.email||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail(400,'INVALID_INPUT','Geçerli bir e-posta adresi girin.');
 if(!['operator','planner','quality','logistics','viewer','manager'].includes(b.role))fail(400,'INVALID_INPUT','Geçerli bir tesis rolü seçin.');
 const p={email,name:str(b.name,'Ad soyad'),siteId:identifier(b.destinationSiteId),role:b.role},s=data(req);
 return cmd(req,'invitation.create','members.manage',p,async c=>{const invite=await operation(c,'create',{...p,id:crypto.randomUUID()});await audit(c,s,'invitation.created','invitation',invite.id,{email,siteId:p.siteId,role:p.role});return {status:201,body:{id:invite.id}};});
}
async function cancel(req,b){const s=data(req),p={id:identifier(b.id)};return cmd(req,'invitation.cancel','members.manage',p,async c=>{await operation(c,'cancel',p);await audit(c,s,'invitation.cancelled','invitation',p.id,{});return {status:200,body:{cancelled:true}};});}
async function send(req,id,provider){
 const s=data(req),p={id:identifier(id)},invite=await scoped(req.server.pgPool,s,'send',p);
 if(!invite)fail(409,'INVITATION_WAIT','Davet artık geçerli değil veya az önce gönderildi. Yeniden göndermek için iki dakika bekleyin.');
 let delivery='unknown';
 try{const w=await require('./workspace-administration').read(req.server.pgPool,s);delivery=await provider({...invite,companyName:w.name,siteName:w.sites.find(x=>x.id===invite.site_id)?.name});}finally{await scoped(req.server.pgPool,s,'delivery',{...p,delivery});}
 if(delivery!=='sent')fail(503,'INVITATION_DELIVERY','Davet kaydedildi ancak gönderim doğrulanamadı. Ekip ekranından durumu kontrol edip yeniden gönderebilirsiniz.');
}
async function accept(pool,{id,email,issuer,subject}){return inTransaction(pool,async c=>{try{return (await c.query('SELECT ritim_accept_invitation($1,$2,$3,$4) id',[identifier(id),email,issuer,subject])).rows[0].id;}catch(e){if(e.code==='42501')fail(403,'INVITATION_UNAVAILABLE','Davet geçersiz, iptal edilmiş veya süresi dolmuş. Firma yöneticinizden yeni bir davet isteyin.');throw e;}});}
function deliveryProvider({url,secretKey,appOrigin,authRequest,fetcher=fetch}){
 return async invite=>{
  const context=require('./invitation-presentation').contextCodec(secretKey).seal(invite);
  const redirect=appOrigin+'/auth/join?id='+encodeURIComponent(invite.id)+(context?'&context='+encodeURIComponent(context):'');
  let response;try{response=await fetcher(url+'/auth/v1/invite?redirect_to='+encodeURIComponent(redirect),{method:'POST',headers:{apikey:secretKey,authorization:'Bearer '+secretKey,'content-type':'application/json'},body:JSON.stringify({email:invite.email,data:{display_name:invite.display_name}}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{return 'unknown';}
  if(response.ok)return 'sent';
  const body=await response.json().catch(()=>({}));
  // Existing accounts keep their password; the email link verifies ownership before joining.
  if(['email_exists','user_already_exists'].includes(body.error_code||body.code)){
   const otp=await authRequest('/otp?redirect_to='+encodeURIComponent(redirect),{email:invite.email,create_user:false});return otp.ok?'sent':otp.status>=500?'unknown':'failed';
  }
  return response.status>=500?'unknown':'failed';
 };
}
module.exports={list,create,cancel,send,accept,deliveryProvider};
