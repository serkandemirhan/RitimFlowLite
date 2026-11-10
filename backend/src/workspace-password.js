'use strict';
const {cmd,data,identifier,audit,fail}=require('./orders-planning');
async function change(req,b,provider){
 const userId=identifier(b.userId),s=data(req);
 if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||b.password!==b.confirmation)
  fail(400,'INVALID_PASSWORD','Şifreler aynı ve 12–128 karakter uzunluğunda olmalı.');
 if(!provider)fail(503,'PASSWORD_UNAVAILABLE','Şifre yönetimi bağlantısı henüz etkin değil.');
 // Never include passwords (or password hashes) in command records or audit payloads.
 return cmd(req,'workspace.password','members.manage',{userId},async c=>{
  let target;
  try{target=(await c.query('SELECT ritim_password_target($1) AS target',[userId])).rows[0].target;}
  catch(e){if(e.code==='42501')fail(403,'FORBIDDEN','Bu hesabın şifresini değiştirme yetkiniz yok. Kendi şifreniz için hesap ayarlarını kullanın.');throw e;}
  await provider(target,b.password);
  await audit(c,s,'workspace.password_changed','user',userId,{});
  return {status:200,body:{changed:true}};
 });
}
function provider({url,secretKey,fetcher=fetch}){
 return async(target,password)=>{
  if(target.issuer!==url+'/auth/v1'||!/^[0-9a-f-]{36}$/i.test(target.subject))fail(403,'INVALID_IDENTITY','Hesap kimliği doğrulanamadı.');
  let response;
  try{response=await fetcher(url+'/auth/v1/admin/users/'+encodeURIComponent(target.subject),{method:'PUT',headers:{apikey:secretKey,authorization:'Bearer '+secretKey,'content-type':'application/json'},body:JSON.stringify({password}),redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{fail(503,'PASSWORD_UNKNOWN','Şifre değişikliğinin sonucu doğrulanamadı. Yeniden işlem yapmadan önce yeni şifreyle girişi kontrol edin.');}
  if(!response.ok)fail(response.status===422||response.status===400?400:503,'PASSWORD_FAILED','Şifre değiştirilemedi. Şifre kurallarını kontrol edip tekrar deneyin.');
 };
}
module.exports={change,provider};
