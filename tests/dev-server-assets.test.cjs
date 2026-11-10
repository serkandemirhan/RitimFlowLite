const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),net=require('node:net'),path=require('node:path');
test('local API frontend serves table, calendar and PDF dependencies without exposing backend files',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['integration/dev-server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,I01_WEB_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code))})});
  const base='http://127.0.0.1:'+port;
  for(const asset of ['assets/vendor/ui/tabulator.min.js','assets/vendor/ui/tabler.scoped.css','assets/vendor/ui/daypilot.min.js','integration/drawing-viewer.mjs','assets/vendor/pdfjs/pdf.mjs','assets/vendor/pdfjs/pdf.worker.mjs','assets/vendor/pdfjs/wasm/openjpeg.wasm']){
   const response=await fetch(base+'/'+asset);assert.equal(response.status,200,asset);assert((await response.arrayBuffer()).byteLength>0,asset);
   if(asset.endsWith('.mjs'))assert.match(response.headers.get('content-type'),/javascript/);
   if(asset.endsWith('.wasm'))assert.equal(response.headers.get('content-type'),'application/wasm');
  }
  for(const file of ['backend/src/config.js','.env','package.json','assets/vendor/ui/../../../backend/src/config.js'])assert.equal((await fetch(base+'/'+file)).status,404,file);
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r))}
});
