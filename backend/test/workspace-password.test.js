'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {provider}=require('../src/workspace-password');
test('password provider only sends scoped identity and password to trusted Supabase endpoint',async()=>{
 const url='https://example.supabase.co',subject='12345678-1234-1234-1234-123456789abc';let called=0;
 const update=provider({url,secretKey:'server-only',fetcher:async(endpoint,options)=>{called++;assert.equal(endpoint,url+'/auth/v1/admin/users/'+subject);assert.equal(options.method,'PUT');assert.equal(options.headers.apikey,'server-only');assert.deepEqual(JSON.parse(options.body),{password:'Temporary-password-123'});return {ok:true};}});
 await assert.rejects(update({issuer:'https://other.supabase.co/auth/v1',subject},'Temporary-password-123'),{code:'INVALID_IDENTITY'});assert.equal(called,0);
 await update({issuer:url+'/auth/v1',subject},'Temporary-password-123');assert.equal(called,1);
 for(const status of [400,422,401,500])await assert.rejects(provider({url,secretKey:'key',fetcher:async()=>({ok:false,status})})({issuer:url+'/auth/v1',subject},'secret'),{code:'PASSWORD_FAILED'});
 await assert.rejects(provider({url,secretKey:'key',fetcher:async()=>{throw Error('network');}})({issuer:url+'/auth/v1',subject},'secret'),{code:'PASSWORD_UNKNOWN'});
});
test('team script hash covers exact rendered code and shell has no inline handlers',()=>{
 const editor=require('../src/workspace-role-editor'),crypto=require('node:crypto');
 const code=editor.html.slice(8,-9);assert.equal(editor.scriptSource,"'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'");
 assert(!require('../src/workspace-admin-shell').sidebar().includes('onclick='));
});
