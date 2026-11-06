'use strict';
const {createCloudApp}=require('../backend/src/cloud-app');
let ready;
module.exports=async function handler(req,res){
 try{if(!ready)ready=Promise.resolve().then(async()=>{const app=createCloudApp();await app.ready();return app}).catch(e=>{ready=null;throw e});const app=await ready;app.server.emit('request',req,res)}catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:{code:'SERVICE_NOT_CONFIGURED',message:'Bulut hizmeti henüz hazır değil.'}}))}
};
