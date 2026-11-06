'use strict';
const crypto=require('node:crypto'),{HttpError}=require('./auth');
function createOnboardingCookie(secret){
 const denied=()=>{throw new HttpError(401,'ONBOARDING_EXPIRED','Parola belirleme bağlantısının süresi doldu. Parolamı unuttum adımını kullanın.');};
 function sign(value){if(!secret)denied();return crypto.createHmac('sha256',secret).update('ritim-onboarding-v1:'+value).digest('base64url');}
 return {seal(token){const body=Buffer.from(JSON.stringify({token,expires:Date.now()+600000})).toString('base64url');const result=body+'.'+sign(body);if(result.length>3800)denied();return result;},open(value){
  if(typeof value!=='string'||value.length>3800)denied();const [body,signature,...rest]=value.split('.');if(!body||!signature||rest.length)denied();const expected=Buffer.from(sign(body)),actual=Buffer.from(signature);if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))denied();
  let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString());}catch{denied();}if(typeof p.token!=='string'||!Number.isFinite(p.expires)||p.expires<=Date.now())denied();return p.token;
 }};
}
module.exports={createOnboardingCookie};
