'use strict';
const {Pool}=require('../../backend/node_modules/pg');
(async()=>{
 if(process.env.PGDATABASE!=='ritim_local_dev'||process.env.PGUSER!=='ritim_local_dev_runtime')throw Error('Dedicated local runtime configuration required');
 const pool=new Pool({connectionTimeoutMillis:5000});
 try{
  const database=(await pool.query('SELECT current_database() AS database,current_user AS runtime,current_schema() AS schema')).rows[0];
  const tables=(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename')).rows.map(x=>x.tablename);
  const versions=(await pool.query('SELECT version FROM ritim_schema_versions() ORDER BY version')).rows.map(x=>x.version);
  console.log(JSON.stringify({...database,tableCount:tables.length,migrationCount:versions.length,keyTables:tables.filter(x=>['orders','work_orders','operations','audit_events','inventory_movements','idempotency_records'].includes(x))},null,2));
 }finally{await pool.end();}
})().catch(()=>{console.error('Local database inspection failed. No credentials are printed.');process.exitCode=1});
