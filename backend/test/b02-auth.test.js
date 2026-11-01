'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeOidcVerifier,bearer}=require('../src/identity');
const {MATRIX,capabilities}=require('../src/permissions');
const issuer='https://identity.example.test/realms/workshop',audience='ritim-api';
async function fixture(){
 const jose=await import('jose');const a=await jose.generateKeyPair('RS256',{modulusLength:2048});const b=await jose.generateKeyPair('RS256',{modulusLength:2048});
 const jwkA={...await jose.exportJWK(a.publicKey),kid:'one',use:'sig',alg:'RS256'};const jwkB={...await jose.exportJWK(b.publicKey),kid:'two',use:'sig',alg:'RS256'};
 let keys=[jwkA],fetches=0;const fetcher=async()=>{fetches++;return new Response(JSON.stringify({keys}),{status:200,headers:{'content-type':'application/json'}})};
 const verifier=makeOidcVerifier({issuer,audience,jwksUrl:'https://identity.example.test/jwks',fetcher,cooldownDuration:0});
 async function sign({key=a.privateKey,kid='one',iss=issuer,aud=audience,subject='worker',exp='5m',iat=Math.floor(Date.now()/1000),typ='at+jwt',extra={},alg='RS256'}={}){
  return new jose.SignJWT(extra).setProtectedHeader({alg,kid,typ}).setIssuer(iss).setAudience(aud).setSubject(subject).setIssuedAt(iat).setExpirationTime(exp).sign(key);
 }
 return {verifier,sign,a,b,jwkA,jwkB,setKeys:v=>keys=v,fetches:()=>fetches,jose};
}
test('verified JWT identity ignores self-asserted roles and tenant claims',async()=>{
 const f=await fixture(),t=await f.sign({extra:{role:'superadmin',tenant_id:'forged'}});assert.deepEqual(await f.verifier.verify(t),{issuer,subject:'worker'});
});
test('missing, malformed and oversized bearer tokens fail closed',()=>{
 for(const h of [undefined,'Bearer abc','Basic a.b.c','Bearer a.b.c extra','Bearer '+('x'.repeat(9000))])assert.throws(()=>bearer(h),{statusCode:401});
 assert.equal(bearer('Bearer a.b.c'),'a.b.c');
});
test('expired, wrong issuer, wrong audience, future iat, wrong typ and invalid signature rejected',async()=>{
 const f=await fixture();const bad=[await f.sign({exp:'-1s'}),await f.sign({iss:'https://evil.example'}),await f.sign({aud:'other'}),await f.sign({iat:Math.floor(Date.now()/1000)+60}),await f.sign({typ:'JWT'}),await f.sign({key:f.b.privateKey})];
 for(const token of bad)await assert.rejects(f.verifier.verify(token),{statusCode:401});
});
test('required expiry, issuance time, subject and key id are enforced',async()=>{
 const f=await fixture();const jose=f.jose;
 const noexp=await new jose.SignJWT().setProtectedHeader({alg:'RS256',kid:'one',typ:'at+jwt'}).setIssuer(issuer).setAudience(audience).setSubject('worker').setIssuedAt().sign(f.a.privateKey);
 const nokid=await new jose.SignJWT().setProtectedHeader({alg:'RS256',typ:'at+jwt'}).setIssuer(issuer).setAudience(audience).setSubject('worker').setIssuedAt().setExpirationTime('5m').sign(f.a.privateKey);
 const nosub=await new jose.SignJWT().setProtectedHeader({alg:'RS256',kid:'one',typ:'at+jwt'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(f.a.privateKey);
 const noiat=await new jose.SignJWT().setProtectedHeader({alg:'RS256',kid:'one',typ:'at+jwt'}).setIssuer(issuer).setAudience(audience).setSubject('worker').setExpirationTime('5m').sign(f.a.privateKey);
 for(const token of [noexp,nokid,nosub,noiat])await assert.rejects(f.verifier.verify(token),{statusCode:401});
});
test('remote key rotation fetches new kid and rejects removed key after refresh',async()=>{
 const f=await fixture();assert.equal((await f.verifier.verify(await f.sign())).subject,'worker');f.setKeys([f.jwkB]);
 assert.equal((await f.verifier.verify(await f.sign({key:f.b.privateKey,kid:'two'}))).subject,'worker');assert(f.fetches()>=2);
 await assert.rejects(f.verifier.verify(await f.sign()),{statusCode:401});
});
test('insecure endpoints and unsafe algorithms are rejected',()=>{
 for(const o of [{issuer:'http://issuer',audience,jwksUrl:'https://example.test/jwks'},{issuer,audience,jwksUrl:'http://example.test/jwks'},{issuer,audience,jwksUrl:'https://example.test/jwks',algorithms:['HS256']},{issuer,audience,jwksUrl:'https://example.test/jwks',algorithms:[]}])assert.throws(()=>makeOidcVerifier(o));
});
test('permission matrix explicitly separates site roles and denies unknown roles',()=>{
 assert(capabilities(['superadmin']).includes('platform.manage'));assert(!capabilities(['tenant_admin']).includes('platform.manage'));
 assert(capabilities(['planner']).includes('planning.write'));assert(!capabilities(['operator']).includes('planning.write'));
 assert(capabilities(['quality']).includes('quality.write'));assert(capabilities(['logistics']).includes('shipment.write'));
 assert.deepEqual(capabilities(['untrusted-superadmin']),[]);assert(Object.isFrozen(MATRIX));
});
test('Keycloak JWT access-token compatibility is opt-in and rejects ID-shaped tokens',async()=>{
 const f=await fixture();const verifier=makeOidcVerifier({issuer,audience,jwksUrl:'https://identity.example.test/jwks',allowJwtBearerTyp:true,fetcher:async()=>new Response(JSON.stringify({keys:[f.jwkA]}),{headers:{'content-type':'application/json'}})});
 assert.equal((await verifier.verify(await f.sign({typ:'JWT',extra:{typ:'Bearer'}}))).subject,'worker');
 await assert.rejects(verifier.verify(await f.sign({typ:'JWT'})),{statusCode:401});
});
