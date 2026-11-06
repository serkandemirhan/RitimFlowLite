'use strict';
const {Pool} = require('pg');
function createPool(config) {
  const options = {connectionTimeoutMillis:5000,...(config.poolMax?{max:config.poolMax,idleTimeoutMillis:10000,allowExitOnIdle:true}:{})};
  if (config.databaseUrl) options.connectionString = config.databaseUrl;
  if (config.ssl === 'verify') options.ssl = {rejectUnauthorized:true,...(config.sslCa?{ca:config.sslCa}:{})};
  return new Pool(options); // PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE supplied by environment if no URL
}
async function inTransaction(pool, fn) {
  const client=await pool.connect();
  try {await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}
  catch (error) {try {await client.query('ROLLBACK');} catch (_) {} throw error;}
  finally {client.release();}
}
module.exports={createPool,inTransaction};
