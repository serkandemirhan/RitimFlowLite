'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(h){
 await require('./operator-mobile-acceptance.cjs')(h);
 const p=h.worker,s=h.state,order=s.steps['drag-order'].id,j=s.steps['drag-plan-0'].workOrders[0].id,out=path.resolve('artifacts/cloud-release/operator-mobile');
 s.mobileChecks ||= [];const done=name=>s.mobileChecks.some(x=>x.name===name),record=(name,detail={})=>{s.mobileChecks.push({name,...detail,time:new Date().toISOString()});h.save();console.log('PASS '+name)};
 const base='/orders/'+order+'/work-orders/'+j;
 const idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 async function click(name){await p.getByRole('button',{name,exact:true}).click();await idle();}
 const shot=name=>p.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 try{
  const drawing=await h.read(base+'/drawing',p);
  if(!drawing.acknowledged){await click('Güncel Çizimi Aç');await p.locator('#api-drawing-dialog').waitFor({state:'visible'});await p.waitForFunction(()=>{const b=document.querySelector('[onclick="RitimPremiumAPI.ackDrawing()"]');return b&&!b.disabled;},null,{timeout:45000});await shot('02-drawing');await p.locator('#api-drawing-dialog').getByRole('button',{name:'Kapat',exact:true}).click();await click('Bu çizimi inceledim');assert.equal((await h.read(base+'/drawing',p)).acknowledged,true);record('Drawing opened and acknowledged');}
  let jobs=(await h.read('/orders/'+order+'/work-orders',p)).workOrders;
  if(jobs.find(x=>x.id===j).status==='waiting'){await click('İşi başlat');assert.equal((await h.read('/orders/'+order+'/work-orders',p)).workOrders.find(x=>x.id===j).status,'running');record('Start on mobile');await shot('03-running');}
  if(!done('Pause and resume on mobile')){
   await click('Duraklat');await p.locator('#operator-pause-dialog').getByRole('button',{name:'Takım değişimi',exact:true}).click();await p.locator('#operator-pause-dialog').getByRole('button',{name:'Duraklat',exact:true}).click();await idle();assert.equal((await h.read('/orders/'+order+'/work-orders',p)).workOrders.find(x=>x.id===j).status,'paused');await shot('04-paused');await click('Devam et');assert.equal((await h.read('/orders/'+order+'/work-orders',p)).workOrders.find(x=>x.id===j).status,'running');record('Pause and resume on mobile');
  }
  if(!done('Offline production recovered once')){
   const before=await h.read(base+'/production/balances');assert.equal(before.consumedQuantity,0);
   await p.locator('#api-production-qty').fill('1');await p.context().setOffline(true);await click('Üretim gir');await shot('05-offline');
   assert.equal((await h.read(base+'/production/balances')).consumedQuantity,0);
   await p.context().setOffline(false);
   const retry=p.getByRole('button',{name:'Aynı işlemle tekrar dene',exact:true});
   if(await retry.count()){await retry.first().click();await idle();}else{await click('Üretim gir');}
   const after=await h.read(base+'/production/balances');assert.equal(after.consumedQuantity,1);assert.equal((await h.read('/recovery',p)).commands.length,0);record('Offline production recovered once',{consumed:after.consumedQuantity});await shot('06-recovered');
  }
  const q=await h.read(base+'/quality',p);if(q.outputs.some(x=>x.separateQualityRequest&&!x.qualityRequested)){await click('Kalite kontrolü iste');await click('Talebi gönder');assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);record('Quality request does not add production');await shot('07-quality-request');}
  return {checks:s.mobileChecks,text:await p.locator('#page').innerText()};
 }catch(e){await shot('failure');throw e;}finally{await p.context().setOffline(false);}
};
