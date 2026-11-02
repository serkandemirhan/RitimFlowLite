'use strict';
const Fastify=require('fastify');
const {HttpError}=require('./auth');
const {authenticate}=require('./identity');
const {authorizeScope,listMemberships}=require('./authorization');
const {inTransaction}=require('./db');
const {checkReadiness}=require('./readiness');
function buildApp({pool,verifier=null,logger=false,isolatedDevelopment=false,bff=null,recovery=null}={}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('Database pool required');
  const app=Fastify({logger,disableRequestLogging:!!bff,bodyLimit:1024*1024});
  app.decorate('pgPool',pool);
  app.setErrorHandler((error,request,reply)=>{
    if(error.code==='23505')return reply.code(409).send({error:{code:'CONFLICT',message:'A record already exists',requestId:request.id}});
    const trusted=error instanceof HttpError;
    const status=trusted?error.statusCode:(error.statusCode>=400 && error.statusCode<500?error.statusCode:500);
    const code=trusted?error.code:(status===400?'BAD_REQUEST':status===413?'PAYLOAD_TOO_LARGE':'INTERNAL_ERROR');
    if(status>=500) request.log.error({err:error},'request failed');
    reply.code(status).send({error:{code,message:trusted?error.message:(status===500?'Internal server error':'Invalid request'),requestId:request.id}});
  });
  app.setNotFoundHandler((req,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'Route not found',requestId:req.id}}));
  if(bff)bff.routes(app);else app.get('/auth/config',async()=>({enabled:false,manualTokenAllowed:isolatedDevelopment}));
  app.get('/health/live',async()=>({status:'ok'}));
  app.get('/health/ready',async(request,reply)=>{
    try {await checkReadiness(pool,{isolatedDevelopment});return {status:'ok'};}
    catch (_) {return reply.code(503).send({error:{code:'DATABASE_UNAVAILABLE',message:'Database unavailable',requestId:request.id}});}
  });
  app.register(async function(api){
    api.addHook('onRequest',async (request,reply)=>{reply.header('cache-control','no-store');const sessionToken=bff?.tokenFor(request);request.auth=await authenticate(sessionToken?{headers:{authorization:'Bearer '+sessionToken}}:request,pool,verifier)});
    if(isolatedDevelopment) { require('./inventory-service').routes(api); require('./rma-service').routes(api); require('./outsourcing-service').routes(api); require('./shipping-service').routes(api); require('./orders-planning').routes(api); require('./physical-flow').routes(api); require('./production-execution').routes(api); require('./quality-disposition').routes(api); require('./output-reservations').routes(api); require('./cross-operation-flow').routes(api); require('./assignment').routes(api); require('./integration-contracts').routes(api); require('./operator-work-orders').routes(api); require('./drawing-acknowledgement').routes(api); }
    if(isolatedDevelopment && bff && recovery) require('./recovery-routes').routes(api,{pool,bff,recovery});
    api.get('/session',async req=>({identity:{id:req.auth.userId,issuer:req.auth.issuer,subject:req.auth.subject,displayName:req.auth.displayName},memberships:await listMemberships(pool,req.auth)}));
    api.get('/sites/:tenantId/:siteId/capabilities',async req=>inTransaction(pool,client=>authorizeScope(client,{identity:req.auth,tenantId:req.params.tenantId,siteId:req.params.siteId,capability:'site.read'})));
  },{prefix:'/api/v1'});
  return app;
}
module.exports={buildApp};
