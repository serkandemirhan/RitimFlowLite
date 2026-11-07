'use strict';
const {HttpError}=require('./auth');
const {authenticate}=require('./identity');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,body){return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ritim Flow · ${esc(title)}</title><style>body{font:16px system-ui;background:#f3f6fb;color:#19334f;margin:0;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;width:min(460px,94vw);background:white;padding:28px;border:1px solid #dce5ef;border-radius:16px}h1{font-size:24px}label{display:block;margin:18px 0}input,button{box-sizing:border-box;width:100%;font:inherit;padding:13px;border:1px solid #cad8e8;border-radius:8px;margin-top:6px}button{background:#245dea;color:white;border:0}a{color:#245dea}p{line-height:1.6;color:#526880}</style><main><h1>${esc(title)}</h1>${body}<p><a href="/">Uygulamaya dön</a></p></main></html>`}
const passwordFields='<label>Yeni şifre<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Yeni şifre tekrar<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p>En az 12 karakter kullanın.</p>';
const resetCookie=(value,age)=>`__Host-ritim_reset=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function password(body){if(typeof body?.password!=='string'||body.password.length<12||body.password.length>128||body.password!==body.confirmation)throw new HttpError(400,'INVALID_INPUT','Şifreler aynı olmalı ve en az 12 karakter içermeli.');return body.password}
function routes(app,{origin,authRequest,clear,tokenFor,pool,verifier,recoveryEnabled=false}){
 app.register(async app=>{
 app.setErrorHandler((error,req,reply)=>{const status=error instanceof HttpError?error.statusCode:500;const message=error instanceof HttpError?error.message:'İşlem tamamlanamadı. Lütfen tekrar deneyin.';reply.code(status);if(String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded'))return reply.type('text/html').send(page('İşlem tamamlanamadı',`<p role="alert">${esc(message)}</p><p><a href="${req.url.startsWith('/auth/account')?'/auth/account':'/auth/forgot-password'}">Tekrar dene</a></p>`));return reply.send({error:{code:error instanceof HttpError?error.code:'INTERNAL_ERROR',message}})});
 const identity=token=>authenticate({headers:{authorization:'Bearer '+token}},pool,verifier);
 const render=(reply,title,body)=>reply.type('text/html').send(page(title,body));
 const resetToken=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-ritim_reset='))?.slice(19);
 async function updatePassword(token,value){const r=await authRequest('/user',{password:value},token,'PUT');if(!r.ok)throw new HttpError(r.status>=500?503:400,'PASSWORD_UPDATE_FAILED','Şifre değiştirilemedi. Şifre politikasını kontrol edip tekrar deneyin.')}
 async function revoke(token){const r=await authRequest('/logout?scope=global',undefined,token);if(!r.ok&&![401,403,404].includes(r.status))throw new HttpError(503,'AUTH_UNAVAILABLE','Şifre değişti fakat diğer oturumlar kapatılamadı. Yeniden giriş yapın.')}
 app.get('/auth/account',async(req,reply)=>{try{await identity(tokenFor(req))}catch(e){if(e.statusCode===401)return reply.redirect('/auth/login');throw e}return render(reply,'Şifreni değiştir',`<form method="post" action="/auth/account"><label>Mevcut şifre<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="1024"></label>${passwordFields}<button>Şifreyi değiştir</button></form><p>Değişiklikten sonra tüm cihazlarda yeniden giriş gerekir.</p>`)});
 app.post('/auth/account',async(req,reply)=>{
  origin(req);const value=password(req.body),token=tokenFor(req),user=await identity(token);
  if(typeof req.body.currentPassword!=='string'||!req.body.currentPassword||req.body.currentPassword.length>1024)throw new HttpError(400,'INVALID_INPUT','Mevcut şifre gerekli.');
  const profile=await authRequest('/user',undefined,token,'GET');if(!profile.ok)throw new HttpError(401,'UNAUTHENTICATED','Yeniden giriş yapın.');const info=await profile.json();
  const check=await authRequest('/token?grant_type=password',{email:info.email,password:req.body.currentPassword});if(!check.ok)throw new HttpError(400,'PASSWORD_REJECTED','Mevcut şifre doğrulanamadı.');
  const fresh=await check.json(),confirmed=await identity(fresh.access_token);if(confirmed.userId!==user.userId)throw new HttpError(403,'FORBIDDEN','Kimlik eşleşmedi.');
  try{await updatePassword(fresh.access_token,value);await revoke(fresh.access_token)}catch(e){await authRequest('/logout?scope=local',undefined,fresh.access_token).catch(()=>{});throw e}
  clear(reply);return render(reply,'Şifreniz değiştirildi','<p>Yeni şifrenizle giriş yapabilirsiniz.</p><a href="/auth/login">Giriş yap</a>');
 });
 app.get('/auth/forgot-password',async(_req,reply)=>render(reply,'Şifremi unuttum',recoveryEnabled?'<form method="post" action="/auth/forgot-password"><label>E-posta<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button>Sıfırlama bağlantısı gönder</button></form>':'<p>E-posta ile şifre sıfırlama henüz kullanıma açılmadı. Erişiminizi yeniden sağlamak için iş yeri yöneticinizle iletişime geçin.</p>'));
 app.post('/auth/forgot-password',async(req,reply)=>{
  origin(req);if(!recoveryEnabled)throw new HttpError(503,'RECOVERY_NOT_CONFIGURED','E-posta ile sıfırlama henüz kullanıma açılmadı.');const email=req.body?.email;if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new HttpError(400,'INVALID_INPUT','Geçerli bir e-posta girin.');
  const r=await authRequest('/recover',{email});if(r.status>=500||r.status===429)throw new HttpError(503,'AUTH_UNAVAILABLE','Şu anda gönderilemiyor. Biraz sonra tekrar deneyin.');
  return render(reply,'E-postanızı kontrol edin','<p>Bu adres için uygun bir hesap varsa şifre sıfırlama bağlantısı gönderilir. Gelen kutunuzu ve istenmeyen e-postalarınızı kontrol edin.</p>');
 });
 app.get('/auth/recovery',async(req,reply)=>{const hash=req.query?.token_hash;if(typeof hash!=='string'||!/^[a-f0-9]{32,128}$/i.test(hash))return reply.code(400).type('text/html').send(page('Bağlantı geçersiz','<a href="/auth/forgot-password">Yeni bağlantı iste</a>'));return render(reply,'Şifrenizi sıfırlayın',`<p>Yeni şifrenizi belirlemek için devam edin.</p><form method="post" action="/auth/recovery"><input type="hidden" name="token_hash" value="${esc(hash)}"><button>Devam et</button></form>`)});
 app.post('/auth/recovery',async(req,reply)=>{
  origin(req);const hash=req.body?.token_hash;if(typeof hash!=='string'||!/^[a-f0-9]{32,128}$/i.test(hash))throw new HttpError(400,'INVALID_INPUT','Bağlantı geçersiz.');
  const r=await authRequest('/verify',{type:'recovery',token_hash:hash});if(!r.ok)throw new HttpError(400,'RECOVERY_EXPIRED','Bağlantının süresi dolmuş veya kullanılmış. Yeni bağlantı isteyin.');
  const t=await r.json();if(typeof t.access_token!=='string'||t.access_token.length>3500)throw new HttpError(502,'AUTH_UNAVAILABLE','Oturum doğrulanamadı.');await identity(t.access_token);
  reply.header('Set-Cookie',resetCookie(t.access_token,600));return reply.code(303).redirect('/auth/reset-password');
 });
 app.get('/auth/reset-password',async(req,reply)=>{await identity(resetToken(req));return render(reply,'Yeni şifre',`<form method="post" action="/auth/reset-password">${passwordFields}<button>Yeni şifreyi kaydet</button></form>`)});
 app.post('/auth/reset-password',async(req,reply)=>{origin(req);const value=password(req.body),token=resetToken(req);await identity(token);await updatePassword(token,value);await revoke(token);clear(reply);reply.header('Set-Cookie',[...reply.getHeader('Set-Cookie'),resetCookie('',0)]);return render(reply,'Şifreniz yenilendi','<a href="/auth/login">Yeni şifrenizle giriş yapın</a>')});
 });
}
module.exports={routes};
