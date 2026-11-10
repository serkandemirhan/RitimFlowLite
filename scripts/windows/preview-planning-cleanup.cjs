'use strict';
// Read-only live data, with local UI assets intercepted only in this test context.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function(h){
 const p=h.admin,out=path.resolve('artifacts/cloud-release/planning-cleanup');fs.mkdirSync(out,{recursive:true});
 const checks=[];
 async function capture(stage){
  await p.goto('https://flow.getritim.com/?mode=api&view=machine-planning');
  await p.waitForSelector('.planning-studio',{timeout:90000});
  await p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true');
  for(const width of [1440,920,390]){
   await p.setViewportSize({width,height:900});
   await p.evaluate(width=>{if(width<600){const select=document.querySelector('#board-mobile-machine');const machine=[...select.options].find(o=>o.value&&o.value!=='all');if(machine)RitimPremiumAPI.boardMobile(machine.value);}else{RitimPremiumAPI.boardMachine('all');RitimPremiumAPI.guidedMachineView('all');}},width);
   await p.screenshot({path:path.join(out,stage+'-'+width+'.png'),fullPage:true});
   const result=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.board-commandbar .btn')].map(x=>({text:x.textContent.trim(),height:x.getBoundingClientRect().height,overflow:x.scrollWidth>x.clientWidth+2})),alerts:document.querySelectorAll('.planning-pending').length}));
   checks.push({stage,...result});
   if(stage==='after'){assert.equal(result.overflow,false,'Page overflow at '+width);assert.ok(result.buttons.every(b=>b.height<70&&!b.overflow),'Toolbar wraps letters at '+width);}
  }
 }
 await capture('before');
 for(const file of ['integration/premium-api.js','assets/css/ux-premium-workspace.css'])await p.route('**/'+file+'*',route=>route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':'text/css',body:fs.readFileSync(file)}));
 await capture('after');
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Makine planlama — önce / sonra</title><style>body{font:16px system-ui;background:#f4f7fb;color:#203750;margin:24px}main{max-width:1500px;margin:auto}.compare{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;border:1px solid #dbe4ef;border-radius:12px}figure{margin:0}h2{margin-top:36px}@media(max-width:700px){.compare{grid-template-columns:1fr}}</style><main><h1>Makine planlama: daha sade kartlar</h1><p>Canlı verilerle yerel arayüz önizlemesi. Sonra ekranları henüz yayımlanmış sürümü göstermez.</p>'+[1440,920,390].map(w=>'<h2>'+w+' px</h2><div class="compare">'+['before','after'].map(s=>'<figure><figcaption>'+(s==='before'?'Önce':'Sonra')+'</figcaption><a href="'+s+'-'+w+'.png"><img src="'+s+'-'+w+'.png"></a></figure>').join('')+'</div>').join('')+'</main>');
 await p.unrouteAll({behavior:'wait'});
 return {checks,out};
};
