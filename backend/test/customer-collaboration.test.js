'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{buildApp}=require('../src/app');
const db=process.env.TEST_DATABASE_URL,id=()=>crypto.randomUUID();
test('portal conversations, permissions, attachments and approved revisions are tenant isolated',{skip:!db},async t=>{
 const suffix=crypto.randomBytes(6).toString('hex'),schema='collab_'+suffix,owner='co_'+suffix,runtime='cr_'+suffix;
 const admin=new Pool({connectionString:db}),roles=require('../test-support/roles.cjs').roleConnections(db);let migrator,pool,seed,app;
 const ta=id(),tb=id(),sa=id(),sb=id(),ua=id(),ub=id(),customer=id(),other=id(),ca=id(),cb=id(),order=id(),orderB=id();
 try{
  await roles.createRole(admin,owner);await roles.createRole(admin,runtime);await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${owner}"`);
  migrator=new Pool({connectionString:roles.roleUrl(owner),options:'-c search_path='+schema});await migrate(migrator);
  const c=await migrator.connect();try{await c.query('BEGIN');await provisionRuntime(c,schema,runtime,{isolatedDevelopment:true});await c.query('COMMIT');}finally{c.release();}
  seed=new Pool({connectionString:db,options:'-c search_path='+schema});
  await seed.query("INSERT INTO tenants(id,name) VALUES($1,'A'),($2,'B')",[ta,tb]);await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'A','A'),($3,$4,'B','B')",[ta,sa,tb,sb]);
  for(const [u,sub]of [[ua,'admin-a'],[ub,'admin-b'],[customer,'customer'],[other,'other']])await seed.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,'https://collab.test',$2,$2)",[u,sub]);
  await seed.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'tenant_admin'),($3,$4,'tenant_admin')",[ta,ua,tb,ub]);
  for(const [tenant,site,cid,oid]of [[ta,sa,ca,order],[tb,sb,cb,orderB]]){await seed.query("INSERT INTO master_customers(tenant_id,site_id,id,name) VALUES($1,$2,$3,'Customer')",[tenant,site,cid]);await seed.query("INSERT INTO orders(tenant_id,site_id,id,customer_id,order_number,customer,part_name,ordered_qty,due_date) VALUES($1,$2,$3,$4,'TEST','Customer','Part',100,'2026-12-01')",[tenant,site,oid,cid]);}
  pool=new Pool({connectionString:roles.roleUrl(runtime),options:'-c search_path='+schema});app=buildApp({pool,workflowEnabled:true,verifier:{verify:async token=>({issuer:'https://collab.test',subject:token.split('.')[0]})}});
  const provisioned=[],passwords=[];app.decorate('portalProviders',{userProvider:async p=>provisioned.push(p),passwordProvider:async p=>passwords.push(p)});
  const api=(method,url,payload,subject='admin-a')=>app.inject({method,url,headers:{authorization:'Bearer '+subject+'.test.token'},...(payload===undefined?{}:{payload})});
  const manager=`/api/v1/sites/${ta}/${sa}/customer-portal`,perms={production:false,workOrders:false,drawings:true,videos:false,requests:true,download:true};
  let share,requestId,messageId;
  const put=async extra=>{const r=await api('PUT',manager+'/shares',{customerId:ca,userId:customer,orderId:order,includeQuality:false,includeDocuments:false,permissions:perms,...extra});assert.equal(r.statusCode,200,r.body);share=r.json().share.id;return r;};
  await put();const external=()=>'/api/v1/customer-portal/orders/'+share+'/collaboration',internal=manager+'/collaboration';
  await t.test('new permissions are opt-in and legacy entry points are inaccessible',async()=>{
   await require('../src/db').inTransaction(pool,async c=>{await c.query('SELECT ritim_open_scope($1,$2,$3)',[ua,ta,sa]);await c.query("SELECT ritim_portal_manage('list','{}'::jsonb)");});
   const managed=await api('GET',manager+'/shares');assert.equal(managed.statusCode,200,managed.body);
   const r=await api('GET','/api/v1/customer-portal/orders/'+share,undefined,'customer');assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().order.productionOrders,[]);assert.deepEqual(r.json().order.workOrders,[]);assert.equal(r.json().order.permissions.requests,true);
   await assert.rejects(pool.query('SELECT ritim_portal_access_v1($1,$2)',[customer,share]),/permission denied/);
   assert.equal((await api('GET',internal+'/accounts',undefined,'customer')).statusCode,403);
  });
  await t.test('customer request enters manager inbox and persists multiple files',async()=>{
   requestId=id();messageId=id();let r=await api('POST',external()+'/requests',{id:requestId,messageId,title:'Quantity and due date',kind:'change',body:'Please change this order',proposed:{quantity:120,dueDate:'2026-12-15'}},'customer');assert.equal(r.statusCode,200,r.body);
   for(let n=0;n<2;n++){r=await api('POST',external()+'/requests/'+requestId+'/files',{id:id(),messageId,filename:'drawing'+n+'.pdf',mime:'application/pdf',contentBase64:Buffer.from('%PDF-1.4 fixture '+n).toString('base64')},'customer');assert.equal(r.statusCode,200,r.body);}
   r=await api('GET',internal+'/requests');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().requests[0].unread,true);
   r=await api('GET',external()+'/requests/'+requestId,undefined,'customer');assert.equal(r.json().files.length,2);assert.equal(r.json().request.version,3);
   const clip=id();r=await api('POST',external()+'/requests/'+requestId+'/files',{id:clip,messageId,filename:'private-clip.mp4',mime:'video/mp4',contentBase64:Buffer.from('0000ftypisom').toString('base64')},'customer');assert.equal(r.statusCode,200,r.body);
   assert.equal((await api('GET',external()+'/files/'+clip,undefined,'customer')).statusCode,404);
   r=await api('GET',external()+'/requests/'+requestId,undefined,'customer');assert.equal(r.json().files.length,2);
   const duplicate=await api('POST',external()+'/requests',{id:requestId,messageId,title:'Duplicate',kind:'question',body:'Retry'},'customer');assert.equal(duplicate.statusCode,409);
  });
  await t.test('internal notes and their files never appear to customers',async()=>{
   const mid=id();let r=await api('POST',internal+'/requests/'+requestId+'/messages',{id:mid,version:4,internal:true,body:'PRIVATE STAFF NOTE'});assert.equal(r.statusCode,200,r.body);
   const fid=id();r=await api('POST',internal+'/requests/'+requestId+'/files',{id:fid,messageId:mid,filename:'internal.pdf',mime:'application/pdf',contentBase64:Buffer.from('%PDF-1.4 private').toString('base64')});assert.equal(r.statusCode,200,r.body);
   r=await api('GET',external()+'/requests/'+requestId,undefined,'customer');assert(!r.body.includes('PRIVATE STAFF NOTE'));assert(!r.body.includes('internal.pdf'));assert.equal((await api('GET',external()+'/files/'+fid,undefined,'customer')).statusCode,404);
   assert.equal((await api('POST',external()+'/requests/'+requestId+'/messages',{id:id(),version:5,body:'invalid',internal:true},'customer')).statusCode,403);
   assert.equal((await api('GET',internal+'/requests/'+requestId,undefined,'admin-b')).statusCode,403);
   assert.equal((await api('GET',external()+'/requests/'+requestId,undefined,'other')).statusCode,404);
  });
  await t.test('status and public notes reflect on customer; approval does not apply',async()=>{
   let r=await api('POST',internal+'/requests/'+requestId+'/messages',{id:id(),version:6,status:'approved',body:'Approved for next planning cycle'});assert.equal(r.statusCode,200,r.body);
   r=await api('GET',external()+'/requests/'+requestId,undefined,'customer');assert.equal(r.json().request.status,'approved');assert(r.body.includes('Approved for next planning cycle'));
   assert.equal((await seed.query('SELECT ordered_qty FROM orders WHERE id=$1',[order])).rows[0].ordered_qty,'100');
   assert.equal((await api('POST',internal+'/requests/'+requestId+'/messages',{id:id(),version:5,body:'stale'})).statusCode,409);
   r=await api('POST',internal+'/requests/'+requestId+'/apply',{id:id(),version:7,body:'Production impact reviewed',impactReviewed:true});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().revision,1);
   r=await api('GET',external()+'/requests/'+requestId,undefined,'customer');assert.equal(r.json().request.status,'applied');assert.equal(r.json().revisions.length,1);
   assert.equal((await seed.query('SELECT ordered_qty FROM orders WHERE id=$1',[order])).rows[0].ordered_qty,'120');
   assert.equal((await api('POST',internal+'/requests/'+requestId+'/apply',{id:id(),version:6,body:'Duplicate',impactReviewed:true})).statusCode,409);
  });
  await t.test('media permissions and account block apply to direct URLs',async()=>{
   const fid=id();let r=await api('POST',internal+'/media',{id:fid,orderId:order,category:'video',filename:'clip.mp4',mime:'video/mp4',contentBase64:Buffer.from('0000ftypisom').toString('base64')});assert.equal(r.statusCode,200,r.body);
   const path='/api/v1/customer-portal/orders/'+share+'/media/'+fid;assert.equal((await api('GET',path,undefined,'customer')).statusCode,404);
   await put({permissions:{...perms,videos:true}});assert.equal((await api('GET',path,undefined,'customer')).statusCode,200);
   r=await api('POST',internal+'/accounts/block',{customerId:ca,userId:customer});assert.equal(r.statusCode,200,r.body);
   assert.equal((await api('GET',path,undefined,'customer')).statusCode,404);assert.deepEqual((await api('GET','/api/v1/customer-portal/orders',undefined,'customer')).json().orders,[]);
   assert.equal((await api('GET',external()+'/requests/'+requestId,undefined,'customer')).statusCode,404);
   await api('POST',internal+'/accounts/unblock',{customerId:ca,userId:customer});assert.equal((await api('GET',path,undefined,'customer')).statusCode,200);
  });
  await t.test('invalid and active file formats are rejected',async()=>{const r=await api('POST',internal+'/media',{id:id(),orderId:order,category:'document',filename:'bad.pdf',mime:'application/pdf',contentBase64:Buffer.from('<script>alert(1)</script>').toString('base64')});assert.equal(r.statusCode,400,r.body);});
  await t.test('managed customer accounts have no employee role and passwords are owner-only',async()=>{
   const password='Testing-only-password-2026';let r=await api('POST',internal+'/accounts/create',{customerId:ca,name:'Customer User',username:'portal.user.'+suffix,password,confirmation:password});assert.equal(r.statusCode,200,r.body);const uid=r.json().userId;assert.equal(provisioned.length,1);
   assert.equal((await seed.query('SELECT count(*)::int n FROM site_memberships WHERE user_id=$1',[uid])).rows[0].n,0);
   r=await api('POST',internal+'/accounts/password',{customerId:ca,userId:uid,password,confirmation:password});assert.equal(r.statusCode,200,r.body);assert.equal(passwords.length,1);
   r=await api('POST',internal+'/accounts/password',{customerId:ca,userId:uid,password,confirmation:password},'admin-b');assert.equal(r.statusCode,403);
   r=await api('POST',internal+'/accounts/password',{customerId:ca,userId:customer,password,confirmation:password});assert.equal(r.statusCode,403);
   assert.equal((await seed.query("SELECT count(*)::int n FROM audit_events WHERE payload::text LIKE '%Testing-only-password%' ")).rows[0].n,0);
  });
  await t.test('stale baseline cannot overwrite a concurrent order edit',async()=>{
   const rid=id();let r=await api('POST',external()+'/requests',{id:rid,messageId:id(),title:'New due date',kind:'change',body:'Change date',proposed:{dueDate:'2027-01-02'}},'customer');assert.equal(r.statusCode,200,r.body);
   await api('POST',internal+'/requests/'+rid+'/messages',{id:id(),version:1,status:'approved',body:'Approved'});
   await seed.query('UPDATE orders SET version=version+1 WHERE id=$1',[order]);r=await api('POST',internal+'/requests/'+rid+'/apply',{id:id(),version:2,body:'Impact reviewed',impactReviewed:true});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'ORDER_CHANGED');
   assert.equal((await seed.query('SELECT count(*)::int n FROM portal_revisions')).rows[0].n,1);
  });
  await t.test('new drawing is blocked during running production then published with immutable history',async()=>{
   const rid=id(),mid=id(),fid=id(),po=id(),op=id(),job=id();
   await seed.query("INSERT INTO production_orders(tenant_id,site_id,id,order_id,number,quantity,planning_state) VALUES($1,$2,$3,$4,'PO-1',120,'planned')",[ta,sa,po,order]);
   await seed.query("INSERT INTO operations(tenant_id,site_id,id,order_id,production_order_id,sequence,name,kind) VALUES($1,$2,$3,$4,$5,0,'Turning','internal')",[ta,sa,op,order,po]);
   await seed.query("INSERT INTO work_orders(tenant_id,site_id,id,order_id,operation_id,production_order_id,work_order_number,planned_qty,status) VALUES($1,$2,$3,$4,$5,$6,'WO-1',120,'running')",[ta,sa,job,order,op,po]);
   let r=await api('POST',external()+'/requests',{id:rid,messageId:mid,title:'Drawing change',kind:'change',body:'New drawing'},'customer');assert.equal(r.statusCode,200,r.body);
   r=await api('POST',external()+'/requests/'+rid+'/files',{id:fid,messageId:mid,filename:'revision-b.pdf',mime:'application/pdf',contentBase64:Buffer.from('%PDF-1.4 revision B').toString('base64')},'customer');assert.equal(r.statusCode,200,r.body);
   r=await api('POST',internal+'/requests/'+rid+'/messages',{id:id(),version:2,status:'reviewing',body:'All remaining production uses B',proposed:{drawingFileId:fid,drawingRevision:'B'}});assert.equal(r.statusCode,200,r.body);
   r=await api('POST',internal+'/requests/'+rid+'/messages',{id:id(),version:3,status:'approved',body:'Approved'});assert.equal(r.statusCode,200,r.body);
   r=await api('POST',internal+'/requests/'+rid+'/apply',{id:id(),version:4,body:'All remaining production',impactReviewed:true});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'PAUSE_REQUIRED');
   await seed.query("UPDATE work_orders SET status='paused' WHERE id=$1",[job]);r=await api('POST',internal+'/requests/'+rid+'/apply',{id:id(),version:4,body:'All remaining production',impactReviewed:true});assert.equal(r.statusCode,200,r.body);
   assert.equal((await seed.query('SELECT count(*)::int n FROM drawing_publications')).rows[0].n,1);assert.equal((await seed.query('SELECT count(*)::int n FROM work_orders WHERE id=$1',[job])).rows[0].n,1);
   const rid2=id();await api('POST',external()+'/requests',{id:rid2,messageId:id(),title:'Decrease',kind:'change',body:'Reduce quantity',proposed:{quantity:50}},'customer');await api('POST',internal+'/requests/'+rid2+'/messages',{id:id(),version:1,status:'approved',body:'Approved'});
   r=await api('POST',internal+'/requests/'+rid2+'/apply',{id:id(),version:2,body:'Reviewed',impactReviewed:true});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'PRODUCTION_IMPACT');
  });
  await t.test('browser customer upload, manager response and internal note exclusion use the real API',async()=>{
   const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('../../node_modules/playwright'),root=path.resolve(__dirname,'../..');
   const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers={authorization:'Bearer '+(req.headers['x-test-subject']||'customer')+'.test.token'};if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];const r=await app.inject({method:req.method,url:req.url,headers,...(chunks.length?{payload:Buffer.concat(chunks)}:{})});res.writeHead(r.statusCode,{'content-type':r.headers['content-type']||'application/json'});res.end(r.rawPayload);return;}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));}catch(e){res.writeHead(500);res.end('Test server error');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   let browser;try{
    browser=await chromium.launch({headless:true,...(process.env.AUDIT_CHROME?{executablePath:process.env.AUDIT_CHROME}:{}),args:['--no-sandbox']});
    const cp=await browser.newPage({viewport:{width:390,height:844},extraHTTPHeaders:{'x-test-subject':'customer'}}),mp=await browser.newPage({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-test-subject':'admin-a'}}),errors=[];for(const page of [cp,mp]){page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.EventSource=class{addEventListener(){}close(){}};});}
    const origin='http://127.0.0.1:'+server.address().port;
    await cp.goto(origin+'/customer-portal.html');await cp.getByRole('button',{name:/TEST/}).click();await cp.getByText('Yeni değişiklik / bilgi talebi oluştur',{exact:true}).click();
    await cp.getByLabel('Talep başlığı',{exact:true}).fill('Browser request');await cp.getByLabel('Talep türü',{exact:true}).selectOption('question');await cp.getByLabel('Açıklama ve gerekçe',{exact:true}).fill('Please send delivery information');await cp.getByLabel('Talebe belge ekle',{exact:true}).setInputFiles({name:'customer-note.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 browser fixture')});await cp.getByRole('button',{name:'Talebi gönder',exact:true}).click();await cp.locator('#portal-timeline').getByRole('button',{name:'customer-note.pdf'}).waitFor();
    await mp.goto(origin+'/customer-sharing.html');await mp.waitForTimeout(1500);assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(await mp.locator('#collaboration').count(),1,await mp.locator('body').innerText());await mp.getByRole('button',{name:/Browser request/}).click();await mp.getByLabel('Mesaj',{exact:true}).fill('We are checking the delivery date');await mp.getByLabel('Talep durumu',{exact:true}).selectOption('reviewing');await mp.getByRole('button',{name:'Yanıtı / notu kaydet',exact:true}).click();await mp.locator('#portal-timeline').getByText('We are checking the delivery date',{exact:true}).waitFor();
    await cp.getByRole('button',{name:'Talepleri yenile',exact:true}).click();await cp.locator('#portal-timeline').getByText('We are checking the delivery date',{exact:true}).waitFor();
    await mp.getByLabel('Mesaj',{exact:true}).fill('INTERNAL BROWSER NOTE');await mp.getByLabel('Yalnız Flow ekibine görünen iç not',{exact:true}).check();await mp.getByRole('button',{name:'Yanıtı / notu kaydet',exact:true}).click();await mp.locator('#portal-timeline').getByText('INTERNAL BROWSER NOTE',{exact:true}).waitFor();await cp.getByRole('button',{name:'Talepleri yenile',exact:true}).click();await cp.locator('#portal-timeline').getByText('We are checking the delivery date',{exact:true}).waitFor();assert.equal(await cp.getByText('INTERNAL BROWSER NOTE',{exact:true}).count(),0);
    await mp.getByRole('button',{name:/Quantity and due date/}).click();await mp.waitForFunction(()=>document.querySelector('#portal-thread select[name="status"]')?.value==='applied');assert.equal(await mp.getByLabel('Talep durumu',{exact:true}).inputValue(),'applied');await mp.getByLabel('Mesaj',{exact:true}).fill('Final delivery clarification');await mp.getByRole('button',{name:'Yanıtı / notu kaydet',exact:true}).click();await mp.locator('#portal-timeline').getByText('Final delivery clarification',{exact:true}).waitFor();await cp.getByRole('button',{name:/Quantity and due date/}).click();await cp.locator('#portal-timeline').getByText('Final delivery clarification',{exact:true}).waitFor();
    assert.equal(await cp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    const out=path.join(root,'artifacts/customer-portal');fs.mkdirSync(out,{recursive:true});await cp.screenshot({path:path.join(out,'collaboration-customer-mobile.png'),fullPage:true});await mp.screenshot({path:path.join(out,'collaboration-manager-desktop.png'),fullPage:true});
   }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
  });
 }finally{if(app)await app.close();if(pool)await pool.end();if(seed)await seed.end();if(migrator)await migrator.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);for(const r of [runtime,owner])await admin.query(`DROP ROLE IF EXISTS "${r}"`);await admin.end();}
});
