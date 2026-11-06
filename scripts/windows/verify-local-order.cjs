'use strict';
// Actual browser -> Keycloak PKCE -> BFF -> Fastify -> installed PostgreSQL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../node_modules/playwright');
const {Pool}=require('../../backend/node_modules/pg');
const {authorizeScope}=require('../../backend/src/authorization');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/local-start');
(async()=>{
 if(process.env.PGDATABASE!=='ritim_local_dev'||process.env.PGUSER!=='ritim_local_dev_runtime'||!process.env.RITIM_LOCAL_LOGIN_PASSWORD)throw Error('Restricted local verification configuration required');
 fs.mkdirSync(out,{recursive:true});
 let browser=await chromium.launch({headless:true});
 let pool,page;
 try{
  const context=await browser.newContext({viewport:null,locale:'tr-TR',timezoneId:'Europe/Istanbul'});
  page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),new URL(r.url()).pathname)});
  await page.goto('http://127.0.0.1:4178/?mode=api');
  await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
  await page.locator('#username').fill('manager');
  await page.locator('#password').fill(process.env.RITIM_LOCAL_LOGIN_PASSWORD);
  await page.locator('#kc-login').click();
  await page.getByRole('button',{name:'Devam',exact:true}).click();
  await page.getByRole('button',{name:'Yeni Sipariş',exact:true}).waitFor();
  const previous=await page.evaluate(async({tenant,site})=>{
   const r=await fetch(`/api/v1/sites/${tenant}/${site}/orders`);if(!r.ok)throw Error('Scoped order list unavailable');return r.json();
  },{tenant:process.env.RITIM_LOCAL_TENANT_ID,site:process.env.RITIM_LOCAL_SITE_ID});
  let created=previous.orders.filter(o=>o.customer==='Yerel PostgreSQL Test Müşterisi'&&o.partName==='TEST-PARÇA-001'&&o.orderedQuantity===10).sort((a,b)=>b.orderNumber.localeCompare(a.orderNumber))[0];
  if(!created){
   // Provision explicit fictional master fixtures for the current selection-only UI.
   await page.evaluate(async({tenant,site})=>{for(const [kind,name,code] of [['customers','Yerel PostgreSQL Test Müşterisi','LOCAL-PG-CUSTOMER'],['parts','TEST-PARÇA-001','TEST-PARÇA-001']]){const base=`/api/v1/sites/${tenant}/${site}/master-data/${kind}`,list=await fetch(base+'?q='+encodeURIComponent(code));if(!list.ok)throw Error('Master fixture lookup failed');if(!(await list.json()).items.some(x=>x.code===code)){const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({name,code})});if(!r.ok)throw Error('Master fixture creation failed')}}},{tenant:process.env.RITIM_LOCAL_TENANT_ID,site:process.env.RITIM_LOCAL_SITE_ID});
   await page.getByRole('button',{name:'Yeni Sipariş',exact:true}).click();
  await page.locator('[data-wiz=customer]').fill('LOCAL-PG-CUSTOMER');await page.getByRole('option').filter({hasText:'LOCAL-PG-CUSTOMER'}).click();
  await page.locator('[data-wiz=part]').fill('TEST-PARÇA-001');await page.getByRole('option').filter({hasText:'TEST-PARÇA-001'}).click();
  await page.locator('[data-wiz=qty]').fill('10');
  const due=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await page.locator('[data-wiz=due]').fill(due);
  await page.getByRole('button',{name:'Devam Et →',exact:true}).click();

  // The UI deliberately executes domain commands via encrypted server recovery.
  // POST /orders is internal to that retry, not a separate browser request.
  const creation=page.waitForResponse(r=>r.request().method()==='POST'&&/\/recovery\/[0-9a-f-]+\/retry$/.test(new URL(r.url()).pathname));
  await page.getByRole('button',{name:'Siparişi Kaydet',exact:true}).click();
  const response=await creation;assert.equal(response.status(),201,'Order must be committed through the actual domain API');
  created=await response.json();
  await page.getByRole('button',{name:'Siparişe Git',exact:true}).click();
  }else{
   console.log('Existing verification order found; no duplicate order will be created.');
   await page.locator('.order-card-v4').filter({hasText:created.orderNumber}).click();
  }
  const session=await page.evaluate(async()=>{const r=await fetch('/api/v1/session');if(!r.ok)throw Error('Verified session unavailable');return r.json()});
  pool=new Pool({connectionTimeoutMillis:5000});
  const client=await pool.connect();let row,tables,migrations,receiptStatus;
  try{
   await client.query('BEGIN');
   await authorizeScope(client,{identity:{verified:true,userId:session.identity.id},tenantId:process.env.RITIM_LOCAL_TENANT_ID,siteId:process.env.RITIM_LOCAL_SITE_ID,capability:'orders.read'});
   row=(await client.query('SELECT id,order_number,customer,part_name,ordered_qty::int quantity,due_date::text,status,created_at FROM orders WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[process.env.RITIM_LOCAL_TENANT_ID,process.env.RITIM_LOCAL_SITE_ID,created.id])).rows[0];
   tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows.map(x=>x.tablename);
   migrations=(await client.query('SELECT count(*)::int total FROM ritim_schema_versions()')).rows[0].total;
   receiptStatus=(await client.query("SELECT response_status FROM idempotency_records WHERE tenant_id=$1 AND site_id=$2 AND actor_id=$3 AND response_body->>'id'=$4 AND status='completed'",[process.env.RITIM_LOCAL_TENANT_ID,process.env.RITIM_LOCAL_SITE_ID,session.identity.id,created.id])).rows[0]?.response_status;
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();await pool.end();pool=null;}
  assert.equal(row?.quantity,10);assert.equal(row.customer,'Yerel PostgreSQL Test Müşterisi');assert.equal(row.part_name,'TEST-PARÇA-001');assert.equal(migrations,30);assert.equal(receiptStatus,201);assert(tables.includes('orders'));
  await page.reload();
  await page.getByRole('button',{name:'Devam',exact:true}).click();
  await page.getByText(row.order_number,{exact:false}).first().waitFor();
  await page.screenshot({path:path.join(out,'order-postgresql.png'),fullPage:true});
  const proof={verifiedAt:new Date().toISOString(),database:process.env.PGDATABASE,host:process.env.PGHOST,port:Number(process.env.PGPORT),schema:'ritim',tableCount:tables.length,tables,migrations,authentication:'Real local Keycloak authorization-code/PKCE + existing BFF',apiCreateStatus:receiptStatus,runtimeUser:process.env.PGUSER,sqlOrder:row,persistedAfterBrowserReload:true};
  fs.writeFileSync(path.join(out,'order-postgresql.json'),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({database:proof.database,tableCount:tables.length,migrations,orderNumber:row.order_number,orderId:row.id,customer:row.customer,part:row.part_name,quantity:row.quantity,persistedAfterBrowserReload:true},null,2));
  // Open the already verified record for the user after automation has finished.
  const state=await context.storageState(),url=page.url();
  await browser.close();
  browser=await chromium.launch({headless:false,args:['--start-maximized']});
  const visible=await browser.newContext({viewport:null,locale:'tr-TR',timezoneId:'Europe/Istanbul',storageState:state});
  page=await visible.newPage();
  await page.goto(url);
  await page.getByRole('button',{name:'Devam',exact:true}).click();
  await page.getByText(row.order_number,{exact:false}).first().waitFor();
  console.log('Verified application browser remains open for you. Close that window when finished.');
  await new Promise(resolve=>browser.once('disconnected',resolve));
 }catch(error){
  if(page&&!page.isClosed()){
   await page.screenshot({path:path.join(out,'verification-failed.png'),fullPage:true}).catch(()=>{});
   fs.writeFileSync(path.join(out,'verification-failed.txt'),await page.locator('body').innerText().catch(()=>''));
  }
  if(pool)await pool.end();await browser.close();throw error;
 }
})().catch(error=>{console.error('Local browser verification failed: '+error.message);process.exitCode=1});
