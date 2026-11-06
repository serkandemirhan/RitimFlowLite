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
  const cookie=login.headers['set-cookie'];assert(cookie);
  const response=await app.inject({url:'/api/v1/session',headers:{cookie}});assert.equal(response.statusCode,200);
  const session=response.json();assert(session.memberships.length>0);
  console.log(JSON.stringify({login:login.statusCode,session:response.statusCode,displayName:session.identity.displayName,memberships:session.memberships}));
 }finally{await app.close()}
}
main().catch(e=>{console.error('Cloud login verification failed:',e.code||e.name);process.exitCode=1});
