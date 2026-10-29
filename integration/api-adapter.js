/* Development API adapter: token and scope stay in memory; no localStorage fallback. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimApiAdapter=factory()})(globalThis,function(){
 'use strict';
 class ApiError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status}}
 function create({token,fetcher=globalThis.fetch,randomUUID=()=>globalThis.crypto.randomUUID()}){
  if(!token||typeof token!=='string')throw new ApiError('UNAUTHENTICATED','Oturum gerekli',401);
  let scope=null;
  async function request(path,{method='GET',body,key}={}){
   const headers={authorization:`Bearer ${token}`,accept:'application/json'};
   if(body!==undefined){headers['content-type']='application/json';headers['idempotency-key']=key||randomUUID()}
   let response;try{response=await fetcher(`/api/v1${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store'})}catch(e){throw new ApiError('NETWORK_ERROR','Sunucuya ulaşılamadı; işlem durumu bilinmiyor. Aynı komut anahtarıyla tekrar deneyin.',0)}
   let json;try{json=await response.json()}catch(e){throw new ApiError('INVALID_RESPONSE','Sunucu yanıtı okunamadı.',response.status)}
   if(!response.ok)throw new ApiError(json?.error?.code||'API_ERROR',json?.error?.message||'Sunucu işlemi reddetti.',response.status);
   return json;
  }
  const rootPath=()=>{if(!scope)throw new ApiError('SCOPE_REQUIRED','Önce yetkili iş yeri seçin.',0);return `/sites/${encodeURIComponent(scope.tenantId)}/${encodeURIComponent(scope.siteId)}`};
  return Object.freeze({session:()=>request('/session'),selectScope:async(tenantId,siteId)=>{const p=`/sites/${encodeURIComponent(tenantId)}/${encodeURIComponent(siteId)}`;const x=await request(p+'/capabilities');scope={tenantId,siteId};return x},orders:()=>request(rootPath()+'/orders'),order:id=>request(rootPath()+`/orders/${encodeURIComponent(id)}`),workOrders:id=>request(rootPath()+`/orders/${encodeURIComponent(id)}/work-orders`),availability:(id,op)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/operations/${encodeURIComponent(op)}/availability`),createOrder:(body,key)=>request(rootPath()+'/orders',{method:'POST',body,key}),defineRoute:(id,body,key)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/route`,{method:'POST',body,key}),plan:(id,body,key)=>request(rootPath()+`/orders/${encodeURIComponent(id)}/work-orders`,{method:'POST',body,key})});
 }
 return {create,ApiError};
});
