const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('integration/premium-api.js','utf8');
test('cloud entry redirects only unauthenticated sessions and restores signed-in scope',async()=>{
 for(const status of [200,401,503]){
  const redirects=[];let restored=0;
  const c={window:{RITIM_CLOUD:true},location:{replace:x=>redirects.push(x)},authLoading:false,devToken:false,requestedDevToken:false,session:null,api:null,error:'',authProvider:null,draw(){},clearIdentity(){c.session=null;c.api=null},clearSite(){},async restoreMembership(){restored++},RitimAuthProvider:{createBff:()=>({config:async()=>({enabled:true,refreshEnabled:true})})},RitimApiAdapter:{create:()=>({session:async()=>{if(status!==200)throw Object.assign(Error('unavailable'),{status});return {identity:{}}}})}};
  vm.createContext(c);vm.runInContext(source.split('\n').find(x=>x.includes('async function initializeAuth()'))+';initializeAuth()',c);await new Promise(r=>setImmediate(r));
  assert.deepEqual(redirects,status===401?['/auth/login']:[]);assert.equal(restored,status===200?1:0);
 }
});
test('unauthenticated cloud rendering never mounts the application shell',()=>{
 const app={innerHTML:''},c={window:{RITIM_CLOUD:true},session:null,devToken:false,error:'',h:x=>x,el:()=>app,shell(){throw Error('Workspace must not render')}};
 vm.createContext(c);vm.runInContext(source.split('\n').find(x=>x.includes('function draw(){'))+';draw()',c);assert(app.innerHTML.includes('Ritim Flow'));assert(!app.innerHTML.includes('side-btn'));
});
