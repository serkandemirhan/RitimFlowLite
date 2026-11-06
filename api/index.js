'use strict';
const {createCloudApp}=require('../backend/src/cloud-app');
let ready;
module.exports=async function handler(req,res){
 // Vercel forwards named rewrite captures as query parameters. They are routing
 // metadata, not domain filters; keep unrelated/invalid filters unchanged.
 const url=new URL(req.url,'https://ritim.invalid');
 const prefix=['/api/v1/','/auth/','/health/'].find(p=>url.pathname.startsWith(p));
 if(prefix&&url.searchParams.get('path')===url.pathname.slice(prefix.length)){url.searchParams.delete('path');req.url=url.pathname+url.search}
 try{if(!ready)ready=Promise.resolve().then(async()=>{const app=createCloudApp();await app.ready();return app}).catch(e=>{ready=null;throw e});const app=await ready;app.server.emit('request',req,res)}catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:{code:'SERVICE_NOT_CONFIGURED',message:'Bulut hizmeti henüz hazır değil.'}}))}
};
