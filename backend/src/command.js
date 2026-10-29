'use strict';
const crypto=require('node:crypto');
const {inTransaction}=require('./db');
const {HttpError}=require('./auth');
const {authorizeScope}=require('./authorization');
function canonical(value) {
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value && typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype)
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 throw new HttpError(400,'INVALID_COMMAND','Command payload must be JSON');
}
// Future routes must use a verified identity adapter and this boundary; no routes are enabled yet.
async function executeCommand(pool,{identity,tenantId,siteId,key,kind,payload,capability},handler) {
 if(!identity || identity.verified!==true || !identity.userId) throw new HttpError(401,'UNAUTHENTICATED','Authentication required');
 if(!tenantId||!siteId||typeof key!=='string'||!key.trim()||key.length>200||typeof kind!=='string'||!kind.trim()||typeof capability!=='string'||!capability||typeof handler!=='function')
  throw new HttpError(400,'INVALID_COMMAND','Invalid command context');
 const hash=crypto.createHash('sha256').update(canonical({kind,payload})).digest('hex');
 return inTransaction(pool,async client=>{
  const scope=await authorizeScope(client,{identity,tenantId,siteId,capability});
  const inserted=await client.query(`INSERT INTO idempotency_records(tenant_id,site_id,actor_id,key,request_hash,status)
    VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING RETURNING key`,[tenantId,siteId,identity.userId,key,hash]);
  if(!inserted.rowCount){
   const r=await client.query('SELECT request_hash,status,response_status,response_body FROM idempotency_records WHERE tenant_id=$1 AND site_id=$2 AND actor_id=$3 AND key=$4 FOR UPDATE',[tenantId,siteId,identity.userId,key]);
   if(!r.rowCount || r.rows[0].request_hash!==hash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','Idempotency key has different content');
   if(r.rows[0].status!=='completed')throw new HttpError(409,'COMMAND_PENDING','Command has not completed');
   return {status:r.rows[0].response_status,body:r.rows[0].response_body,duplicate:true};
  }
  const result=await handler(client,scope);
  if(!result || !Number.isInteger(result.status)||result.status<200||result.status>299)throw Error('Command handler must return a successful HTTP response');
  const body=JSON.parse(canonical(result.body));
  await client.query(`UPDATE idempotency_records SET status='completed',response_status=$5,response_body=$6::jsonb WHERE tenant_id=$1 AND site_id=$2 AND actor_id=$3 AND key=$4`,[tenantId,siteId,identity.userId,key,result.status,JSON.stringify(body)]);
  return {status:result.status,body,duplicate:false};
 });
}
module.exports={executeCommand,canonical};
