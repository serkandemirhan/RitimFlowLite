'use strict';
const {loadConfig}=require('./config');
const {createPool}=require('./db');
const {buildApp}=require('./app');
const {makeOidcVerifier}=require('./identity');
const {makeBff}=require('./oidc-bff');
async function main(){
  const config=loadConfig(),pool=createPool(config),verifier=config.oidc?makeOidcVerifier({...config.oidc,allowJwtBearerTyp:!!config.bff}):null,bff=config.bff?makeBff({...config.bff,issuer:config.oidc.issuer,verifyAccess:t=>verifier.verify(t)}):null,app=buildApp({pool,isolatedDevelopment:config.isolatedDevelopment,verifier,bff,recovery:config.recovery,logger:{level:config.logLevel}});
  app.addHook('onClose',async()=>pool.end());
  try {await app.listen({port:config.port,host:config.host});}
  catch (e) {app.log.error({err:e},'startup failed');await app.close();process.exitCode=1;return;}
  let stopping=false;
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{if(stopping)return;stopping=true;app.close().catch(()=>{process.exitCode=1;});});
}
main().catch(()=>{console.error('Backend startup failed');process.exitCode=1;});
