/* Development API adapter: token and scope stay in memory; no localStorage fallback. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimApiAdapter=factory()})(globalThis,function(){
 'use strict';
 class ApiError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status}}
 function create({token,fetcher=globalThis.fetch,randomUUID=()=>globalThis.crypto.randomUUID(),timeoutMs=30000}){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new TypeError('Invalid timeout');
  if(!token||typeof token!=='string')throw new ApiError('UNAUTHENTICATED','Oturum gerekli',401);
  let scope=null;
  async function request(path,{method='GET',body,key}={}){
   const headers={authorization:`Bearer ${token}`,accept:'application/json'};
   if(body!==undefined){headers['content-type']='application/json';headers['idempotency-key']=key||randomUUID()}
   let response;try{response=await fetcher(`/api/v1${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(timeoutMs)})}catch(e){throw new ApiError('NETWORK_ERROR','Sunucuya ulaşılamadı; işlem durumu bilinmiyor. Aynı komut anahtarıyla tekrar deneyin.',0)}
   let json;try{json=await response.json()}catch(e){throw new ApiError('INVALID_RESPONSE','Sunucu yanıtı okunamadı.',response.status)}
   if(!response.ok)throw new ApiError(json?.error?.code||'API_ERROR',json?.error?.message||'Sunucu işlemi reddetti.',response.status);
   return json;
  }
  const rootPath=()=>{if(!scope)throw new ApiError('SCOPE_REQUIRED','Önce yetkili iş yeri seçin.',0);return `/sites/${encodeURIComponent(scope.tenantId)}/${encodeURIComponent(scope.siteId)}`};
  const jobPath=(order,job)=>rootPath()+`/orders/${encodeURIComponent(order)}/work-orders/${encodeURIComponent(job)}`;
  const orderPath=order=>rootPath()+`/orders/${encodeURIComponent(order)}`;
  const readPaths={assignment:(o,j)=>jobPath(o,j)+'/assignment-options',material:o=>orderPath(o)+'/fictional-material',downstream:o=>orderPath(o)+'/downstream-discovery',productionHistory:(o,j)=>jobPath(o,j)+'/production/history',qualityHistory:(o,j)=>jobPath(o,j)+'/quality/history',operationInputs:(o,j)=>jobPath(o,j)+'/operation-inputs'};
  const writePaths={operator:(o,j)=>jobPath(o,j)+'/assignment/operator',machine:(o,j)=>jobPath(o,j)+'/assignment/machine',handover:(o,j)=>jobPath(o,j)+'/assignment/handover',materialReceipt:o=>orderPath(o)+'/fictional-material-receipts',allocation:o=>orderPath(o)+'/fictional-material-allocations',physicalReceipt:o=>orderPath(o)+'/physical-receipts',downstreamPlan:o=>orderPath(o)+'/downstream-work-orders',reserve:o=>orderPath(o)+'/output-reservations',release:(o,id)=>orderPath(o)+`/output-reservations/${encodeURIComponent(id)}/releases`,dispatch:(o,id)=>orderPath(o)+`/output-reservations/${encodeURIComponent(id)}/dispatches`,receive:(o,id)=>orderPath(o)+`/operation-dispatches/${encodeURIComponent(id)}/receipts`};
  return Object.freeze({readOperation:(kind,order,id)=>{if(!Object.hasOwn(readPaths,kind))throw new ApiError('INVALID_COMMAND','Geçersiz sorgu',400);return request(readPaths[kind](order,id))},writeOperation:(kind,order,id,body,key)=>{if(!Object.hasOwn(writePaths,kind))throw new ApiError('INVALID_COMMAND','Geçersiz işlem',400);return request(writePaths[kind](order,id),{method:'POST',body,key})},assignedWorkOrders:(after=null)=>request(rootPath()+'/operator/work-orders?limit=100'+(after?'&after='+encodeURIComponent(after):'')),session:()=>request('/session'),selectScope:async(tenantId,siteId)=>{const p=`/sites/${encodeURIComponent(tenantId)}/${encodeURIComponent(siteId)}`;const x=await request(p+'/capabilities');scope={tenantId,siteId};return x},orders:()=>request(rootPath()+'/orders'),order:id=>request(rootPath()+`/orders/${encodeURIComponent(id)}`),workOrders:id=>request(rootPath()+`/orders/${encodeURIComponent(id)}/work-orders`),availability:(id,op)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/operations/${encodeURIComponent(op)}/availability`),createOrder:(body,key)=>request(rootPath()+'/orders',{method:'POST',body,key}),defineRoute:(id,body,key)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/route`,{method:'POST',body,key}),plan:(id,body,key)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/work-orders`,{method:'POST',body,key}),production:(order,job)=>request(jobPath(order,job)+'/production/balances'),quality:(order,job)=>request(jobPath(order,job)+'/quality'),productionCommand:(order,job,action,body,key)=>{if(!['start','pause','resume','complete','results'].includes(action))throw new ApiError('INVALID_COMMAND','Geçersiz üretim işlemi',400);return request(jobPath(order,job)+'/production/'+action,{method:'POST',body,key})},qualityDecision:(order,job,body,key)=>request(jobPath(order,job)+'/quality/decisions',{method:'POST',body,key})});
 }
 return {create,ApiError};
});
