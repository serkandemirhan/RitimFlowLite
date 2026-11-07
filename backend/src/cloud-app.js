'use strict';
const {createPool}=require('./db');
const {buildApp}=require('./app');
const {createSupabaseVerifier,makeSupabaseBff}=require('./supabase-auth');
function cloudConfig(env=process.env){
 const required=['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN','RECOVERY_ENCRYPTION_KEY','RECOVERY_KEY_VERSION'];
 for(const key of required)if(!env[key])throw Error('Missing '+key);
 if(env.RITIM_ISOLATED_DEVELOPMENT==='true')throw Error('Development mode is forbidden in cloud');
 for(const key of ['SUPABASE_URL','APP_ORIGIN']){const u=new URL(env[key]);if(u.protocol!=='https:'||u.origin!==env[key])throw Error('Invalid '+key)}
 if(!/^[A-Za-z0-9._-]{1,80}$/.test(env.RECOVERY_KEY_VERSION))throw Error('Invalid recovery key version');
 require('./recovery-crypto').createRecoveryCipher(env.RECOVERY_ENCRYPTION_KEY);
 const db=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(db.protocol)||['postgres','supabase_admin'].includes(db.username.split('.')[0]))throw Error('Use a restricted runtime database role');
 if(env.AUTH_INVITATIONS_ENABLED==='true'&&!env.SUPABASE_SECRET_KEY)throw Error('Missing SUPABASE_SECRET_KEY');
 return {invitationsEnabled:env.AUTH_INVITATIONS_ENABLED==='true',secretKey:env.SUPABASE_SECRET_KEY,recoveryEnabled:env.AUTH_RECOVERY_ENABLED==='true',databaseUrl:env.DATABASE_URL,ssl:'verify',url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,appOrigin:env.APP_ORIGIN,recovery:{key:env.RECOVERY_ENCRYPTION_KEY,keyVersion:env.RECOVERY_KEY_VERSION}};
}
// Record server failures without request bodies, cookies, tokens or database values.
const cloudLogger={level:'error',serializers:{err:error=>({type:error.name,code:error.code,frames:String(error.stack||'').split('\n').slice(1,7).map(x=>x.trim())})}};
function createCloudApp(env=process.env){const config=cloudConfig(env),pool=createPool({...config,poolMax:2,sslCa:require('node:fs').readFileSync(require('node:path').join(__dirname,'../security/supabase-ca.crt'),'utf8')}),verifier=createSupabaseVerifier(config),bff=makeSupabaseBff({...config,pool,verifier});const app=buildApp({pool,verifier,bff,recovery:config.recovery,workflowEnabled:true,logger:cloudLogger});app.addHook('onClose',()=>pool.end());return app}
module.exports={cloudConfig,createCloudApp};
