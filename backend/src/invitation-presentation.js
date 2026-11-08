'use strict';
const crypto=require('node:crypto');
const roles={operator:'Operatör',planner:'Planlamacı',quality:'Kalite',logistics:'Lojistik',viewer:'Yalnız görüntüleme',manager:'Tesis yöneticisi'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function contextCodec(secret){
 const sign=b=>crypto.createHmac('sha256',secret).update('ritim-invitation-display-v1:'+b).digest('base64url');
 return {seal(i){if(!secret||!i.companyName||!i.siteName)return '';const b=Buffer.from(JSON.stringify({id:i.id,company:i.companyName,site:i.siteName,role:i.role,expires:new Date(i.expires_at).getTime()})).toString('base64url');return b+'.'+sign(b)},open(value,id){try{if(!secret||typeof value!=='string'||value.length>3000)return null;const [b,s,...rest]=value.split('.'),expected=Buffer.from(sign(b)),actual=Buffer.from(s||'');if(rest.length||expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;const p=JSON.parse(Buffer.from(b,'base64url'));if((id&&p.id!==id)||!Number.isFinite(p.expires)||p.expires<Date.now()||!roles[p.role]||typeof p.company!=='string'||typeof p.site!=='string')return null;return p}catch{return null}}};
}
function summary(c){return c?`<dl class="invite-facts"><div><dt>Firma</dt><dd>${esc(c.company)}</dd></div><div><dt>Tesis</dt><dd>${esc(c.site)}</dd></div><div><dt>Rolünüz</dt><dd>${esc(roles[c.role])}</dd></div></dl>`:''}
function page(title,body){return require('./auth-presentation').page(title,body,{heading:false});}
const icon=require('./auth-presentation').stepIcon('team');
module.exports={contextCodec,summary,page,icon,esc};
