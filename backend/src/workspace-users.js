'use strict';
const crypto=require('node:crypto');
const {cmd,data,identifier,str,audit,fail}=require('./orders-planning');
const roles=['operator','planner','quality','logistics','viewer','manager'];
function username(value){
 if(typeof value!=='string'||! /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(value.trim()))fail(400,'INVALID_USERNAME','Kullanıcı adı 3–40 karakter olmalı; İngilizce harf, rakam, nokta, tire veya alt çizgi kullanın.');
 return value.trim().toLowerCase();
}
const email=subject=>subject+'@staff.getritim.invalid';
async function execute(c,action,p){
 try{const r=(action==='assign-username'?await c.query('SELECT ritim_assign_username($1::jsonb) AS result',[JSON.stringify(p)]):await c.query('SELECT ritim_managed_users($1,$2::jsonb) AS result',[action,JSON.stringify(p)])).rows[0].result;
  if(r?.conflict)fail(409,'STALE_VERSION','Bilgiler değişti. Sayfayı yenileyip tekrar deneyin.');return r;
 }catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Bu hesap üzerinde işlem yapma yetkiniz yok. Firma yöneticileri ve başka firmalarla ortak hesaplar bu işlemden korunur.');if(e.code==='23505')fail(409,'USERNAME_TAKEN','Bu kullanıcı adı kullanılıyor. Başka bir kullanıcı adı seçin.');throw e;}
}
async function change(req,action,b,provider){
 const s=data(req),version=Number(b.version);if(!Number.isSafeInteger(version)||version<1)fail(400,'INVALID_INPUT','Geçerli kayıt sürümü gerekli.');
 let p={version};
 if(action==='create-user'){
  if(!provider)fail(503,'USERS_UNAVAILABLE','Kullanıcı oluşturma bağlantısı etkin değil.');
  if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||b.password!==b.confirmation)fail(400,'INVALID_PASSWORD','Şifreler aynı ve 12–128 karakter olmalı.');
  if(!roles.includes(b.role))fail(400,'INVALID_INPUT','Geçerli rol seçin.');
  const name=username(b.username),bytes=crypto.createHash('sha256').update('ritim-managed-user-v1:'+s.tenantId+':'+name).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString('hex'),userId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  p={...p,userId,username:name,name:str(b.name,'Ad soyad'),siteId:identifier(b.destinationSiteId),role:b.role};
 }else if(action==='assign-username')p={...p,userId:identifier(b.userId),username:username(b.username)};
 else if(['suspend','activate'].includes(action))p={...p,userId:identifier(b.userId)};
 else fail(400,'INVALID_INPUT','Geçersiz işlem.');
 // Neither the password nor a reusable password hash enters the command/audit logs.
 return cmd(req,'workspace.'+action,'members.manage',p,async c=>{
  const result=await execute(c,action==='create-user'?'create':action,p);
  if(action==='create-user')await provider({...p,tenantId:s.tenantId},b.password);
  await audit(c,s,'workspace.'+action,'user',p.userId,{...p});return {status:200,body:result};
 });
}
function provider({url,secretKey,fetcher=fetch}){
 async function request(path,method,body){
  try{return await fetcher(url+'/auth/v1/admin/users'+path,{method,headers:{apikey:secretKey,authorization:'Bearer '+secretKey,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{fail(503,'USERS_UNKNOWN','Hesap oluşturma sonucu doğrulanamadı. Aynı kullanıcı adıyla tekrar deneyin.');}
 }
 return async(p,password)=>{
  let r=await request('/'+p.userId,'GET');
  if(r.ok){const u=await r.json();if(u.id!==p.userId||u.email!==email(p.userId)||u.app_metadata?.ritim_tenant!==p.tenantId)fail(409,'IDENTITY_CONFLICT','Hesap kimliği başka bir kayıtla çakışıyor.');const reset=await request('/'+p.userId,'PUT',{password});if(!reset.ok)fail(503,'USERS_FAILED','Şifre kaydedilemedi. Aynı kullanıcı adıyla tekrar deneyin.');return;}
  if(r.status!==404)fail(503,'USERS_UNAVAILABLE','Kimlik hizmetine ulaşılamıyor. Tekrar deneyin.');
  r=await request('','POST',{id:p.userId,email:email(p.userId),password,email_confirm:true,user_metadata:{display_name:p.name},app_metadata:{ritim_tenant:p.tenantId}});
  if(!r.ok)fail([400,422].includes(r.status)?400:503,'USERS_FAILED','Hesap oluşturulamadı. Şifre kurallarını kontrol edip aynı kullanıcı adıyla tekrar deneyin.');
  const u=await r.json();if(u.id!==p.userId)fail(503,'USERS_UNKNOWN','Hesap kimliği doğrulanamadı. Aynı kullanıcı adıyla tekrar deneyin.');
 };
}
async function existingEmail({url,secretKey,fetcher=fetch},subject){
 if(!secretKey)fail(503,'AUTH_UNAVAILABLE','Kullanıcı adıyla giriş bağlantısı etkin değil.');
 let r;try{r=await fetcher(url+'/auth/v1/admin/users/'+encodeURIComponent(subject),{method:'GET',headers:{apikey:secretKey,authorization:'Bearer '+secretKey},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{fail(503,'AUTH_UNAVAILABLE','Kimlik hizmetine ulaşılamıyor. Tekrar deneyin.');}
 if(r.status===404)return null;if(!r.ok)fail(503,'AUTH_UNAVAILABLE','Kimlik hizmetine ulaşılamıyor. Tekrar deneyin.');
 const u=await r.json();return u.id===subject&&typeof u.email==='string'&&u.email.includes('@')?u.email:null;
}
module.exports={change,execute,provider,username,email,existingEmail};
