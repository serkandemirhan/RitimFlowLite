'use strict';
function loadConfig(env = process.env) {
  const port = Number(env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const ssl = env.DB_SSL || 'disable';
  if (!['disable','verify'].includes(ssl)) throw new Error('DB_SSL must be disable or verify');
  const databaseUrl = env.DATABASE_URL || undefined;
  if (databaseUrl) {
    let parsed;
    try { parsed = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if(env.RITIM_ISOLATED_DEVELOPMENT && !['true','false'].includes(env.RITIM_ISOLATED_DEVELOPMENT))throw new Error('Invalid isolated development flag');
  if(env.RITIM_ISOLATED_DEVELOPMENT==='true' && !['test','development'].includes(env.NODE_ENV))throw new Error('Isolated development requires NODE_ENV test or development');
  const oidc=[env.OIDC_ISSUER,env.OIDC_AUDIENCE,env.OIDC_JWKS_URL];
  if(oidc.some(Boolean)&&!oidc.every(Boolean))throw new Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL must be configured together');
  const bffValues=[env.OIDC_BFF_CLIENT_ID,env.OIDC_BFF_REDIRECT_URI,env.OIDC_BFF_APP_ORIGIN];
  if(bffValues.some(Boolean)&&(!bffValues.every(Boolean)||!oidc.every(Boolean)||env.OIDC_BFF_CLIENT_ID===env.OIDC_AUDIENCE))throw new Error('Complete BFF configuration and distinct API audience required');
  const bff=bffValues.every(Boolean)?{clientId:bffValues[0],redirectUri:bffValues[1],appOrigin:bffValues[2]}:null;
  const recoveryValues=[env.RECOVERY_ENCRYPTION_KEY,env.RECOVERY_KEY_VERSION];
  if(recoveryValues.some(Boolean)&&(!recoveryValues.every(Boolean)||!bff||env.RITIM_ISOLATED_DEVELOPMENT!=='true'))throw new Error('Recovery requires a key, key version, BFF and isolated development mode');
  if(recoveryValues.every(Boolean)){require('./recovery-crypto').createRecoveryCipher(recoveryValues[0]);if(!/^[A-Za-z0-9._-]{1,80}$/.test(recoveryValues[1]))throw new Error('Invalid recovery key version')}
  const recovery=recoveryValues.every(Boolean)?{key:recoveryValues[0],keyVersion:recoveryValues[1]}:null;
  return Object.freeze({host:env.HOST || '127.0.0.1',port,logLevel:env.LOG_LEVEL || 'info',databaseUrl,ssl,isolatedDevelopment:env.RITIM_ISOLATED_DEVELOPMENT==='true',bff,recovery,oidc:oidc.every(Boolean)?{issuer:oidc[0],audience:oidc[1],jwksUrl:oidc[2]}:null});
}
module.exports = {loadConfig};
