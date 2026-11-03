'use strict';
const {HttpError}=require('./auth');
const {identifier}=require('./orders-planning');
const {createRecoveryCipher}=require('./recovery-crypto');
const {createRecoveryStore}=require('./recovery-store');
const {createRecoveryService}=require('./recovery-service');
const {authorizeRecoveryResource}=require('./recovery-resource');
const {allowedKinds}=require('./recovery-catalog');
const {createRecoveryWorkflow}=require('./recovery-workflow');
const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function routes(api,{pool,bff,recovery}){
 if(!bff||!recovery)throw Error('BFF and recovery configuration required');
 const cipher=createRecoveryCipher(recovery.key),store=createRecoveryStore({pool,cipher,keyVersion:recovery.keyVersion,allowedKinds,authorizeResource:authorizeRecoveryResource});
 const scope=req=>{if(!bff.tokenFor(req))throw new HttpError(401,'UNAUTHENTICATED','Authenticated browser session required');return {identity:req.auth,tenantId:identifier(req.params.tenantId),siteId:identifier(req.params.siteId)}};
 const service=createRecoveryService({store,execute:async({scope,context,descriptor,key})=>{const response=await api.inject({method:'POST',url:`/api/v1/sites/${scope.tenantId}/${scope.siteId}${descriptor.suffix}`,headers:{cookie:context.cookie,origin:context.origin,'idempotency-key':key},payload:descriptor.payload});let body;try{body=response.json()}catch{throw new HttpError(502,'RECOVERY_RESPONSE_INVALID','Command result unavailable')}return {status:response.statusCode,body}}});
 const workflow=createRecoveryWorkflow({pool,cipher,keyVersion:recovery.keyVersion});
 const prefix='/sites/:tenantId/:siteId/recovery';
 api.get(prefix+'/workflow',async req=>({workflow:await workflow.read(scope(req))}));
 api.post(prefix+'/workflow',async(req,reply)=>{const s=scope(req),b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||!uuid4.test(b.id||'')||Object.keys(b).some(x=>!['id','expectedRevision','status','state'].includes(x)))throw new HttpError(400,'INVALID_WORKFLOW','Invalid workflow request');return reply.code(201).send(await workflow.save(s,b))});
 api.post(prefix,async(req,reply)=>{const s=scope(req),b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||!uuid4.test(b.id||'')||typeof b.key!=='string'||!b.command||Object.keys(b).some(x=>!['id','key','command'].includes(x)))throw new HttpError(400,'INVALID_COMMAND','Invalid recovery request');return reply.code(201).send(await service.register(s,{id:b.id,key:b.key,command:b.command}))});
 api.get(prefix,async req=>({commands:await service.list(scope(req))}));
 api.get(prefix+'/:recoveryId',async req=>service.get(scope(req),identifier(req.params.recoveryId)));
 api.post(prefix+'/:recoveryId/acknowledge',async req=>service.acknowledge(scope(req),identifier(req.params.recoveryId)));
 api.post(prefix+'/:recoveryId/retry',async(req,reply)=>{const s=scope(req),id=identifier(req.params.recoveryId),result=await service.retry(s,id,{cookie:req.headers.cookie,origin:req.headers.origin});if(!result||!Number.isInteger(result.status))throw new HttpError(502,'RECOVERY_RESPONSE_INVALID','Command result unavailable');return reply.code(result.status).send(result.body)});
}
module.exports={routes};
