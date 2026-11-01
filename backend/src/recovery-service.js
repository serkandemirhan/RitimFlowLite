'use strict';
// The executor is provided by the server, not by an HTTP client. It must invoke the
// existing authenticated business handler with the original idempotency key.
const {describe,storageKind}=require('./recovery-catalog');
const {HttpError}=require('./auth');
function createRecoveryService({store,execute}){
 if(!store||typeof execute!=='function')throw Error('Invalid recovery service configuration');
 return Object.freeze({
  async register(scope,{id,key,command}){const d=describe(command),kind=storageKind(command);if(!d||!kind)throw new HttpError(400,'INVALID_COMMAND','Invalid recovery command');return store.register(scope,{id,key,kind,body:command})},
  list:scope=>store.list(scope),
  get:(scope,id)=>store.get(scope,id),
  acknowledge:(scope,id)=>store.acknowledge(scope,id),
  async retry(scope,id,context){const row=await store.get(scope,id),descriptor=describe(row.body);if(storageKind(row.body)!==row.kind)throw new HttpError(409,'RECOVERY_INVALID','Recovery command mismatch');if(row.status==='rejected')throw new HttpError(409,'RECOVERY_REJECTED','Rejected command cannot be replayed');const result=await execute({scope,context,descriptor,key:row.key});if(!result||!Number.isInteger(result.status))return result;if(result.status>=400&&result.status<500&&![401,403,404,408,429].includes(result.status)&&!['IDEMPOTENCY_CONFLICT','COMMAND_PENDING','RECOVERY_REJECTED'].includes(result.body?.error?.code)){await store.rejectAfterVerifiedFailure(scope,id,row.key);return {...result,body:{...result.body,recoveryStatus:'rejected'}}}if(result.status<200||result.status>=300)return result;await store.resolveAfterVerifiedReplay(scope,id,row.key);return result}
 });
}
module.exports={createRecoveryService};
