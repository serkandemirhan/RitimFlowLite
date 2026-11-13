'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{buildApp}=require('../src/app');
test('order lifecycle: scoped item revisions, atomic replacement and customer-approved short closure',{timeout:120000},async t=>{
 const db=process.env.TEST_DATABASE_URL;if(!db)throw Error('Disposable PostgreSQL required');
 const id=()=>crypto.randomUUID(),admin=new Pool({connectionString:db}),suffix=crypto.randomBytes(5).toString('hex'),schema='lifecycle_'+suffix,role='lifecycle_app_'+suffix,ta=id(),sa=id(),tb=id(),sb=id(),manager=id(),operator=id(),planner=id();let seed,pool,app;
 const {roleUrl,createRole}=require('../test-support/roles.cjs').roleConnections(db);
 try{
  await createRole(admin,role);await admin.query('CREATE SCHEMA '+schema);seed=new Pool({connectionString:db,options:'-c search_path='+schema});await migrate(seed);await provisionRuntime(seed,schema,role,{isolatedDevelopment:true});
  await seed.query("INSERT INTO tenants(id,name) VALUES($1,'A'),($2,'B')",[ta,tb]);await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'A','A'),($3,$4,'B','B')",[ta,sa,tb,sb]);
  for(const [user,subject,roleName]of [[manager,'manager','manager'],[operator,'operator','operator'],[planner,'planner','planner']]){await seed.query('INSERT INTO users(id,issuer,subject,display_name) VALUES($1,$2,$3,$3)',[user,'https://identity.test',subject]);await seed.query('INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,$4)',[ta,sa,user,roleName]);}
  pool=new Pool({connectionString:roleUrl(role),options:'-c search_path='+schema});app=buildApp({pool,isolatedDevelopment:true,verifier:{verify:async token=>({issuer:'https://identity.test',subject:token.split('.')[1]})}});
  app.addHook('onError',async(req,reply,e)=>{if(!e.statusCode||e.statusCode>=500)console.error('Lifecycle error:',e.message,e.stack)});
  const base=`/api/v1/sites/${ta}/${sa}`,call=(method,path,body,token='manager',key=id())=>app.inject({method,url:base+path,headers:{authorization:'Bearer x.'+token+'.x','idempotency-key':key},...(body?{payload:body}:{})}),post=async(path,body,status=201,token,key)=>{const r=await call('POST',path,body,token,key);assert.equal(r.statusCode,status,path+': '+r.body);return r.json()},get=async path=>{const r=await call('GET',path);assert.equal(r.statusCode,200,r.body);return r.json()};
  const customer=await post('/master-data/customers',{code:'C',name:'Customer'}),part=await post('/master-data/parts',{code:'P',name:'Mil'}),part2=await post('/master-data/parts',{code:'Q',name:'Flanş'});
  await post('/master-data/operations',{code:'OP1',name:'Torna',kind:'internal'});await post('/master-data/operations',{code:'OP2',name:'Freze',kind:'internal'});
  const makeOrder=()=>post('/orders',{customerId:customer.id,items:[{partId:part.id,quantity:5,dueDate:'2026-12-10'}]});
  const change=(o,b,status=200,token,key)=>post('/orders/'+o.id+'/items/change',{version:o.version||1,reason:'Müşteri revizyonu',...b},status,token,key);
  let order=await makeOrder();
  await t.test('add, revise and tombstone lines; stale versions, invalid dates and operator writes rejected',async()=>{
   const key=id(),b={action:'add',partId:part2.id,quantity:3,dueDate:'2026-12-11'};const a=await change(order,b,200,undefined,key);assert.deepEqual(await change(order,b,200,undefined,key),a);assert.equal(a.items.length,2);
   await change(order,b,409);order={...order,version:a.version};const line=a.items[1];
   await change(order,{action:'update',itemId:line.id,partId:part2.id,quantity:4,dueDate:'2026-02-30'},400);
   await change(order,{action:'update',itemId:line.id,partId:part2.id,quantity:4,dueDate:'2026-12-12'},403,'operator');
   const updated=await change(order,{action:'update',itemId:line.id,partId:part2.id,quantity:4,dueDate:'2026-12-12'});order.version=updated.version;
   const removed=await change(order,{action:'remove',itemId:line.id});order.version=removed.version;assert.equal(removed.items.length,1);assert.equal((await seed.query('SELECT removed_at IS NOT NULL removed FROM order_items WHERE id=$1',[line.id])).rows[0].removed,true);
   assert.equal((await get('/orders/'+order.id)).orderedQuantity,5);await change(order,{action:'remove',itemId:order.items[0].id},409);
  });
  const po=await post('/orders/'+order.id+'/production-orders',{orderItemId:order.items[0].id,quantity:5,operations:[{name:'Torna',kind:'internal'}]}),planned=await post('/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-12-10'},200),job=planned.workOrders[0].id;
  await t.test('allocated lines cannot be reduced, removed or assigned a different product',async()=>{
   await change(order,{action:'update',itemId:order.items[0].id,partId:part.id,quantity:4},409);
   await change(order,{action:'update',itemId:order.items[0].id,partId:part2.id,quantity:5},409);
   await change(order,{action:'remove',itemId:order.items[0].id},409);
  });
  let next;
  await t.test('replace a paused job atomically; reciprocal identities, cancellation notice and idempotent retry',async()=>{
   await seed.query("UPDATE work_orders SET status='paused' WHERE id=$1",[job]);
   const path='/orders/'+order.id+'/production-orders/'+po.id,b={version:planned.version,reason:'Doğru rota',operations:[{name:'Freze',kind:'internal'}]};
   await post(path+'/replace',b,403,'planner');await post(path+'/replace',b,403,'operator');
   const preview=await get(path+'/replacement-preview');assert.equal(preview.canReplace,true);
   const key=id();next=await post(path+'/replace',b,201,undefined,key);assert.deepEqual(await post(path+'/replace',b,201,undefined,key),next);
   const old=await get('/production-orders/'+po.id);assert.equal(old.status,'cancelled');assert.equal(old.workOrders[0].status,'cancelled');assert.equal(old.replacements[0].next_id,next.id);assert.equal(next.replacements[0].previous_id,po.id);assert.equal(next.quantity,5);assert.equal(next.workOrders.length,0);assert.equal(next.route[0].name,'Freze');
   assert.equal((await get('/orders/'+order.id+'/editing')).allocated,5);assert.equal((await seed.query("SELECT count(*)::int n FROM audit_events WHERE entity_id=$1 AND event_type='operator.lifecycle'",[job])).rows[0].n,1);
   await post(path+'/replace',b,409);assert.equal((await seed.query('SELECT count(*)::int n FROM production_order_replacements')).rows[0].n,1);
  });
  await t.test('physical production blocks replacement without cancelling or creating another order',async()=>{
   const p=await post('/production-orders/'+next.id+'/state',{action:'plan',version:next.version,plannedDate:'2026-12-10'},200),j=p.workOrders[0].id;
   await seed.query("INSERT INTO production_events(tenant_id,site_id,id,work_order_id,kind,quantity_pieces,actor_id) VALUES($1,$2,$3,$4,'scrap',1,$5)",[ta,sa,id(),j,manager]);
   const path='/orders/'+order.id+'/production-orders/'+next.id,preview=await get(path+'/replacement-preview');assert.equal(preview.canReplace,false);assert(preview.reasons.some(x=>x.includes('Üretim')));
   await post(path+'/replace',{version:p.version,reason:'Değişiklik',operations:[{name:'Torna',kind:'internal'}]},409);assert.notEqual((await get('/production-orders/'+next.id)).status,'cancelled');
  });
  await t.test('foreign scope and unknown production identities cannot be linked',async()=>{
   const r=await app.inject({method:'GET',url:`/api/v1/sites/${tb}/${sb}/orders/${order.id}/production-orders/${next.id}/replacement-preview`,headers:{authorization:'Bearer x.manager.x'}});assert.equal(r.statusCode,403);
   assert.equal((await call('GET','/orders/'+order.id+'/production-orders/'+id()+'/replacement-preview')).statusCode,404);
  });
  await t.test('short closure requires customer acceptance, current version and resolved work; original demand stays intact',async()=>{
   const o=await makeOrder(),path='/orders/'+o.id+'/close-remainder',b={version:1,reason:'Müşteri kalan miktardan vazgeçti',customerAccepted:true};
   await post(path,{...b,customerAccepted:false},400);await post(path,{...b,version:2},409);await post(path,b,403,'operator');
   const key=id(),closed=await post(path,b,200,undefined,key);assert.equal(closed.closedQuantity,5);assert.equal(closed.netDelivered,0);assert.equal(closed.orderedQuantity,5);assert.equal(closed.status,'closed');assert.deepEqual(await post(path,b,200,undefined,key),closed);
   assert.equal((await get('/orders/'+o.id)).orderedQuantity,5);await change({...o,version:2},{action:'add',partId:part.id,quantity:1},409);
   const active=await get('/orders/'+order.id+'/closing');await post('/orders/'+order.id+'/close-remainder',{...b,version:active.version},409);
  });
  await t.test('partial delivery closes only the customer-waived remainder and preserves physical quantities',async()=>{
   const o=await makeOrder(),p=await post('/orders/'+o.id+'/production-orders',{orderItemId:o.items[0].id,quantity:3,operations:[{name:'Torna',kind:'internal'}]}),planned=await post('/production-orders/'+p.id+'/state',{action:'plan',version:p.version,plannedDate:'2026-12-10'},200),j=planned.workOrders[0].id,lot=id(),reservation=id(),machine=id();
   await seed.query('INSERT INTO machines(tenant_id,site_id,id,code) VALUES($1,$2,$3,$4)',[ta,sa,machine,'PARTIAL']);await seed.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id) VALUES($1,$2,$3,$4,$5,$6)',[ta,sa,id(),j,machine,operator]);
   await seed.query("INSERT INTO lots(tenant_id,site_id,order_id,id,lot_code,kind) VALUES($1,$2,$3,$4,'PARTIAL','material')",[ta,sa,o.id,lot]);
   await seed.query("INSERT INTO material_receipts(tenant_id,site_id,order_id,id,lot_id,supplier,document_ref,quantity_pieces,source_quantity,source_unit,conversion_factor) VALUES($1,$2,$3,$4,$5,'Supplier','PARTIAL',3,3,'piece',1)",[ta,sa,o.id,id(),lot]);
   await seed.query("INSERT INTO reservations(tenant_id,site_id,order_id,id,work_order_id,lot_id,quantity_pieces,status) VALUES($1,$2,$3,$4,$5,$6,3,'active')",[ta,sa,o.id,reservation,j,lot]);
   await post('/orders/'+o.id+'/physical-receipts',{reservationId:reservation,quantity:3});const root='/orders/'+o.id+'/work-orders/'+j;
   await post(root+'/production/start',{},200,'operator');const output=await post(root+'/production/results',{lotId:lot,kind:'pending',quantity:3},201,'operator');await post(root+'/quality/decisions',{eventId:output.eventId,lotId:lot,outcome:'approved',quantity:3,evidence:'Ölçüm uygun'});
   await post('/orders/'+o.id+'/close-remainder',{version:1,reason:'Müşteri kalan iki parçayı istemiyor',customerAccepted:true},409);
   const shipping=await post('/orders/'+o.id+'/shipping/orders',{});const view=await get('/orders/'+o.id+'/shipping');
   await post('/orders/'+o.id+'/shipping/orders/'+shipping.id+'/allocate',{outputLotId:view.lots[0].lotId,quantity:3,completeTo:'deliver'});
   const key=id(),body={version:1,reason:'Müşteri 3 adet teslimatı kabul etti; kalan 2 iptal',customerAccepted:true},closed=await post('/orders/'+o.id+'/close-remainder',body,200,undefined,key);
   assert.equal(closed.netDelivered,3);assert.equal(closed.closedQuantity,2);assert.equal(closed.orderedQuantity,5);assert.equal(closed.closures.length,1);assert.equal(closed.remainingItems.length,0);
   assert.deepEqual(await post('/orders/'+o.id+'/close-remainder',body,200,undefined,key),closed);
   assert.equal((await get('/orders/'+o.id+'/shipping')).totals.delivered,3);
  });
  await require('../src/readiness').checkReadiness(pool,{isolatedDevelopment:true});
 }finally{if(app)await app.close();if(pool)await pool.end();if(seed)await seed.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.query('DROP ROLE IF EXISTS '+role);await admin.end();}
});
