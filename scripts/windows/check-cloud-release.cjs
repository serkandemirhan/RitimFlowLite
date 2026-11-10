'use strict';
// Read-only release compatibility checks. Never prints credentials.
const fs=require('node:fs'),path=require('node:path');
const {createPool}=require('../../backend/src/db');
async function main(){
 const env=Object.fromEntries(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/ritimflow-test.env'),'utf8').trim().split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
 const pool=createPool({databaseUrl:env.DATABASE_URL,ssl:'verify',sslCa:fs.readFileSync(path.join(__dirname,'../../backend/security/supabase-ca.crt'),'utf8')});
 try{const r=await pool.query('SELECT version FROM ritim.ritim_schema_versions() ORDER BY version');console.log('Cloud migrations:',r.rows.map(x=>x.version).join(','));}finally{await pool.end();}
 for(const route of ['/health/live','/health/ready','/api/v1/session']){const r=await fetch(env.APP_ORIGIN+route);console.log(route,r.status);}
}
main().catch(e=>{console.error('Cloud check failed:',e.code||e.name);process.exitCode=1;});
