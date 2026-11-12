'use strict';
// Local source with the existing Supabase account and database configuration.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const root=path.resolve(__dirname,'../..');
const configFile=path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/ritimflow-test.env');
const config={...process.env};
for(const line of fs.readFileSync(configFile,'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)config[line.slice(0,i)]=line.slice(i+1)}
config.APP_ORIGIN='https://localhost:4179';
const app=require('../../backend/src/cloud-app').createCloudApp(config);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.wasm':'application/wasm'};
(async()=>{
 await app.ready();
 const server=https.createServer({pfx:fs.readFileSync(process.env.RITIM_LOCAL_PFX),passphrase:process.env.RITIM_LOCAL_PFX_PASSWORD},async(req,res)=>{
  try{
   const url=new URL(req.url,config.APP_ORIGIN);
   if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname.startsWith('/health/')){
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>10*1024*1024){res.writeHead(413);return res.end()}chunks.push(chunk)}
    const headers={...req.headers};delete headers['content-length'];
    const result=await app.inject({method:req.method,url:req.url,headers,...(chunks.length?{payload:Buffer.concat(chunks)}:{})});
    res.writeHead(result.statusCode,result.headers);return res.end(result.rawPayload);
   }
   const target=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
   if(target!=='index.html'&&target!=='teknikResim.pdf'&&!/^(assets|integration)\//.test(target)){res.writeHead(404);return res.end()}
   const file=path.resolve(root,target);if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end()}
   let body=await fs.promises.readFile(file);
   if(target==='index.html')body=Buffer.from(body.toString('utf8').replace("const API_MODE=new URL(location.href).searchParams.get('mode')==='api';",'const API_MODE=true;window.RITIM_CLOUD=true;'));
   res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  }catch{res.writeHead(500);res.end('Local application request failed')}
 });
 server.listen(4179,'127.0.0.1',()=>console.log('Local application: https://localhost:4179/?view=orders (existing cloud database)'));
})().catch(()=>{console.error('Local application startup failed');process.exitCode=1});
