'use strict';
const {HttpError}=require('./auth');
const {authenticate}=require('./identity');
const cookieName='__Host-ritim_access';
const refreshName='__Host-ritim_refresh';
function createSupabaseVerifier({url,fetcher=fetch}){
 const issuer=url+'/auth/v1';let keys;
 return {async verify(token){try{const jose=await import('jose');keys ||= jose.createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'),{[jose.customFetch]:fetcher});const {payload}=await jose.jwtVerify(token,keys,{issuer,audience:'authenticated',algorithms:['ES256','RS256'],requiredClaims:['sub','exp','iat','session_id']});if(payload.role!=='authenticated'||payload.is_anonymous===true||!payload.sub||payload.iat>Math.floor(Date.now()/1000))throw Error();return {issuer,subject:payload.sub}}catch{throw new HttpError(401,'UNAUTHENTICATED','Oturum geçersiz veya süresi dolmuş.')}}};
}
function makeSupabaseBff({url,publishableKey,appOrigin,pool,verifier,recoveryEnabled=false,fetcher=fetch}){
 if(new URL(url).origin!==url||!url.startsWith('https://')||new URL(appOrigin).origin!==appOrigin||!appOrigin.startsWith('https://'))throw Error('HTTPS origins required');
 const cookie=(value,age,name=cookieName)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
 const readCookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
 const clear=reply=>reply.header('Set-Cookie',[cookie('',0),cookie('',0,refreshName)]);
 async function authRequest(path,body,token,method='POST'){
  try{return await fetcher(url+'/auth/v1'+path,{method,headers:{apikey:publishableKey,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)})}
  catch{throw new HttpError(503,'AUTH_UNAVAILABLE','Kimlik hizmetine ulaşılamıyor. Lütfen tekrar deneyin.')}
 }
 async function acceptSession(t,reply){
  if(typeof t.access_token!=='string'||t.access_token.length>3500||!Number.isFinite(t.expires_in)||t.expires_in<=0||typeof t.refresh_token!=='string'||!/^[A-Za-z0-9._~-]{1,3000}$/.test(t.refresh_token))throw new HttpError(502,'AUTH_UNAVAILABLE','Oturum yanıtı doğrulanamadı.');
  await authenticate({headers:{authorization:'Bearer '+t.access_token}},pool,verifier);
  reply.header('Set-Cookie',[cookie(t.access_token,Math.min(3600,Math.floor(t.expires_in))),cookie(t.refresh_token,86400,refreshName)]);
 }
 function origin(req){if(req.headers.origin!==appOrigin)throw new HttpError(403,'ORIGIN_REJECTED','İstek kaynağı doğrulanamadı.')}
 function tokenFor(req){const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!value)return null;if(!['GET','HEAD','OPTIONS'].includes(req.method))origin(req);return value}
 function loginPage(failed=false){return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ritim Flow · Giriş</title><style>body{font:16px system-ui;background:#f3f6fb;color:#19334f;display:grid;place-items:center;min-height:95vh;margin:0}main{box-sizing:border-box;width:min(420px,92vw);background:white;padding:32px;border:1px solid #dce5ef;border-radius:18px}label{display:block;margin:18px 0}input,button{box-sizing:border-box;width:100%;padding:13px;font:inherit;border:1px solid #cad8e8;border-radius:8px;margin-top:8px}button{background:#245dea;color:white;border:0}p{color:#526880}.error{color:#a33131}</style><main><h1>Ritim Flow</h1><p>İş yerinize giriş yapın.</p>${failed?'<p class="error" role="alert">Giriş yapılamadı. Bilgilerinizi ve iş yeri erişiminizi kontrol edin.</p>':''}<form method="post" action="/auth/login"><label>E-posta<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Parola<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>Giriş yap</button></form><p><a href="/auth/forgot-password">Parolamı unuttum</a></p></main></html>`}
 async function routes(app){
  require('./workspace-admin-page').routes(app,{pool,verifier,tokenFor,origin});
  app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string',bodyLimit:4096},(_req,body,done)=>done(null,Object.fromEntries(new URLSearchParams(body))));
  app.addHook('onSend',async(req,reply,payload)=>{if(req.url.startsWith('/auth/')){reply.header('Cache-Control','no-store').header('Referrer-Policy','same-origin').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")}return payload});
  app.get('/auth/config',async()=>({enabled:true,provider:'supabase',manualTokenAllowed:false,refreshEnabled:true,recoveryEnabled}));
  app.get('/auth/login',async(req,reply)=>reply.type('text/html').send(loginPage(req.query?.failed==='1')));
  app.post('/auth/login',{bodyLimit:4096},async(req,reply)=>{
   origin(req);const {email,password}=req.body||{};
   if(typeof email!=='string'||typeof password!=='string'||!email||!password||email.length>254||password.length>1024)throw new HttpError(400,'INVALID_INPUT','E-posta ve parola gerekli.');
   const r=await authRequest('/token?grant_type=password',{email,password});
   if(!r.ok){if(r.status>=500)throw new HttpError(503,'AUTH_UNAVAILABLE','Kimlik hizmeti kullanilamiyor.');return reply.code(303).redirect('/auth/login?failed=1')}
   try{await acceptSession(await r.json(),reply)}catch(e){if(e.statusCode===401)return reply.code(303).redirect('/auth/login?failed=1');throw e}
   return reply.code(303).redirect('/?mode=api');
  });
  app.post('/auth/refresh',async(req,reply)=>{
   origin(req);
   const refresh=readCookie(req,refreshName);
   if(!refresh||!/^[A-Za-z0-9._~-]{1,3000}$/.test(refresh))throw new HttpError(401,'UNAUTHENTICATED','Oturum gerekli.');
   const current=readCookie(req,cookieName);
   if(current){try{await verifier.verify(current);const claims=JSON.parse(Buffer.from(current.split('.')[1],'base64url').toString());if(claims.exp>Date.now()/1000+60)return {renewed:false}}catch{}}
   const r=await authRequest('/token?grant_type=refresh_token',{refresh_token:refresh});
   if(!r.ok){if(r.status>=500||r.status===429)throw new HttpError(503,'AUTH_UNAVAILABLE','Oturum yenilenemedi; tekrar deneyin.');clear(reply);throw new HttpError(401,'UNAUTHENTICATED','Oturum sona erdi.')}
   try{await acceptSession(await r.json(),reply)}catch(e){if(e.statusCode===401)clear(reply);throw e}
   return {renewed:true};
  });
  app.post('/auth/logout',async(req,reply)=>{
   origin(req);let access=readCookie(req,cookieName);const refresh=readCookie(req,refreshName);
   // Refresh an expired access token before revoking this provider session.
   if(refresh){let valid=false;try{await verifier.verify(access);valid=true}catch{}
    if(!valid){const r=await authRequest('/token?grant_type=refresh_token',{refresh_token:refresh});if(r.ok)access=(await r.json()).access_token;else if(r.status>=500||r.status===429)throw new HttpError(503,'AUTH_UNAVAILABLE','Cikis tamamlanamadi; tekrar deneyin.');else access=null}
   }
   if(access){const r=await authRequest('/logout?scope=local',undefined,access);if(!r.ok&&![401,403,404].includes(r.status))throw new HttpError(503,'AUTH_UNAVAILABLE','Cikis tamamlanamadi; tekrar deneyin.')}
   clear(reply);return {logoutUrl:'/?mode=api'};
  });
  require('./supabase-account').routes(app,{origin,authRequest,acceptSession,clear,tokenFor,pool,verifier,recoveryEnabled});

 }
 return {routes,tokenFor};
}
module.exports={createSupabaseVerifier,makeSupabaseBff};
