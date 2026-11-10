'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(h){
 const s=h.state,p=h.admin,out=path.resolve('artifacts/cloud-release/planning-drag');fs.mkdirSync(out,{recursive:true});
 const customer=s.steps.customer,part=s.steps.part,m1=s.steps['machine-CNC-01'].id,m2=s.steps['machine-CNC-02'].id;
 const order=await h.post('drag-order','/orders',{orderNumber:'SAHA-20261107-02',customer:customer.name,customerId:customer.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:2,dueDate:'2026-11-20'});
 const jobs=[];
 for(let i=0;i<2;i++){
  const po=await h.post('drag-po-'+i,'/orders/'+order.id+'/production-orders',{number:'SAHA-20261107-02-UE'+(i+1),quantity:1,operations:[{name:'CNC torna',kind:'internal',setupMinutes:5,cycleMinutes:2}]});
  const plan=await h.post('drag-plan-'+i,'/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-07'});
  const job=plan.workOrders[0];jobs.push(job.id);
  await h.post('drag-assign-'+i,'/orders/'+order.id+'/work-orders/'+job.id+'/assignment/machine',{machineId:m1,reason:'Makine siralamasi kabul testi'});
 }
 const network=[];p.on('response',r=>{if(r.url().includes('/recovery/')&&r.url().endsWith('/retry'))network.push({status:r.status(),path:new URL(r.url()).pathname});});
 const idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',{},{timeout:90000});
 async function open(){await p.goto('https://flow.getritim.com/?mode=api&view=machine-planning');await p.waitForSelector('.planning-studio',{timeout:90000});await idle();await p.getByRole('button',{name:'Tümü',exact:true}).click();}
 async function shot(name){await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
 async function move(id,target,name,position){
  const response=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/recovery/')&&r.url().endsWith('/retry'),{timeout:90000});
  await p.locator('[data-job="'+id+'"]').dragTo(target,{...(position?{targetPosition:position}:{}),timeout:20000});
  const r=await response;assert.equal(r.status(),200,'UI move failed: '+await r.text());await idle();
  assert.equal((await h.read('/recovery')).commands.length,0);
  await shot(name);
 }
 await open();await shot('01-before');
 await move(jobs[0],p.locator('[data-machine="'+m2+'"] .machine-drop-end'),'02-first-move');
 let board=await h.read('/machine-planning');assert.equal(board.jobs.find(j=>j.id===jobs[0]).machineId,m2);assert.equal(board.jobs.find(j=>j.id===jobs[1]).machineId,m1);
 await move(jobs[1],p.locator('[data-machine="'+m2+'"] .machine-drop-end'),'03-second-move');
 const queue=b=>b.jobs.filter(j=>j.machineId===m2).sort((a,b)=>a.schedule.position-b.schedule.position).map(j=>j.id);
 assert.deepEqual(queue(await h.read('/machine-planning')),jobs);
 await move(jobs[1],p.locator('[data-job="'+jobs[0]+'"]'),'04-reordered',{x:30,y:12});
 assert.deepEqual(queue(await h.read('/machine-planning')),[jobs[1],jobs[0]]);
 await open();await shot('05-after-reload');assert.deepEqual(queue(await h.read('/machine-planning')),[jobs[1],jobs[0]]);
 const dom=await p.locator('[data-machine="'+m2+'"] [data-job]').evaluateAll(nodes=>nodes.map(n=>n.dataset.job));assert.deepEqual(dom,[jobs[1],jobs[0]]);
 assert.equal(await p.locator('.planning-pending').count(),0);assert.equal((await p.locator('#api-alert').textContent()).trim(),'');
 const result={status:'PASS',order:order.orderNumber,orderId:order.id,jobs,machine:m2,queueAfterReload:dom,network,setup:'Authenticated API',moves:'Playwright native dragTo, real UI handlers',pending:0};
 s.planningDragVerification=result;h.save();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Makine taşıma testi</title><style>body{font:16px system-ui;background:#f4f7fb;color:#203750;margin:24px}main{max-width:1200px;margin:auto}img{width:100%;border:1px solid #dde5ef;border-radius:12px}section{margin:28px 0}</style><main><h1>Makine taşıma ve sıralama testi — geçti</h1><p>SAHA-20261107-02 · 2 adet sipariş / iki ayrı üretim emri. Hazırlık kayıtları API ile oluşturuldu; taşıma ve sıra değiştirme gerçek arayüzde sürükle-bırakla yapıldı.</p><p>Üç taşıma HTTP 200. Sayfa yenilendiğinde atamalar ve yeni sıra korundu. Bekleyen işlem: 0. İki iş CNC-02 üzerinde bekliyor; üretim başlatılmadı.</p>'+['01-before','02-first-move','03-second-move','04-reordered','05-after-reload'].map((name,i)=>'<section><h2>'+['Başlangıç: CNC-01','İlk iş CNC-02 üzerinde','İki iş CNC-02 üzerinde','İkinci iş ilk sıraya taşındı','Sayfa yenilendikten sonra'][i]+'</h2><a href="'+name+'.png"><img src="'+name+'.png"></a></section>').join('')+'</main>');
 return result;
};
