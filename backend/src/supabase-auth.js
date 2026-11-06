'use strict';
const {HttpError}=require('./auth');
const {authenticate}=require('./identity');
const cookieName='__Host-ritim_access';
function createSupabaseVerifier({url,fetcher=fetch}){
 const issuer=url+'/auth/v1';let keys;
 return {async verify(token){try{const jose=await import('jose');keys ||= jose.createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'),{[jose.customFetch]:fetcher});const {payload}=await jose.jwtVerify(token,keys,{issuer,audience:'authenticated',algorithms:['ES256','RS256'],requiredClaims:['sub','exp','iat','session_id']});if(payload.role!=='authenticated'||payload.is_anonymous===true||!payload.sub||payload.iat>Math.floor(Date.now()/1000))throw Error();return {issuer,subject:payload.sub}}catch{throw new HttpError(401,'UNAUTHENTICATED','Oturum geçersiz veya süresi dolmuş.')}}};
}
function makeSupabaseBff({url,publishableKey,appOrigin,pool,verifier,fetcher=fetch}){
 if(new URL(url).origin!==url||!url.startsWith('https://')||new URL(appOrigin).origin!==appOrigin||!appOrigin.startsWith('https://'))throw Error('HTTPS origins required');
 const cookie=(value,age)=>`${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
 function origin(req){if(req.headers.origin!==appOrigin)throw new HttpError(403,'ORIGIN_REJECTED','İstek kaynağı doğrulanamadı.')}
 function tokenFor(req){const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!value)return null;if(!['GET','HEAD','OPTIONS'].includes(req.method))origin(req);return value}
 function loginPage(failed=false){return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ritim Flow · Giriş</title><style>body{font:16px system-ui;background:#f3f6fb;color:#19334f;display:grid;place-items:center;min-height:95vh;margin:0}main{box-sizing:border-box;width:min(420px,92vw);background:white;padding:32px;border:1px solid #dce5ef;border-radius:18px}label{display:block;margin:18px 0}input,button{box-sizing:border-box;width:100%;padding:13px;font:inherit;border:1px solid #cad8e8;border-radius:8px;margin-top:8px}button{background:#245dea;color:white;border:0}p{color:#526880}.error{color:#a33131}</style><main><h1>Ritim Flow</h1><p>İş yerinize giriş yapın.</p>${failed?'<p class="error" role="alert">Giriş yapılamadı. Bilgilerinizi ve iş yeri erişiminizi kontrol edin.</p>':''}<form method="post" action="/auth/login"><label>E-posta<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Parola<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>Giriş yap</button></form></main></html>`}
 async function routes(app){
  app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string',bodyLimit:4096},(_req,body,done)=>done(null,Object.fromEntries(new URLSearchParams(body))));
  app.addHook('onSend',async(req,reply,payload)=>{if(req.url.startsWith('/auth/')){reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")}return payload});
  app.get('/auth/config',async()=>({enabled:true,provider:'supabase',manualTokenAllowed:false}));
  app.get('/auth/login',async(req,reply)=>reply.type('text/html').send(loginPage(req.query?.failed==='1')));
  app.post('/auth/login',{bodyLimit:4096},async(req,reply)=>{origin(req);const {email,password}=req.body||{};if(typeof email!=='string'||typeof password!=='string'||!email||!password||email.length>254||password.length>1024)throw new HttpError(400,'INVALID_INPUT','E-posta ve parola gerekli.');const r=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishableKey,'content-type':'application/json'},body:JSON.stringify({email,password}),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)return reply.code(303).redirect('/auth/login?failed=1');const t=await r.json();if(typeof t.access_token!=='string'||t.access_token.length>3500||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw new HttpError(502,'AUTH_UNAVAILABLE','Giriş hizmetine ulaşılamıyor.');try{await authenticate({headers:{authorization:'Bearer '+t.access_token}},pool,verifier)}catch(e){if(e.statusCode===401)return reply.code(303).redirect('/auth/login?failed=1');throw e}reply.header('Set-Cookie',cookie(t.access_token,Math.min(3600,Math.floor(t.expires_in))));return reply.code(303).redirect('/?mode=api')});
  app.post('/auth/logout',async(req,reply)=>{origin(req);reply.header('Set-Cookie',cookie('',0));return {logoutUrl:'/?mode=api'}});
 }
 return {routes,tokenFor};
}
module.exports={createSupabaseVerifier,makeSupabaseBff};
