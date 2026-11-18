'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{buildApp}=require('../src/app');
const db=process.env.TEST_DATABASE_URL;
if(!db)throw Error('TEST_DATABASE_URL must point to disposable privileged PostgreSQL');
test('customer portal uses explicit revocable grants, not internal site membership',async t=>{
 const suffix=crypto.randomBytes(6).toString('hex'),schema='portal_'+suffix,owner='portal_owner_'+suffix,runtime='portal_app_'+suffix;
 const admin=new Pool({connectionString:db}),{roleUrl,createRole}=require('../test-support/roles.cjs').roleConnections(db),id=()=>crypto.randomUUID();
 const ta=id(),tb=id(),sa=id(),sb=id(),ua=id(),ub=id(),manager=id(),a=id(),b=id(),ca=id(),cb=id(),cc=id(),oa=id(),ob=id(),oc=id(),po=id(),op=id(),job=id(),doc=id(),hiddenDoc=id();
 let migrator,pool,seed,app,share;
 try{
  await createRole(admin,owner);await createRole(admin,runtime);await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}"`);
  migrator=new Pool({connectionString:roleUrl(owner),options:`-c search_path=${schema}`});await migrate(migrator);
  const client=await migrator.connect();try{await client.query('BEGIN');await provisionRuntime(client,schema,runtime,{isolatedDevelopment:true});await client.query('COMMIT')}finally{client.release()}
  seed=new Pool({connectionString:db,options:`-c search_path=${schema}`});
  await seed.query("INSERT INTO tenants(id,name) VALUES($1,'Tenant A'),($2,'Tenant B')",[ta,tb]);
  await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'A','A'),($3,$4,'B','B')",[ta,sa,tb,sb]);
  for(const [u,subject] of [[ua,'admin-a'],[ub,'admin-b'],[manager,'manager'],[a,'customer-a'],[b,'customer-b']])await seed.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,'https://portal.test',$2,$2)",[u,subject]);
  await seed.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'tenant_admin'),($3,$4,'tenant_admin')",[ta,ua,tb,ub]);
  await seed.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'manager')",[ta,sa,manager]);
  for(const [tenant,site,customer,name] of [[ta,sa,ca,'Customer A'],[ta,sa,cb,'Customer B'],[tb,sb,cc,'Customer C']])await seed.query('INSERT INTO master_customers(tenant_id,site_id,id,name) VALUES($1,$2,$3,$4)',[tenant,site,customer,name]);
  for(const [tenant,site,order,customer,name] of [[ta,sa,oa,ca,'ORDER-A'],[ta,sa,ob,cb,'ORDER-B'],[tb,sb,oc,cc,'ORDER-C']])await seed.query("INSERT INTO orders(tenant_id,site_id,id,customer_id,order_number,customer,part_name,part_number,ordered_qty,due_date,notes) VALUES($1,$2,$3,$4,$5,$5,'Test part','PART',10,'2026-12-31','PRIVATE INTERNAL NOTE')",[tenant,site,order,customer,name]);
  await seed.query("INSERT INTO production_orders(tenant_id,site_id,id,order_id,number,quantity,planning_state) VALUES($1,$2,$3,$4,'UE-A',10,'planned')",[ta,sa,po,oa]);
  await seed.query("INSERT INTO operations(tenant_id,site_id,id,order_id,production_order_id,sequence,name,kind) VALUES($1,$2,$3,$4,$5,0,'Turning','internal')",[ta,sa,op,oa,po]);
  await seed.query("INSERT INTO work_orders(tenant_id,site_id,id,order_id,operation_id,production_order_id,work_order_number,planned_qty,status) VALUES($1,$2,$3,$4,$5,$6,'IE-A',10,'running')",[ta,sa,job,oa,op,po]);
  for(const [document,context] of [[doc,'quality'],[hiddenDoc,'supplier_dispatch']])await seed.query("INSERT INTO work_documents(tenant_id,site_id,id,work_order_id,context,filename,mime,content,sha256,actor_id) VALUES($1,$2,$3,$4,$5,'report.pdf','application/pdf',$6,$7,$8)",[ta,sa,document,job,context,Buffer.from('%PDF-1.4 portal test'),'0'.repeat(64),ua]);
  const lot=id(),event=id(),ledger=id(),decision=id();
  await seed.query("INSERT INTO lots(tenant_id,site_id,id,order_id,lot_code,kind) VALUES($1,$2,$3,$4,'LOT-A','material')",[ta,sa,lot,oa]);
  await seed.query("INSERT INTO production_events(tenant_id,site_id,id,work_order_id,kind,quantity_pieces,actor_id) VALUES($1,$2,$3,$4,'pending',4,$5)",[ta,sa,event,job,ua]);
  await seed.query("INSERT INTO production_ledger(tenant_id,site_id,order_id,id,work_order_id,lot_id,production_event_id,kind,event_kind,quantity_pieces,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,'pending','pending',4,$8)",[ta,sa,oa,ledger,job,lot,event,ua]);
  await seed.query("INSERT INTO output_dispositions(tenant_id,site_id,order_id,id,output_ledger_id,work_order_id,lot_id,production_event_id,output_kind,outcome,quantity_pieces,evidence,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending','approved',3,'PRIVATE INSPECTION NOTE',$9)",[ta,sa,oa,decision,ledger,job,lot,event,ua]);
  await seed.query('INSERT INTO quality_document_links(tenant_id,site_id,decision_id,document_id) VALUES($1,$2,$3,$4)',[ta,sa,decision,doc]);
  pool=new Pool({connectionString:roleUrl(runtime),options:`-c search_path=${schema}`,max:5});
  app=buildApp({pool,workflowEnabled:true,verifier:{verify:async token=>({issuer:'https://portal.test',subject:token.split('.')[0]})}});
  const base=`/api/v1/sites/${ta}/${sa}/customer-portal/shares`,portal='/api/v1/customer-portal/orders';
  const call=(method,url,payload,subject='admin-a')=>app.inject({method,url,headers:{authorization:`Bearer ${subject}.test.token`},...(payload===undefined?{}:{payload})});
  const save=async(extra={})=>{const r=await call('PUT',base,{customerId:ca,userId:a,orderId:oa,includeQuality:false,includeDocuments:false,...extra});assert.equal(r.statusCode,200,r.body);return r.json();};
  await t.test('anonymous, non-admin, mismatched customer and other-tenant grants fail closed',async()=>{
   assert.equal((await app.inject(portal)).statusCode,401);
   assert.equal((await call('GET',base,undefined,'manager')).statusCode,403);
   assert.equal((await call('GET',base,undefined,'admin-b')).statusCode,403);
   assert.equal((await call('PUT',base,{customerId:cb,userId:a,orderId:oa,includeQuality:false,includeDocuments:false})).statusCode,404);
   assert.equal((await call('PUT',base,{customerId:cc,userId:a,orderId:oc,includeQuality:false,includeDocuments:false})).statusCode,404);
   assert.deepEqual((await call('GET',portal,undefined,'customer-a')).json().orders,[]);
  });
  await t.test('shared order list and safe hierarchy are readable without an internal membership',async()=>{
   const created=await save();share=created.id||created.share?.id;assert.ok(share,JSON.stringify(created));
   const r=await call('GET',portal,undefined,'customer-a');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().orders.length,1);assert.equal(r.json().orders[0].shareId,share);
   const detail=await call('GET',portal+'/'+share,undefined,'customer-a');assert.equal(detail.statusCode,200,detail.body);const order=detail.json().order;
   assert.equal(order.id,oa);assert.equal(order.orderNumber,'ORDER-A');assert.equal(order.items.length,1);assert.equal(order.productionOrders[0].id,po);assert.equal(order.workOrders[0].id,job);assert.equal(order.workOrders[0].status,'running');assert.ok(detail.json().updatedAt);
   assert(!detail.body.includes('PRIVATE INTERNAL NOTE'));assert(!detail.body.includes('ORDER-B'));assert(!detail.body.includes('ORDER-C'));assert.deepEqual(order.documents,[]);
   assert.equal((await seed.query('SELECT count(*)::int n FROM site_memberships WHERE user_id=$1',[a])).rows[0].n,0);
   assert.equal((await call('GET',`/api/v1/sites/${ta}/${sa}/orders`,undefined,'customer-a')).statusCode,403);
   assert.equal((await call('GET',base,undefined,'customer-a')).statusCode,403);
  });
  await t.test('other customers cannot read detail, documents, events or mutate sharing',async()=>{
   assert.deepEqual((await call('GET',portal,undefined,'customer-b')).json().orders,[]);
   for(const path of [portal+'/'+share,portal+'/'+share+'/documents/'+doc,portal+'/'+share+'/events'])assert.equal((await call('GET',path,undefined,'customer-b')).statusCode,404,path);
   assert.equal((await call('DELETE',base+'/'+share,undefined,'customer-a')).statusCode,403);
   assert.equal((await call('GET',portal+'/'+id(),undefined,'customer-a')).statusCode,404);
   assert.equal((await call('POST',portal+'/'+share,{},'customer-a')).statusCode,404);
  });
  await t.test('quality and documents are explicit opt-ins and document context is enforced',async()=>{
   assert.equal((await call('GET',portal+'/'+share+'/documents/'+doc,undefined,'customer-a')).statusCode,404);
   await save({includeQuality:true,includeDocuments:true});
   const detail=await call('GET',portal+'/'+share,undefined,'customer-a');assert.equal(detail.statusCode,200,detail.body);
   assert.equal(detail.json().order.quality[0].outcome,'approved');assert.equal(detail.json().order.qualitySummary[0].approved,3);assert.equal(detail.json().order.qualitySummary[0].pending,1);
   assert(!detail.body.includes('PRIVATE INSPECTION NOTE'));assert.deepEqual(detail.json().order.documents.map(d=>d.id),[doc]);
   const downloaded=await call('GET',portal+'/'+share+'/documents/'+doc,undefined,'customer-a');assert.equal(downloaded.statusCode,200,downloaded.body);assert.equal(Buffer.from(downloaded.json().contentBase64,'base64').toString(),'%PDF-1.4 portal test');
   assert.equal((await call('GET',portal+'/'+share+'/documents/'+hiddenDoc,undefined,'customer-a')).statusCode,404);
   assert.equal((await call('GET',portal+'/'+share+'/documents/'+id(),undefined,'customer-a')).statusCode,404);
   await save({includeQuality:false,includeDocuments:false});
   assert.equal((await call('GET',portal+'/'+share+'/documents/'+doc,undefined,'customer-a')).statusCode,404);
  });
  await t.test('order reassignment and disabled users immediately invalidate access',async()=>{
   await seed.query('UPDATE orders SET customer_id=$1 WHERE id=$2',[cb,oa]);
   assert.equal((await call('GET',portal+'/'+share,undefined,'customer-a')).statusCode,404);
   assert.deepEqual((await call('GET',portal,undefined,'customer-a')).json().orders,[]);
   await seed.query('UPDATE orders SET customer_id=$1 WHERE id=$2',[ca,oa]);
   await seed.query('UPDATE users SET disabled_at=now() WHERE id=$1',[a]);assert.equal((await call('GET',portal+'/'+share,undefined,'customer-a')).statusCode,401);await seed.query('UPDATE users SET disabled_at=NULL WHERE id=$1',[a]);
  });
  await t.test('SSE pushes snapshots, refreshes changes and closes on revoked access',async()=>{
   const address=await app.listen({host:'127.0.0.1',port:0}),controller=new AbortController();
   const response=await fetch(address+portal+'/'+share+'/events',{headers:{authorization:'Bearer customer-a.test.token'},signal:controller.signal});
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   async function until(text){const deadline=Date.now()+8000;while(!buffer.includes(text)){const next=await Promise.race([reader.read(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('SSE timeout: '+text)),8500);timer.unref();})]);assert(!next.done,'SSE closed before '+text);buffer+=decoder.decode(next.value);assert(Date.now()<deadline,'SSE timeout');}const result=buffer;buffer='';return result;}
   try{
    const first=await until('event: snapshot');assert(first.includes('ORDER-A'));assert(!first.includes('ORDER-B'));
    await seed.query("UPDATE work_orders SET status='complete' WHERE id=$1",[job]);const changed=await until('event: snapshot');assert(changed.includes('completed'));
    await seed.query('UPDATE customer_portal_shares SET revoked_at=now() WHERE id=$1',[share]);await until('event: revoked');
    const ended=await reader.read();assert.equal(ended.done,true);
    const reconnect=await fetch(address+portal+'/'+share+'/events',{headers:{authorization:'Bearer customer-a.test.token'}});assert.equal(reconnect.status,404);
   }finally{controller.abort();await seed.query('UPDATE customer_portal_shares SET revoked_at=NULL WHERE id=$1',[share]);}
  });
  await t.test('revocation is audited and takes effect for detail, list, documents and events',async()=>{
   const r=await call('DELETE',base+'/'+share);assert.equal(r.statusCode,200,r.body);
   assert.deepEqual((await call('GET',portal,undefined,'customer-a')).json().orders,[]);
   for(const path of [portal+'/'+share,portal+'/'+share+'/documents/'+doc,portal+'/'+share+'/events'])assert.equal((await call('GET',path,undefined,'customer-a')).statusCode,404,path);
   assert.equal((await seed.query("SELECT count(*)::int n FROM audit_events WHERE event_type='customer_portal.revoke' AND entity_id=$1",[share])).rows[0].n,1);
  });
  await t.test('stale grants are filtered before the 500-order cap and truncation is accurate',async()=>{
   const rows=Array.from({length:500},(_,i)=>({id:id(),shareId:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),number:'STALE-'+i}));
   await seed.query(`INSERT INTO orders(tenant_id,site_id,id,customer_id,order_number,customer,part_name,part_number,ordered_qty)
    SELECT $1,$2,x.id,$3,x.number,'Reassigned customer','Test part','PART',1
    FROM jsonb_to_recordset($4::jsonb) x(id uuid,number text)`,[ta,sa,cb,JSON.stringify(rows)]);
   await seed.query(`INSERT INTO customer_portal_shares(id,tenant_id,site_id,customer_id,order_id,user_id,created_by,created_at)
    SELECT x."shareId",$1,$2,$3,x.id,$4,$5,now()-interval '1 day'
    FROM jsonb_to_recordset($6::jsonb) x(id uuid,"shareId" uuid)`,[ta,sa,ca,a,ua,JSON.stringify(rows)]);
   await save();
   const visible=await call('GET',portal,undefined,'customer-a');assert.equal(visible.statusCode,200,visible.body);
   assert.deepEqual(visible.json().orders.map(o=>o.id),[oa]);assert.equal(visible.json().truncated,false);
   assert.equal((await call('GET',portal+'/'+rows[0].shareId,undefined,'customer-a')).statusCode,404);
   await seed.query('UPDATE orders SET customer_id=$1 WHERE tenant_id=$2 AND site_id=$3 AND id=ANY($4::uuid[])',[ca,ta,sa,rows.map(x=>x.id)]);
   const capped=await call('GET',portal,undefined,'customer-a');assert.equal(capped.statusCode,200,capped.body);assert.equal(capped.json().orders.length,500);assert.equal(capped.json().truncated,true);
   assert.equal(new Set(capped.json().orders.map(o=>o.id)).size,500);
   await seed.query('UPDATE customer_portal_shares SET revoked_at=now() WHERE id=$1',[rows[0].shareId]);
   const exact=await call('GET',portal,undefined,'customer-a');assert.equal(exact.json().orders.length,500);assert.equal(exact.json().truncated,false);assert(exact.json().orders.some(o=>o.id===oa));
  });
  await t.test('runtime cannot enumerate or edit private shares directly and pooled scope is cleared',async()=>{
   await assert.rejects(pool.query('SELECT * FROM customer_portal_shares'),{code:'42501'});
   await assert.rejects(pool.query('UPDATE customer_portal_shares SET revoked_at=NULL'),{code:'42501'});
   assert.equal((await pool.query('SELECT * FROM orders')).rowCount,0);
  });
 }finally{
  if(app)await app.close();if(pool)await pool.end();if(seed)await seed.end();if(migrator)await migrator.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.query(`DROP ROLE IF EXISTS "${runtime}"`);await admin.query(`DROP ROLE IF EXISTS "${owner}"`);await admin.end();
 }
});
