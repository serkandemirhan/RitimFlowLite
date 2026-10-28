'use strict';
const Fastify=require('fastify');
const {HttpError}=require('./auth');
const {authenticate}=require('./identity');
const {authorizeScope,listMemberships}=require('./authorization');
const {inTransaction}=require('./db');
function buildApp({pool,verifier=null,logger=false}={}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('Database pool required');
  const app=Fastify({logger,bodyLimit:1024*1024});
  app.setErrorHandler((error,request,reply)=>{
    const trusted=error instanceof HttpError;
    const status=trusted?error.statusCode:(error.statusCode>=400 && error.statusCode<500?error.statusCode:500);
    const code=trusted?error.code:(status===400?'BAD_REQUEST':status===413?'PAYLOAD_TOO_LARGE':'INTERNAL_ERROR');
    if(status>=500) request.log.error({err:error},'request failed');
    reply.code(status).send({error:{code,message:trusted?error.message:(status===500?'Internal server error':'Invalid request'),requestId:request.id}});
  });
  app.setNotFoundHandler((req,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'Route not found',requestId:req.id}}));
  app.get('/health/live',async()=>({status:'ok'}));
  app.get('/health/ready',async(request,reply)=>{
    try {await pool.query('SELECT 1');return {status:'ok'};}
    catch (_) {return reply.code(503).send({error:{code:'DATABASE_UNAVAILABLE',message:'Database unavailable',requestId:request.id}});}
  });
  app.register(async function(api){
    api.addHook('onRequest',async (request,reply)=>{reply.header('cache-control','no-store');request.auth=await authenticate(request,pool,verifier)});
    api.get('/session',async req=>({identity:{id:req.auth.userId,issuer:req.auth.issuer,subject:req.auth.subject,displayName:req.auth.displayName},memberships:await listMemberships(pool,req.auth)}));
    api.get('/sites/:tenantId/:siteId/capabilities',async req=>inTransaction(pool,client=>authorizeScope(client,{identity:req.auth,tenantId:req.params.tenantId,siteId:req.params.siteId,capability:'site.read'})));
  },{prefix:'/api/v1'});
  return app;
}
module.exports={buildApp};
