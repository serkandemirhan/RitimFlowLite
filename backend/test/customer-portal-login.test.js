'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fastify=require('fastify');
const {loginDestination,loginPage}=require('../src/auth-presentation');
const {makeSupabaseBff}=require('../src/supabase-auth');
test('portal login return paths are exact, allowlisted and escaped',()=>{
 for(const path of ['/customer-portal.html','/customer-sharing.html']){
  assert.equal(loginDestination(path),path);assert.ok(loginPage(false,path).includes(`name="next" value="${path}"`));
 }
 for(const path of ['https://evil.example','//evil.example','/customer-portal.html?next=evil','/\\evil','<script>',null,{},'/auth/team'])assert.equal(loginDestination(path),'/');
});
test('login retains customer destination on success/failure, rejects open redirect',async()=>{
 let success=true;const token={access_token:'a.b.c',refresh_token:'test-refresh',expires_in:3600};
 const pool={query:async()=>({rowCount:1,rows:[{id:'00000000-0000-0000-0000-000000000001',issuer:'https://identity.example/auth/v1',subject:'customer',display_name:'Customer'}]})};
 const app=Fastify();await makeSupabaseBff({url:'https://identity.example',appOrigin:'https://app.example',publishableKey:'public',pool,verifier:{verify:async()=>({issuer:'https://identity.example/auth/v1',subject:'customer'})},fetcher:async()=>({ok:success,status:success?200:400,json:async()=>token})}).routes(app);
 try{
  const request=next=>app.inject({method:'POST',url:'/auth/login',headers:{origin:'https://app.example'},payload:{email:'customer@example.test',password:'test-password',next}});
  let r=await request('/customer-portal.html');assert.equal(r.statusCode,303);assert.equal(r.headers.location,'/customer-portal.html');
  r=await request('https://evil.example');assert.equal(r.headers.location,'/');
  success=false;r=await request('/customer-sharing.html');assert.equal(r.headers.location,'/auth/login?failed=1&next=%2Fcustomer-sharing.html');
  const page=await app.inject('/auth/login?next=%2Fcustomer-portal.html');assert.equal(page.statusCode,200);assert.ok(page.body.includes('name="next" value="/customer-portal.html"'));
 }finally{await app.close()}
});
