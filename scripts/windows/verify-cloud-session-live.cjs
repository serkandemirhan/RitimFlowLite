'use strict';
// Read-only application smoke; creates/revokes its own login session only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='https://ritimflow-test.vercel.app';
const credentials=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/manager-login.json'),'utf8'));
const headersCookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function post(route,body,cookie=''){return fetch(origin+route,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body),redirect:'manual'})}
async function main(){
 const config=await (await fetch(origin+'/auth/config')).json();assert.equal(config.refreshEnabled,true);
 const login=await post('/auth/login',credentials);assert.equal(login.status,303);assert(!login.headers.get('location').includes('failed'));
 let cookie=headersCookie(login);
 try{
  const refreshOnly=cookie.split('; ').find(c=>c.startsWith('__Host-ritim_refresh='));assert(refreshOnly);
  const refresh=await post('/auth/refresh',{},refreshOnly);assert.equal(refresh.status,200);assert.equal((await refresh.json()).renewed,true);cookie=headersCookie(refresh);
  const session=await fetch(origin+'/api/v1/session',{headers:{cookie}});assert.equal(session.status,200);
  const account=await fetch(origin+'/auth/account',{headers:{cookie}});assert.equal(account.status,200);assert((await account.text()).includes('currentPassword'));
  const blocked=await fetch(origin+'/auth/refresh',{method:'POST',headers:{origin:'https://invalid.example',cookie}});assert.equal(blocked.status,403);
  const logout=await post('/auth/logout',{},cookie);assert.equal(logout.status,200);
  const revoked=await post('/auth/refresh',{},cookie.split('; ').find(c=>c.startsWith('__Host-ritim_refresh=')));assert.equal(revoked.status,401);
  console.log('Live PASS: login, refresh rotation, session, account form, cross-origin rejection, logout and refresh revocation.');cookie='';
 }finally{if(cookie)await post('/auth/logout',{},cookie)}
}
main().catch(e=>{console.error('Live cloud session test failed:',e.code||e.name);process.exitCode=1});
