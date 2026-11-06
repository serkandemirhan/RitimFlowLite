'use strict';
// Uses local private setup files; never logs passwords, access tokens or cookies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const home=path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud');
for(const line of fs.readFileSync(path.join(home,'ritimflow-test.env'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)process.env[line.slice(0,i)]=line.slice(i+1)}
const credentials=JSON.parse(fs.readFileSync(path.join(home,'manager-login.json'),'utf8'));
async function main(){
 const app=require('../../backend/src/cloud-app').createCloudApp();
 try{
  const login=await app.inject({method:'POST',url:'/auth/login',headers:{origin:process.env.APP_ORIGIN},payload:credentials});
  assert.equal(login.statusCode,303);assert(!login.headers.location.includes('failed'));
  const cookies=login.headers['set-cookie'];assert(cookies);const cookie=(Array.isArray(cookies)?cookies:[cookies]).map(c=>c.split(';')[0]).join('; ');
  const response=await app.inject({url:'/api/v1/session',headers:{cookie}});assert.equal(response.statusCode,200);
  const session=response.json();assert(session.memberships.length>0);
  const refreshCookie=(Array.isArray(cookies)?cookies:[]).find(c=>c.startsWith('__Host-ritim_refresh='));
  if(refreshCookie){
   const refreshed=await app.inject({method:'POST',url:'/auth/refresh',headers:{origin:process.env.APP_ORIGIN,cookie:refreshCookie.split(';')[0]}});assert.equal(refreshed.statusCode,200);assert.equal(refreshed.json().renewed,true);
   const freshCookie=refreshed.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');
   assert.equal((await app.inject({url:'/api/v1/session',headers:{cookie:freshCookie}})).statusCode,200);
   const logout=await app.inject({method:'POST',url:'/auth/logout',headers:{origin:process.env.APP_ORIGIN,cookie:freshCookie}});assert.equal(logout.statusCode,200);
   const revoked=await app.inject({method:'POST',url:'/auth/refresh',headers:{origin:process.env.APP_ORIGIN,cookie:refreshed.headers['set-cookie'].find(c=>c.startsWith('__Host-ritim_refresh=')).split(';')[0]}});assert.equal(revoked.statusCode,401);
   console.log('Provider refresh, authenticated retry and refresh-token revocation passed.');
  }
  console.log(JSON.stringify({login:login.statusCode,session:response.statusCode,displayName:session.identity.displayName,memberships:session.memberships}));
 }finally{await app.close()}
}
main().catch(e=>{console.error('Cloud login verification failed:',e.code||e.name);process.exitCode=1});
