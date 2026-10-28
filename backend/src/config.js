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
  const oidc=[env.OIDC_ISSUER,env.OIDC_AUDIENCE,env.OIDC_JWKS_URL];
  if(oidc.some(Boolean)&&!oidc.every(Boolean))throw new Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL must be configured together');
  return Object.freeze({host:env.HOST || '127.0.0.1',port,logLevel:env.LOG_LEVEL || 'info',databaseUrl,ssl,oidc:oidc.every(Boolean)?{issuer:oidc[0],audience:oidc[1],jwksUrl:oidc[2]}:null});
}
module.exports = {loadConfig};
