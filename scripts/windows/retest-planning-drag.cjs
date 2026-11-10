'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(h){
 const p=h.admin,s=h.state,ids=s.planningDragVerification.jobs,m1=s.steps['machine-CNC-01'].id,m2=s.steps['machine-CNC-02'].id;
 const out=path.resolve('artifacts/cloud-release/planning-retest');fs.mkdirSync(out,{recursive:true});
 const responses=[],idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 async function open(){await p.goto('https://flow.getritim.com/?mode=api&view=machine-planning');await p.waitForSelector('.planning-studio',{timeout:90000});await idle();await p.getByRole('button',{name:'Tümü',exact:true}).click();}
 async function move(id,target,name,position){
  const pending=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/recovery/')&&r.url().endsWith('/retry'),{timeout:90000});
  await p.locator('[data-job="'+id+'"]').dragTo(target,{...(position?{targetPosition:position}:{}),timeout:20000});
  const response=await pending;responses.push(response.status());assert.equal(response.status(),200,await response.text());await idle();
  await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  console.log('MOVE '+name+' PASS');
 }
 await open();const start=await h.read('/machine-planning');for(const id of ids)assert(start.jobs.some(j=>j.id===id&&j.status==='waiting'),'Test job is no longer waiting');
 await move(ids[0],p.locator('[data-machine="'+m1+'"] .machine-drop-end'),'01-other-machine');
 assert.equal((await h.read('/machine-planning')).jobs.find(j=>j.id===ids[0]).machineId,m1);
 await move(ids[0],p.locator('[data-machine="'+m2+'"] .machine-drop-end'),'02-return');
 await move(ids[0],p.locator('[data-job="'+ids[1]+'"]'),'03-first-position',{x:30,y:12});
 await open();const board=await h.read('/machine-planning');
 const actual=board.jobs.filter(j=>j.machineId===m2).sort((a,b)=>a.schedule.position-b.schedule.position).map(j=>j.id);
 assert.deepEqual(actual,ids);assert.deepEqual(await p.locator('[data-machine="'+m2+'"] [data-job]').evaluateAll(nodes=>nodes.map(n=>n.dataset.job)),ids);
 assert.equal((await h.read('/recovery')).commands.length,0);assert.equal(await p.locator('.planning-pending').count(),0);assert.equal((await p.locator('#api-alert').textContent()).trim(),'');
 await p.screenshot({path:path.join(out,'04-after-reload.png'),fullPage:true});
 const result={time:new Date().toISOString(),status:'PASS',responses,queue:actual,machine:m2,pending:0,newRecords:0};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));s.planningDragRetest=result;h.save();
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><title>Makine taşıma tekrar testi</title><style>body{font:16px system-ui;max-width:1200px;margin:30px auto;background:#f5f7fb;color:#203750}img{width:100%;border:1px solid #dde4ed;border-radius:12px}</style><h1>Tekrar testi geçti</h1><p>Mevcut iki iş kullanıldı; yeni kayıt oluşturulmadı. Üç sürükle-bırak işlemi HTTP 200; sayfa yenilenince sıra korundu. Bekleyen işlem yok.</p>'+['01-other-machine','02-return','03-first-position','04-after-reload'].map((f,i)=>'<h2>'+['CNC-01’e taşıma','CNC-02’ye dönüş','İlk sıraya taşıma','Sayfa yenilendikten sonra'][i]+'</h2><img src="'+f+'.png">').join(''));
 return result;
};
