const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
module.exports=async h=>{
 const p=h.worker,out=path.resolve('artifacts/cloud-release/operator-refinement');fs.mkdirSync(out,{recursive:true});
 const results=[];
 for(let i=0;i<2;i++){
  const job=h.state.steps['drag-plan-'+i].workOrders[0].id;
  await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),job);await p.waitForFunction(()=>document.getElementById('app').getAttribute('aria-busy')!=='true');
  for(const width of [390,1440]){await p.setViewportSize({width,height:900});await p.screenshot({path:path.join(out,'live-'+(i?'scrap':'quality')+'-'+width+'.png'),fullPage:true});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  const text=await p.locator('.operator-focus').innerText();assert.equal((text.match(/İş emri tamamlandı/g)||[]).length,1);assert(!text.includes('Girdi lotu'));if(i===0){const decisions=await h.read('/orders/'+h.state.steps['drag-order'].id+'/work-orders/'+job+'/quality/history',p);assert(decisions.decisions[0].actorName);assert(text.includes(decisions.decisions[0].actorName));results.push({qualityActor:decisions.decisions[0].actorName});}
  if(i===0){await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'PDF çizimini aç',exact:true}).click();await p.locator('#drawing-renderer canvas[data-rendered=true]').waitFor({timeout:60000});assert(await p.locator('#drawing-renderer canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let k=0;k<d.length;k+=4)if(d[k]<180&&d[k+3])n++;return n>100}));await p.screenshot({path:path.join(out,'live-pdf.png'),fullPage:true});const w=await p.locator('#drawing-renderer canvas').evaluate(c=>c.width);await p.getByRole('button',{name:'Yakınlaştır',exact:true}).click();await p.waitForFunction(w=>document.querySelector('#drawing-renderer canvas').width>w,w);await p.getByRole('button',{name:'Çizimi kapat',exact:true}).click();results.push({livePdfVisible:true,liveZoom:true});}
 }
 fs.writeFileSync(path.join(out,'live-checks.json'),JSON.stringify(results,null,2));return results;
};
