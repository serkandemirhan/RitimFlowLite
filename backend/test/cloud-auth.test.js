'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fastify=require('fastify');
const {makeSupabaseBff}=require('../src/supabase-auth');
const {cloudConfig}=require('../src/cloud-app');
const origin='https://ritimflow-test.vercel.app';
test('Supabase verifier accepts signed sessions and rejects invalid identity claims',async()=>{
 const {generateKeyPair,exportJWK,SignJWT}=await import('jose');
 const {createSupabaseVerifier}=require('../src/supabase-auth');
 const {publicKey,privateKey}=await generateKeyPair('ES256');
 const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'ES256',use:'sig'};
 const issuer='https://example.supabase.co/auth/v1',now=Math.floor(Date.now()/1000);
 const verifier=createSupabaseVerifier({url:'https://example.supabase.co',fetcher:async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}})});
 const claims={iss:issuer,aud:'authenticated',sub:'test-subject',iat:now,exp:now+300,role:'authenticated',session_id:'test-session'};
 const sign=p=>new SignJWT(p).setProtectedHeader({alg:'ES256',kid:'test-key'}).sign(privateKey);
 assert.deepEqual(await verifier.verify(await sign(claims)),{issuer,subject:'test-subject'});
 for(const patch of [{iss:'https://wrong.test'},{aud:'other'},{exp:now-5},{iat:now+300},{role:'service_role'},{is_anonymous:true},{session_id:undefined}])await assert.rejects(()=>sign({...claims,...patch}).then(t=>verifier.verify(t)));
});
function fixture(active=true){let calls=0;const pool={query:async()=>({rowCount:active?1:0,rows:active?[{id:'user',issuer:'issuer',subject:'subject',display_name:'Test'}]:[]})};const bff=makeSupabaseBff({url:'https://example.supabase.co',publishableKey:'public',appOrigin:origin,pool,verifier:{verify:async()=>({issuer:'issuer',subject:'subject'})},fetcher:async()=>{calls++;return {ok:true,json:async()=>({access_token:'aaa.bbb.ccc',expires_in:3600})}}});const app=Fastify();bff.routes(app);return {app,bff,calls:()=>calls}}
test('cloud login validates membership and survives a different server instance',async()=>{const a=fixture(),b=fixture();try{const r=await a.app.inject({method:'POST',url:'/auth/login',headers:{origin,'content-type':'application/x-www-form-urlencoded'},payload:'email=test%40example.com&password=test'});assert.equal(r.statusCode,303);const cookie=r.headers['set-cookie'];assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.equal(b.bff.tokenFor({method:'GET',headers:{cookie}}),'aaa.bbb.ccc');assert.throws(()=>b.bff.tokenFor({method:'POST',headers:{cookie,origin:'https://wrong.test'}}));const logout=await b.app.inject({method:'POST',url:'/auth/logout',headers:{origin,cookie}});assert.match(logout.headers['set-cookie'],/Max-Age=0/)}finally{await a.app.close();await b.app.close()}});
test('cloud login rejects cross-origin before contacting identity provider',async()=>{const f=fixture();try{const r=await f.app.inject({method:'POST',url:'/auth/login',headers:{origin:'https://wrong.test'},payload:{email:'x',password:'y'}});assert.equal(r.statusCode,403);assert.equal(f.calls(),0)}finally{await f.app.close()}});
test('unprovisioned identity gets no session cookie and no credential echo',async()=>{const f=fixture(false);try{const r=await f.app.inject({method:'POST',url:'/auth/login',headers:{origin},payload:{email:'x',password:'private-value'}});assert.equal(r.statusCode,303);assert.equal(r.headers['set-cookie'],undefined);assert(!r.body.includes('private-value'));assert.match(r.headers.location,/failed/)}finally{await f.app.close()}});
test('cloud configuration fails closed without secrets and rejects development mode',()=>{assert.throws(()=>cloudConfig({}),/DATABASE_URL/);const e={DATABASE_URL:'postgresql://runtime:p@example.com/db',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',APP_ORIGIN:origin,RECOVERY_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),RECOVERY_KEY_VERSION:'v1',RITIM_ISOLATED_DEVELOPMENT:'true'};assert.throws(()=>cloudConfig(e),/Development/)});
