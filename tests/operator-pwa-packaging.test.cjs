'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('PWA release contains installable manifest, correctly sized icons and uncached worker',()=>{
 cp.execFileSync(process.execPath,['scripts/build-cloud.cjs'],{cwd:root});
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/cloud/operator.webmanifest'),'utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/?view=operator&app=1');
 for(const icon of manifest.icons){const data=fs.readFileSync(path.join(root,'dist/cloud',icon.src));assert.equal(data.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(data.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}
 const worker=fs.readFileSync(path.join(root,'dist/cloud/operator-sw.js'),'utf8');assert(!worker.includes('__BUILD_VERSION__'));assert(!worker.includes('__PWA_ASSETS__'));assert.match(worker,/ritim-operator-static-/);
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));assert(config.headers.find(h=>h.source==='/operator-sw.js').headers.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store')));
});
test('worker never intercepts authentication, business data, writes or private drawing responses',async()=>{
 const handlers={},cached=[],deleted=[],scope={location:{origin:'https://flow.example'},clients:{claim:async()=>{}},addEventListener:(k,v)=>handlers[k]=v,skipWaiting:()=>{scope.skipped=true;}};
 const cache={addAll:async urls=>cached.push(...urls),put:async url=>cached.push(url),match:async()=>({cached:true})};
 const context={self:scope,URL,caches:{open:async()=>cache,keys:async()=>['ritim-operator-static-old','unrelated-cache'],delete:async key=>deleted.push(key),match:async url=>({offline:url})},fetch:async()=>{throw Error('Offline')}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'dist/cloud/operator-sw.js'),'utf8'),context);
 for(const [url,method,mode]of [['/api/v1/session','GET','cors'],['/auth/team','GET','navigate'],['/api/v1/sites/t/s/orders','GET','cors'],['/api/v1/sites/t/s/orders/o/work-orders/j/drawing/document','GET','cors'],['/assets/css/operator-pwa.css','POST','cors'],['/operator-sw.js','GET','cors']]){
  let intercepted=false;handlers.fetch({request:{url:'https://flow.example'+url,method,mode},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
 }
 await new Promise((resolve,reject)=>handlers.install({waitUntil:p=>p.then(resolve,reject)}));assert.equal(scope.skipped,undefined,'Installation never replaces an active worker automatically');assert(cached.every(p=>!p.startsWith('/api/')&&!p.startsWith('/auth/')));
 let response;handlers.fetch({request:{url:'https://flow.example/?view=operator&app=1',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal((await response).offline,'/operator-offline.html');
 await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));assert.deepEqual(deleted,['ritim-operator-static-old']);handlers.message({data:{type:'ACTIVATE_OPERATOR_UPDATE'}});assert.equal(scope.skipped,true);
});
