'use strict';
// Real OIDC and server commands, using a dedicated fictional two-piece order.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('../../node_modules/playwright');
const run=process.env.RITIM_PREMIUM_RUN||'';if(run&&!/^[a-zA-Z0-9_-]{1,40}$/.test(run))throw Error('Invalid run');const out=path.resolve(__dirname,'../../artifacts/premium-development/acceptance'+(run?'-'+run:''));fs.mkdirSync(out,{recursive:true});
const checkpoint=path.join(out,'checkpoint.json'),state=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):{prefix:'PRM-'+Date.now(),steps:{}};
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(state,null,2));save();
const root='/api/v1/sites/'+process.env.RITIM_LOCAL_TENANT_ID+'/'+process.env.RITIM_LOCAL_SITE_ID;
const errors=[];let browser;
const ready=p=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true');
async function login(user){const p=await browser.newPage({locale:'tr-TR',viewport:{width:1440,height:1000}});p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4178/?mode=api');await p.getByRole('button',{name:'Giriş yap',exact:true}).click();await p.locator('#username').fill(user);await p.locator('#password').fill(process.env.RITIM_LOCAL_LOGIN_PASSWORD);await p.locator('#kc-login').click();await p.getByRole('button',{name:'Devam',exact:true}).click();await ready(p);return p}
async function request(p,url,body,key){return p.evaluate(async({url,body,key})=>{const r=await fetch(url,{...(body?{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)}:{})}),data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data},{url:root+url,body,key})}
async function post(p,key,url,body){if(state.steps[key])return state.steps[key];const x=await request(p,url,body,state.prefix+'-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,20));state.steps[key]=x;save();return x}
async function action(p,fn,arg){await ready(p);await p.evaluate(({fn,arg})=>RitimPremiumAPI[fn](arg),{fn,arg});await ready(p);assert.equal(await p.locator('#api-alert').innerText(),'')}
async function capture(p,name){await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflows');console.log('PASS '+name)}
(async()=>{if(!process.env.RITIM_LOCAL_LOGIN_PASSWORD)throw Error('Protected local configuration required');browser=await chromium.launch();try{
 const manager=await login('manager'),op=await login('operator-a');
 const workflow=(await request(manager,'/recovery/workflow')).workflow,ownReview=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../artifacts/ui-review/premium-development-02/checkpoint.json'),'utf8'));if(workflow?.state?.order?.orderNumber===ownReview.prefix&&workflow.state.steps.order==='committed'&&['committed','skipped'].includes(workflow.state.steps.route)&&['committed','skipped'].includes(workflow.state.steps.plan))await action(manager,'finish');
 const customer=await post(manager,'customer','/master-data/customers',{code:state.prefix,name:'Kurgusal Premium Kabul '+state.prefix}),part=await post(manager,'part','/master-data/parts',{code:state.prefix,name:'Kurgusal örnek gövde'});
 const order=await post(manager,'order','/orders',{orderNumber:state.prefix,customerId:customer.id,partId:part.id,customer:customer.name,partName:part.name,partNumber:part.code,orderedQuantity:2,dueDate:'2026-12-18'}),pid=await post(manager,'production','/orders/'+order.id+'/production-orders',{quantity:2,operations:[{name:'CNC İşleme',kind:'internal',setupMinutes:5,cycleMinutes:2}]}),plan=await post(manager,'plan','/production-orders/'+pid.id+'/state',{action:'plan',version:1,plannedDate:'2026-11-04'}),job=plan.workOrders[0];
 const operators=(await request(manager,'/job-worklist')).operators,operator=operators.find(x=>x.name==='operator-a'||x.name==='Operatör A');assert(operator,'operator-a not found');
 const machine=await post(manager,'machine','/machine-planning/machines',{code:state.prefix});
 await post(manager,'operator',`/orders/${order.id}/work-orders/${job.id}/assignment/operator`,{operatorId:operator.id,reason:'Kurgusal premium kabul'});
 await post(manager,'machine-assignment',`/orders/${order.id}/work-orders/${job.id}/assignment/machine`,{machineId:machine.id,reason:'Kurgusal premium kabul'});
 const material=await post(manager,'material',`/orders/${order.id}/fictional-material-receipts`,{quantity:2,documentRef:state.prefix,supplier:'Kurgusal test kaynağı'}),allocation=await post(manager,'allocation',`/orders/${order.id}/fictional-material-allocations`,{workOrderId:job.id,lotId:material.lotId,quantity:2});
 await post(manager,'receipt',`/orders/${order.id}/physical-receipts`,{reservationId:allocation.id,quantity:2});
 await action(op,'navigate','operator');await action(op,'openAssigned',job.id);
 let production=await request(op,`/orders/${order.id}/work-orders/${job.id}/production/balances`);
 if(!state.steps.output){
  assert.equal(production.attention.ready,true);assert.equal(await op.getByRole('button',{name:'İşi başlat',exact:true}).isEnabled(),true);
  await op.setViewportSize({width:390,height:844});const start=await op.getByRole('button',{name:'İşi başlat',exact:true}).boundingBox();assert(start&&start.y+start.height<=844,'Primary operator action below the first mobile viewport');await capture(op,'01-operator-ready-mobile');
  await action(op,'productionAction','start');await op.locator('#api-production-qty').fill('3');await action(op,'productionAction','results');assert.equal(await op.locator('#api-production-qty').getAttribute('aria-invalid'),'true');assert.equal((await request(op,`/orders/${order.id}/work-orders/${job.id}/production/balances`)).consumedQuantity,0);
  await op.locator('#api-production-qty').fill('2');await op.locator('#api-production-kind').selectOption('pending');await action(op,'productionAction','results');production=await request(op,`/orders/${order.id}/work-orders/${job.id}/production/balances`);assert.equal(production.consumedQuantity,2);state.steps.output=true;save();await capture(op,'02-production-recorded-mobile');
 }
 await action(manager,'navigate','quality-list');const queue=await request(manager,'/job-worklist?queue=quality&status=all&q='+state.prefix);
 let quality=await request(manager,`/orders/${order.id}/work-orders/${job.id}/quality`);
 if(quality.outputs.some(x=>x.unresolved)){
  assert(queue.items.some(x=>x.id===job.id));await manager.evaluate(({job,order})=>RitimPremiumAPI.openQualityJob(job,order),{job:job.id,order:order.id});await ready(manager);
  const index=quality.outputs.findIndex(x=>x.unresolved>0);await manager.evaluate(i=>RitimPremiumAPI.openQualityDialog(i),index);await manager.locator('#quality-dialog-quantity').fill('3');await manager.evaluate(()=>RitimPremiumAPI.submitQualityDialog());assert.equal(await manager.locator('#quality-dialog-quantity').getAttribute('aria-invalid'),'true');assert.equal(await manager.locator('#api-quality-dialog').evaluate(x=>x.open),true);
  await manager.locator('#quality-dialog-quantity').fill('2');await manager.locator('#quality-dialog-evidence').fill('Kurgusal kabul: ölçüler uygun');await capture(manager,'03-quality-decision');await manager.evaluate(()=>RitimPremiumAPI.submitQualityDialog());await ready(manager);assert.equal(await manager.locator('#api-quality-dialog').evaluate(x=>x.open),false);
 }
 await action(op,'openAssigned',job.id);production=await request(op,`/orders/${order.id}/work-orders/${job.id}/production/balances`);if(production.attention.status!=='complete')await action(op,'productionAction','complete');
 await action(manager,'navigate','shipping');await manager.locator('#context-order-query').fill(state.prefix);await action(manager,'searchOrderChoices');await manager.locator('#ship-order').selectOption(order.id);await ready(manager);
 let ship=await request(manager,`/orders/${order.id}/shipping`);
 if(!ship.shippingOrders.length)await action(manager,'shippingAction','order');
 ship=await request(manager,`/orders/${order.id}/shipping`);
 if(!ship.events.some(x=>x.type==='allocate')){await action(manager,'shippingTask','allocate');await manager.locator('#ship-quantity').fill('2');await action(manager,'shippingAction','allocate')}
 ship=await request(manager,`/orders/${order.id}/shipping`);
 if(!ship.events.some(x=>x.type==='dispatch')){await action(manager,'shippingTask','dispatch');await manager.locator('#ship-quantity').fill('2');await action(manager,'shippingAction','dispatch')}
 ship=await request(manager,`/orders/${order.id}/shipping`);
 if(!ship.events.some(x=>x.type==='deliver')){await action(manager,'shippingTask','deliver');await manager.locator('#ship-quantity').fill('2');await action(manager,'shippingAction','deliver')}
 assert.equal((await request(manager,`/orders/${order.id}/shipping`)).totals.delivered,2);await capture(manager,'04-shipping-delivered');
 await action(manager,'openRecovery',order.id);const closing=await request(manager,`/orders/${order.id}/closing`);if(closing.status==='open'){assert.equal(closing.canClose,true);manager.once('dialog',d=>d.accept());await action(manager,'closeOrder')}
 assert.equal((await request(manager,'/orders/'+order.id)).status,'closed');await capture(manager,'05-closed-order');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({status:'PASS',realOidcRoles:['manager','operator-a'],orderId:order.id,quantity:2,mobilePrimaryActionVisible:true,invalidProductionHasNoWrite:true,invalidQualityKeepsDialog:true,qualityApproved:2,delivered:2,orderClosed:true,errors,verifiedAt:new Date().toISOString()},null,2));console.log('PASS premium workspace: real operator, validation, quality dialog, physical shipping and closed order');
 }finally{await browser.close()}})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
