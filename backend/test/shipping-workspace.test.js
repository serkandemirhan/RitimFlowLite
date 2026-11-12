'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../src/migrate'),{provisionRuntime}=require('../security/provision-runtime'),{buildApp}=require('../src/app');
test('shipping workspace: five products, approved final output, partial multi-product dispatch, recovery, atomicity and concurrency',async()=>{
 const db=process.env.TEST_DATABASE_URL;if(!db)throw Error('Disposable PostgreSQL required');
 const admin=new Pool({connectionString:db}),suffix=crypto.randomBytes(6).toString('hex'),schema='ship_'+suffix,role='ship_app_'+suffix;
 const {roleUrl,createRole}=require('../test-support/roles.cjs').roleConnections(db),id=()=>crypto.randomUUID(),tenant=id(),site=id(),otherTenant=id(),otherSite=id(),actor=id(),viewer=id(),order=id();let seed,pool,app;
 try{
  await createRole(admin,role);await admin.query(`CREATE SCHEMA ${schema}`);seed=new Pool({connectionString:db,options:'-c search_path='+schema});await migrate(seed);await provisionRuntime(seed,schema,role,{isolatedDevelopment:true});
  await seed.query("INSERT INTO tenants(id,name) VALUES($1,'Workshop'),($2,'Other')",[tenant,otherTenant]);await seed.query("INSERT INTO sites(tenant_id,id,code,name) VALUES($1,$2,'MAIN','Main'),($3,$4,'OTHER','Other')",[tenant,site,otherTenant,otherSite]);
  await seed.query("INSERT INTO users(id,issuer,subject,display_name) VALUES($1,'fixture','manager','Manager'),($2,'fixture','viewer','Viewer')",[actor,viewer]);await seed.query("INSERT INTO site_memberships(tenant_id,site_id,user_id,role) VALUES($1,$2,$3,'manager'),($1,$2,$3,'operator'),($1,$2,$4,'viewer')",[tenant,site,actor,viewer]);
  pool=new Pool({connectionString:roleUrl(role),options:'-c search_path='+schema,max:8});app=buildApp({pool,verifier:{verify:async token=>({issuer:'fixture',subject:token==='v.v.v'?'viewer':'manager'})},isolatedDevelopment:true});
  const base=`/api/v1/sites/${tenant}/${site}`,call=(method,p,payload,key=id(),token='m.m.m')=>app.inject({method,url:base+p,headers:{authorization:'Bearer '+token,'idempotency-key':key},...payload?{payload}:{}}),post=async(p,b)=>{const r=await call('POST',p,b);assert([200,201].includes(r.statusCode),r.body);return r.json()};
  app.addHook('onError',async(req,reply,e)=>{if(!e.statusCode||e.statusCode>=500)console.log('Shipping fixture error:',e.code,e.message)});
  await seed.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_name,ordered_qty,itemized) VALUES($1,$2,$3,'FIVE-PRODUCTS','Workshop Customer','5 ürün',49,true)",[tenant,site,order]);
  const lines=[];for(const [index,amount]of [10,20,8,6,5].entries()){const item=id();lines.push(item);await seed.query('INSERT INTO order_items(tenant_id,site_id,order_id,id,line_number,part_number,part_name,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,site,order,item,index+1,'P'+(index+1),'Ürün '+(index+1),amount]);}
  async function output(item,amount,{approved=true,final=true,finish=false}={}){
   const po=id(),op=id(),job=id(),machine=id(),lot=id(),reservation=id();
   await seed.query("INSERT INTO production_orders(tenant_id,site_id,order_id,id,number,quantity,planning_state,order_item_id) VALUES($1,$2,$3,$4,$5,$6,'planned',$7)",[tenant,site,order,po,'PO-'+po,amount,item]);
   await seed.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) VALUES($1,$2,$3,$4,0,'Turning','internal',$5)",[tenant,site,order,op,po]);
   if(!final)await seed.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) VALUES($1,$2,$3,$4,1,'Final finish','internal',$5)",[tenant,site,order,id(),po]);
   await seed.query('INSERT INTO work_orders(tenant_id,site_id,order_id,id,operation_id,work_order_number,planned_qty,production_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,site,order,job,op,'JOB-'+job,amount,po]);
   await seed.query('INSERT INTO machines(tenant_id,site_id,id,code) VALUES($1,$2,$3,$4)',[tenant,site,machine,'M-'+machine]);await seed.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id) VALUES($1,$2,$3,$4,$5,$6)',[tenant,site,id(),job,machine,actor]);
   await seed.query("INSERT INTO lots(tenant_id,site_id,order_id,id,lot_code,kind) VALUES($1,$2,$3,$4,$5,'material')",[tenant,site,order,lot,'L-'+lot]);await seed.query("INSERT INTO material_receipts(tenant_id,site_id,order_id,id,lot_id,supplier,document_ref,quantity_pieces,source_quantity,source_unit,conversion_factor) VALUES($1,$2,$3,$4,$5,'Supplier',$7,$6::bigint,$6::numeric,'piece',1)",[tenant,site,order,id(),lot,amount,'DOC-'+lot]);
   await seed.query("INSERT INTO reservations(tenant_id,site_id,order_id,id,work_order_id,lot_id,quantity_pieces,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')",[tenant,site,order,reservation,job,lot,amount]);
   await post('/orders/'+order+'/physical-receipts',{reservationId:reservation,quantity:amount});const root='/orders/'+order+'/work-orders/'+job;
   await post(root+'/production/start',{});const result=await post(root+'/production/results',{lotId:lot,kind:'pending',quantity:amount});
   if(approved){await post(root+'/quality/decisions',{eventId:result.eventId,lotId:lot,outcome:'approved',quantity:amount,evidence:'Physical inspection'});await post(root+'/production/complete',{});}else if(finish)await post(root+'/production/complete',{});else await post(root+'/production/pause',{reason:'Awaiting quality'});
   return {...result,productionOrderId:po,workOrderId:job};
  }
  const a1=await output(lines[0],4),a2=await output(lines[0],6);await output(lines[1],20);const strictPending=await output(lines[2],8,{approved:false});await output(lines[3],6,{final:false});
  const path='/orders/'+order+'/shipping';
  let r=await call('GET','/shipping/ready-orders');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().total,1);assert.equal(r.json().items[0].readyQuantity,30);assert.equal(r.json().items[0].readyProductCount,2);
  const initial=(await call('GET',path+'/products')).json();assert.deepEqual(initial.products.map(i=>i.readyQuantity),[10,20,0,0,0]);assert.equal(initial.products[0].sources.length,2,'Lot splits stay automatic');
  assert.equal((await call('GET','/shipping/ready-orders?q=P2')).json().total,1,'Product search finds its containing order');assert.equal((await call('GET','/shipping/ready-orders?q=not-present')).json().total,0);
  assert.equal((await app.inject({url:base+'/shipping/ready-orders'})).statusCode,401);assert.equal((await app.inject({url:`/api/v1/sites/${otherTenant}/${otherSite}/shipping/ready-orders`,headers:{authorization:'Bearer m.m.m'}})).statusCode,403);
  const body={confirmed:true,lines:[{orderItemId:lines[0],quantity:6},{orderItemId:lines[1],quantity:3}]};
  assert.equal((await call('POST',path+'/dispatch-products',body,id(),'v.v.v')).statusCode,403);
  assert.equal((await call('POST',path+'/dispatch-products',{...body,confirmed:false})).statusCode,400);
  assert.equal((await call('POST',path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[2],quantity:1}]})).statusCode,409,'Uninspected output cannot ship');
  assert.equal((await call('POST',path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[3],quantity:1}]})).statusCode,409,'Intermediate output cannot ship');
  assert.equal((await call('POST',path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:id(),quantity:1}]})).statusCode,409);
  assert.equal((await call('POST',path+'/dispatch-products',{confirmed:true,lines:[...body.lines,{orderItemId:lines[0],quantity:1}]})).statusCode,400);
  await seed.query('UPDATE orders SET execution_hold=true WHERE id=$1',[order]);assert.equal((await call('GET','/shipping/ready-orders')).json().total,0);assert.equal((await call('POST',path+'/dispatch-products',body)).statusCode,409);await seed.query('UPDATE orders SET execution_hold=false WHERE id=$1',[order]);
  await seed.query(`REVOKE INSERT ON audit_events FROM ${role}`);try{assert.equal((await call('POST',path+'/dispatch-products',body)).statusCode,500);assert.equal((await call('GET',path)).json().events.length,0,'Failure rolls back all products and header');}finally{await seed.query(`GRANT INSERT ON audit_events TO ${role}`)}
  const key=id();r=await call('POST',path+'/dispatch-products',body,key);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().delivered,false);assert.equal(r.json().quantity,9);assert.equal(r.json().events.length,3,'Product A consumes 4 + 2 across FIFO lots');assert.equal(r.json().events[0].outputLotId,a1.outputLotId);assert.equal(r.json().events[1].outputLotId,a2.outputLotId);
  assert.deepEqual((await call('POST',path+'/dispatch-products',body,key)).json(),r.json(),'Retry never duplicates shipment');let shipped=(await call('GET',path)).json();assert.equal(shipped.shippingOrders.length,1);assert.equal(shipped.totals.dispatched,9);assert.equal(shipped.totals.delivered,0);
  const delivery=path+'/orders/'+r.json().id+'/confirm-delivery',deliveryKey=id();assert.equal((await call('POST',delivery,{confirmed:false,quantity:9})).statusCode,400);assert.equal((await call('POST',delivery,{confirmed:true,quantity:8})).statusCode,409);let delivered=await call('POST',delivery,{confirmed:true,quantity:9},deliveryKey);assert.equal(delivered.statusCode,201,delivered.body);assert.equal((await call('POST',delivery,{confirmed:true,quantity:9},deliveryKey)).json().delivered,true);assert.equal((await call('POST',delivery,{confirmed:true,quantity:9})).statusCode,409);
  const partial=(await call('GET',path+'/products')).json();assert.deepEqual(partial.products.map(i=>i.readyQuantity),[4,17,0,0,0]);assert.deepEqual(partial.products.slice(0,2).map(i=>i.dispatchedQuantity),[6,3]);
  const race=await Promise.all([call('POST',path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[0],quantity:4}]}),call('POST',path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[0],quantity:4}]})]);assert.deepEqual(race.map(x=>x.statusCode).sort(),[201,409]);
  await post(path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[1],quantity:17}]});assert.equal((await call('GET','/shipping/ready-orders')).json().total,0);assert.equal((await call('GET','/shipping/ready-orders?include='+order)).json().selected,null,'Exhausted order cannot be pinned into the selector');
  shipped=(await call('GET',path)).json();assert.equal(shipped.totals.dispatched,30);assert.equal(shipped.totals.delivered,9);assert.equal(shipped.shippingOrders.length,3,'Partial shipments remain separate records');
  await post('/orders/'+order+'/work-orders/'+strictPending.workOrderId+'/production/complete',{});const strictControl=(await call('GET','/quality/controls/final/'+strictPending.productionOrderId)).json();assert.equal(strictControl.control.pending,8);assert.equal((await call('GET','/shipping/ready-orders')).json().total,0,'Required final control blocks shipping even after production completes');
  // The policy is frozen per production order; only new production may bypass.
  await seed.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'tenant_admin')",[tenant,actor]);
  assert.equal((await call('GET','/shipping/rules')).json().allowUninspected,false);
  assert.equal((await call('POST','/shipping/rules',{allowUninspected:true,version:0},id(),'v.v.v')).statusCode,403);
  const changed=await post('/shipping/rules',{allowUninspected:true,version:0});assert.equal(changed.version,1);
  assert.equal((await call('POST','/shipping/rules',{allowUninspected:false,version:0})).statusCode,409,'Stale rules cannot overwrite a current setting');
  const uninspected=await output(lines[4],5,{approved:false,finish:true}),task=uninspected.productionOrderId;
  assert.equal((await seed.query('SELECT allow_uninspected_shipping FROM production_orders WHERE id=$1',[task])).rows[0].allow_uninspected_shipping,true);
  assert.equal((await seed.query('SELECT allow_uninspected_shipping FROM production_orders WHERE id=$1',[a1.productionOrderId])).rows[0].allow_uninspected_shipping,false);
  let controls=(await call('GET','/quality/controls?type=final')).json();assert(controls.items.some(i=>i.id===task&&i.pending===5));
  const beforeTracking=await call('GET','/production-tracking?tab=ready');assert.equal(beforeTracking.statusCode,200,beforeTracking.body);assert(beforeTracking.json().orders.some(o=>o.id===order&&o.shipping.readyQuantity===5));
  const bypassKey=id(),without={confirmed:true,lines:[{orderItemId:lines[4],quantity:2}]};const bypass=await call('POST',path+'/dispatch-products',without,bypassKey);assert.equal(bypass.statusCode,201,bypass.body);assert.equal(bypass.json().events[0].uninspectedQuantity,2);assert.deepEqual((await call('POST',path+'/dispatch-products',without,bypassKey)).json(),bypass.json());
  let control=(await call('GET','/quality/controls/final/'+task)).json();assert.equal(control.control.pending,3);assert.equal(control.control.bypassed,2);assert.equal(control.control.approved,0,'Bypass never fakes quality approval');
  const decision='/orders/'+order+'/final-controls/'+task+'/decisions';assert.equal((await call('POST',decision,{quantity:4,outcome:'approved',evidence:'inspection'})).statusCode,409);
  await post(decision,{quantity:1,outcome:'rejected',evidence:'Damaged'});await post(decision,{quantity:2,outcome:'approved',evidence:'Inspection'});
  control=(await call('GET','/quality/controls/final/'+task)).json();assert.equal(control.control.pending,0);assert.equal(control.control.approved,2);assert.equal(control.control.rejected,1);assert.equal(control.control.bypassed,2);
  await post(path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[4],quantity:2}]});
  const completeBypass=await output(lines[2],8,{approved:false,finish:true});await post(path+'/dispatch-products',{confirmed:true,lines:[{orderItemId:lines[2],quantity:8}]});
  control=(await call('GET','/quality/controls/final/'+completeBypass.productionOrderId)).json();assert.equal(control.control.pending,0);assert.equal(control.control.bypassed,8);assert.equal(control.control.controlStatus,'shipped_without_inspection');assert.equal(control.control.approved,0);assert.equal(control.action.limit,0);
  assert.equal((await call('GET','/production-tracking?tab=ready')).json().orders.length,0);
  await post('/shipping/rules',{allowUninspected:false,version:1});assert.equal((await seed.query('SELECT allow_uninspected_shipping FROM production_orders WHERE id=$1',[task])).rows[0].allow_uninspected_shipping,true,'Later settings do not change the production snapshot');
  const command={kind:'shipping',target:order,body:{command:'dispatch-products',orderId:order,payload:body}};assert.equal(require('../src/recovery-catalog').describe(command).suffix,'/orders/'+order+'/shipping/dispatch-products');assert.equal(require('../src/recovery-catalog').storageKind(command),'shipping');
 }finally{if(app)await app.close();if(pool)await pool.end();if(seed)await seed.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();}
});
