'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('../../backend/node_modules/pg');
(async()=>{
 if(process.env.PGDATABASE!=='ritim_local_dev'||!['127.0.0.1','localhost','::1'].includes(process.env.PGHOST))throw Error('Explicit local development database required');
 const tenant=process.env.RITIM_LOCAL_TENANT_ID,site=process.env.RITIM_LOCAL_SITE_ID,issuer=process.env.OIDC_ISSUER;
 if(!tenant||!site||issuer!=='https://localhost:44739/realms/ritim-dev')throw Error('Local identity scope missing');
 const users=JSON.parse(fs.readFileSync(path.join(process.env.OIDC_FIXTURE_DIR,'users.json'),'utf8'));
 const pool=new Pool({connectionTimeoutMillis:5000}),client=await pool.connect();
 try{
  const who=(await client.query('SELECT current_user name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(who.rolsuper||who.rolbypassrls||who.name!=='ritim_local_dev_migration')throw Error('Use the dedicated migration identity for fictional identity provisioning');
  await client.query('BEGIN');
  await client.query("INSERT INTO tenants(id,name) VALUES($1,'Yerel Doğrulama Atölyesi') ON CONFLICT DO NOTHING",[tenant]);
  await client.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'LOCAL','Yerel Tesis') ON CONFLICT DO NOTHING",[tenant,site]);
  for(const user of users.filter(x=>x.username!=='tenant-b')){
   await client.query('INSERT INTO users(id,issuer,subject,display_name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[user.id,issuer,user.id,user.username==='manager'?'Yerel Yönetici':user.username]);
   const role=user.username==='manager'?'manager':user.username==='quality'?'quality':'operator';
   await client.query('INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tenant,site,user.id,role]);
  }
  await client.query('COMMIT');
  console.log('Fictional local tenant/site and four verified-issuer memberships provisioned; no customer orders or production data were changed.');
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();await pool.end();}
})().catch(error=>{console.error('Local identity provisioning failed'+(error.code?' ('+error.code+')':'')+'. Existing data is preserved.');process.exitCode=1});
