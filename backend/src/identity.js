'use strict';
const {HttpError}=require('./auth');
// Inject only a server-configured verifier: { verify(token) -> {issuer, subject} }.
function makeOidcVerifier({issuer,audience,jwksUrl,algorithms=['RS256'],cooldownDuration=30000,fetcher}) {
 if(!issuer||!audience||!jwksUrl)throw Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL are required');
 const endpoint=new URL(jwksUrl),issuerUrl=new URL(issuer);
 if(endpoint.protocol!=='https:'||issuerUrl.protocol!=='https:'||endpoint.username||endpoint.password||issuerUrl.username||issuerUrl.password||issuerUrl.search||issuerUrl.hash)throw Error('OIDC issuer and JWKS must use HTTPS without credentials');
 if(!Array.isArray(algorithms)||!algorithms.length||algorithms.some(a=>!['RS256','ES256'].includes(a)))throw Error('Unsupported OIDC algorithm');
 let resolver;
 return Object.freeze({async verify(token){
  try {
   const jose=await import('jose');
   resolver ||= jose.createRemoteJWKSet(endpoint,{cooldownDuration,timeoutDuration:5000,...(fetcher?{[jose.customFetch]:fetcher}:{})});
   const header=jose.decodeProtectedHeader(token);
   if(typeof header.kid!=='string'||!header.kid||header.typ!=='at+jwt'||header.jku||header.x5u||header.jwk)throw Error('Untrusted token header');
   const {payload}=await jose.jwtVerify(token,resolver,{issuer,audience,algorithms,requiredClaims:['iss','sub','aud','exp','iat'],maxTokenAge:'1h',clockTolerance:0});
   if(typeof payload.sub!=='string'||!payload.sub.trim()||typeof payload.exp!=='number'||typeof payload.iat!=='number'||payload.iat>Math.floor(Date.now()/1000))throw Error('Invalid claims');
   return Object.freeze({issuer:payload.iss,subject:payload.sub});
  } catch (_) {throw new HttpError(401,'UNAUTHENTICATED','Invalid or expired access token');}
 }});
}
function bearer(header){
 if(typeof header!=='string'||header.length>8192)throw new HttpError(401,'UNAUTHENTICATED','Bearer access token required');
 const m=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
 if(!m)throw new HttpError(401,'UNAUTHENTICATED','Bearer access token required');
 return m[1];
}
async function authenticate(request,pool,verifier){
 if(!verifier)throw new HttpError(401,'UNAUTHENTICATED','Authentication unavailable');
 const claims=await verifier.verify(bearer(request.headers.authorization));
 if(!claims||typeof claims.issuer!=='string'||typeof claims.subject!=='string')throw new HttpError(401,'UNAUTHENTICATED','Invalid identity');
 const result=await pool.query('SELECT id, issuer, subject, display_name FROM users WHERE issuer=$1 AND subject=$2 AND disabled_at IS NULL',[claims.issuer,claims.subject]);
 if(result.rowCount!==1)throw new HttpError(401,'UNAUTHENTICATED','Identity is not active');
 const user=result.rows[0];
 return Object.freeze({verified:true,userId:user.id,issuer:user.issuer,subject:user.subject,displayName:user.display_name});
}
module.exports={makeOidcVerifier,bearer,authenticate};
