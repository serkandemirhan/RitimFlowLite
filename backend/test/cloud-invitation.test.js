'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fastify=require('fastify');
const {deliveryProvider}=require('../src/workspace-invitations');
const {createOnboardingCookie}=require('../src/onboarding-cookie');
const origin='https://app.example',iid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',token='a.b.c';
function fixture({confirmed=true,match=true,enabled=true,acceptFailure=false}={}){
 const calls=[],queries=[],client={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('ritim_accept')){if(acceptFailure){const e=Error();e.code='42501';throw e;}return {rows:[{id:'user'}]};}return {rows:[]};},release(){}};
 const app=Fastify(),seal=createOnboardingCookie('test-secret');
 require('../src/supabase-invitation').routes(app,{pool:{connect:async()=>client},verifier:{verify:async value=>{if(value!==token)throw Error('invalid token');return {issuer:'issuer',subject:'subject'};}},secretKey:'test-secret',invitationsEnabled:enabled,
 origin(req){if(req.headers.origin!==origin)throw new (require('../src/auth').HttpError)(403,'ORIGIN_REJECTED','Invalid origin');},
 authRequest:async(path,body,_token,method)=>{calls.push({path,body,method});return {ok:true,json:async()=>path==='/user'?{id:match?'subject':'someone-else',email:'user@example.test',email_confirmed_at:confirmed?'2026-01-01':null}:{access_token:token,refresh_token:'refresh',expires_in:3600}};},
 acceptSession:async(_t,reply)=>{reply.header('Set-Cookie',['access=session','refresh=session']);}});
 return {app,calls,queries,seal};
}
const post=(f,path,payload,cookie='')=>f.app.inject({method:'POST',url:path,headers:{origin,cookie},payload});
const invitation={id:iid,token_hash:'a'.repeat(64),type:'invite'};
test('invitation prefetch never consumes link; accept verifies email then provisions and sets protected onboarding cookie',async t=>{
 const f=fixture();t.after(()=>f.app.close());const get=await f.app.inject('/auth/join?'+new URLSearchParams(invitation));assert.equal(get.statusCode,200);assert.equal(f.calls.length,0);
 const r=await post(f,'/auth/join',invitation);assert.equal(r.statusCode,303,r.body);assert.equal(r.headers.location,'/auth/welcome');assert.equal(f.calls[0].body.type,'invite');assert(f.queries.some(q=>q.sql.includes('ritim_accept')&&q.args[1]==='user@example.test'));
 const ck=r.headers['set-cookie'].find(x=>x.startsWith('__Host-ritim_onboarding='));assert(ck.includes('HttpOnly; Secure; SameSite=Lax'));const value=ck.split(';')[0].split('=')[1];assert.equal(f.seal.open(value),token);
});
test('unconfirmed or mismatched identity never gains membership',async t=>{for(const opts of [{confirmed:false},{match:false}]){const f=fixture(opts);t.after(()=>f.app.close());assert.equal((await post(f,'/auth/join',invitation)).statusCode,403);assert.equal(f.queries.length,0);}});
test('cancelled invitation revokes transient provider session and issues no cookies',async t=>{const f=fixture({acceptFailure:true});t.after(()=>f.app.close());const r=await post(f,'/auth/join',invitation);assert.equal(r.statusCode,403);assert.equal(r.headers['set-cookie'],undefined);assert(f.calls.some(c=>c.path==='/logout?scope=local'));});
test('existing account joins without password reset and foreign origins cannot consume links',async t=>{const f=fixture();t.after(()=>f.app.close());const denied=await f.app.inject({method:'POST',url:'/auth/join',headers:{origin:'https://evil.example'},payload:invitation});assert.equal(denied.statusCode,403);assert.equal(f.calls.length,0);const r=await post(f,'/auth/join',{...invitation,type:'magiclink'});assert.equal(r.headers.location,'/?mode=api');assert.equal(r.headers['set-cookie'].length,2);});
test('password onboarding rejects forged access cookies and accepts sealed invitation session',async t=>{const f=fixture();t.after(()=>f.app.close());const p={password:'a-secure-password',confirmation:'a-secure-password'};assert.equal((await post(f,'/auth/welcome',p,'__Host-ritim_onboarding='+token)).statusCode,401);assert.equal(f.calls.length,0);const r=await post(f,'/auth/welcome',p,'__Host-ritim_onboarding='+f.seal.seal(token));assert.equal(r.statusCode,303);assert(f.calls.some(c=>c.method==='PUT'&&c.body.password===p.password));assert.match(r.headers['set-cookie'],/Max-Age=0/);});
test('disabled invitation feature fails closed',async t=>{const f=fixture({enabled:false});t.after(()=>f.app.close());assert.equal((await post(f,'/auth/join',invitation)).statusCode,503);assert.equal(f.calls.length,0);});
test('provider creates new invitation, uses OTP for existing email, and never reports timeout as delivered',async()=>{
 const invite={id:iid,email:'person@example.test',display_name:'Person'};let sent;
 let provider=deliveryProvider({url:'https://auth.example',secretKey:'secret',appOrigin:origin,fetcher:async(url,opts)=>{sent={url,opts};return {ok:true}}});assert.equal(await provider(invite),'sent');assert(sent.url.includes('redirect_to='));assert.equal(sent.opts.headers.apikey,'secret');
 provider=deliveryProvider({url:'https://auth.example',secretKey:'secret',appOrigin:origin,fetcher:async()=>({ok:false,status:422,json:async()=>({code:'email_exists'})}),authRequest:async(path,body)=>{assert.equal(body.create_user,false);assert(path.startsWith('/otp?redirect_to='));return {ok:true};}});assert.equal(await provider(invite),'sent');
 provider=deliveryProvider({url:'https://auth.example',secretKey:'secret',appOrigin:origin,fetcher:async()=>{throw Error('timeout')}});assert.equal(await provider(invite),'unknown');
});
