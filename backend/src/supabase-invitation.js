'use strict';
const {HttpError}=require('./auth');
const {accept}=require('./workspace-invitations');
const {page:invitationPage,summary,icon,contextCodec}=require('./invitation-presentation');
const page=body=>invitationPage('Ekip daveti',body);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookie=(token,age)=>`__Host-ritim_onboarding=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function routes(app,{pool,verifier,authRequest,origin,acceptSession,tokenFor,invitationsEnabled=false,secretKey}){
 const seal=require('./onboarding-cookie').createOnboardingCookie(secretKey),display=contextCodec(secretKey);
 const context=p=>display.open(p.context,p.id);
 const suffix=p=>context(p)?'?context='+encodeURIComponent(p.context):'';
 app.register(async app=>{
 app.setErrorHandler((e,_req,reply)=>reply.code(e instanceof HttpError?e.statusCode:500).type('text/html').send(page(`<section><h2>Davet tamamlanamadı</h2><p role="alert">${esc(e instanceof HttpError?e.message:'Lütfen firma yöneticinizden yeni bir davet isteyin.')}</p><a href="/auth/login">Giriş sayfası</a></section>`)));
 function input(p){if(!invitationsEnabled)throw new HttpError(503,'INVITATIONS_DISABLED','Davetler henüz etkinleştirilmedi.');if(!uuid.test(p.id||'')||!/^[a-f0-9]{32,128}$/i.test(p.token_hash||'')||!['invite','magiclink'].includes(p.type))throw new HttpError(400,'INVALID_INVITATION','Davet bağlantısı geçersiz.');return p;}
 app.get('/auth/join',async(req,reply)=>{const p=input(req.query);return reply.type('text/html').send(page(`${icon}<h1>${context(p)?esc(context(p).company)+' ekibine davetlisiniz':'Ekibe davetlisiniz'}</h1><p>Daveti kabul ettiğinizde aşağıdaki çalışma alanına erişebileceksiniz.</p>${summary(context(p))}${!context(p)?'<p>Bu eski davet bağlantısında firma ve rol özeti bulunmuyor. Emin değilseniz daveti gönderen yöneticinizle görüşün.</p>':''}<form method="post" action="/auth/join">${['id','token_hash','type',...(context(p)?['context']:[])].map(k=>`<input type="hidden" name="${k}" value="${esc(p[k])}">`).join('')}<button>Daveti kabul et</button></form><small>${p.type==='invite'?'Sonraki adım: giriş parolanızı belirleyin.':'Mevcut hesabınız ve parolanız korunur.'}</small>`));});
 app.post('/auth/join',async(req,reply)=>{
  origin(req);const p=input(req.body||{}),response=await authRequest('/verify',{type:p.type,token_hash:p.token_hash});
  if(!response.ok)throw new HttpError(400,'INVITATION_EXPIRED','Bağlantı kullanılmış veya süresi dolmuş. Yeni davet isteyin.');
  const session=await response.json(),claims=await verifier.verify(session.access_token),profile=await authRequest('/user',undefined,session.access_token,'GET');
  if(!profile.ok)throw new HttpError(401,'IDENTITY_UNVERIFIED','E-posta doğrulanamadı.');const user=await profile.json();
  if(user.id!==claims.subject||!user.email_confirmed_at||typeof user.email!=='string')throw new HttpError(403,'EMAIL_UNVERIFIED','Doğrulanmış e-posta gerekli.');
  try{await accept(pool,{id:p.id,email:user.email,issuer:claims.issuer,subject:claims.subject});}catch(e){await authRequest('/logout?scope=local',undefined,session.access_token).catch(()=>{});throw e;}
  await acceptSession(session,reply);
  if(p.type==='invite'){reply.header('Set-Cookie',[...reply.getHeader('Set-Cookie'),cookie(seal.seal(session.access_token),600)]);return reply.code(303).redirect('/auth/welcome'+suffix(p));}
  return reply.code(303).redirect('/auth/joined'+suffix(p));
 });
 app.get('/auth/joined',async(req,reply)=>{await verifier.verify(tokenFor?.(req));return reply.type('text/html').send(page(`${icon}<h1>Ekibe katıldınız</h1><p>Erişiminiz etkinleştirildi. Çalışma alanınızı açarak başlayabilirsiniz.</p>${summary(display.open(req.query.context))}<a class="primary" href="/?mode=api">Çalışma alanını aç</a>`));});
 const onboarding=req=>seal.open(String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-ritim_onboarding='))?.slice('__Host-ritim_onboarding='.length));
 app.get('/auth/welcome',async(req,reply)=>{await verifier.verify(onboarding(req));return reply.type('text/html').send(page(`${icon}<h1>Davetiniz kabul edildi</h1><p>Hesabınız hazır. Sonraki girişleriniz için bir parola belirleyin.</p>${summary(display.open(req.query.context))}<form method="post" action="/auth/welcome">${display.open(req.query.context)?`<input type="hidden" name="context" value="${esc(req.query.context)}">`:''}<label>Yeni parola<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Yeni parola tekrar<input type="password" name="confirmation" autocomplete="new-password" minlength="12" maxlength="128" required></label><button>Parolayı kaydet ve devam et</button></form>`));});
 app.post('/auth/welcome',async(req,reply)=>{origin(req);const token=onboarding(req);await verifier.verify(token);const {password,confirmation}=req.body||{};
  if(typeof password!=='string'||password.length<12||password.length>128||password!==confirmation)throw new HttpError(400,'INVALID_PASSWORD','Parolalar aynı ve en az 12 karakter olmalı.');
  const r=await authRequest('/user',{password},token,'PUT');if(!r.ok)throw new HttpError(400,'PASSWORD_FAILED','Parola kaydedilemedi. Lütfen tekrar deneyin.');
  reply.header('Set-Cookie',cookie('',0));return reply.code(303).redirect('/auth/joined'+(display.open(req.body?.context)?'?context='+encodeURIComponent(req.body.context):''));
 });
 });
}
module.exports={routes};
