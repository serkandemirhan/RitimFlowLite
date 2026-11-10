'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function(h){
 const s=h.state,order=s.steps['drag-order'].id,job=s.steps['drag-plan-0'].workOrders[0].id,base='/orders/'+order+'/work-orders/'+job,out=path.resolve('artifacts/cloud-release/operator-mobile');
 const record=(name,detail={})=>{s.mobileChecks.push({name,...detail,time:new Date().toISOString()});h.save();console.log('PASS '+name)};
 const idle=p=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:90000});
 await h.role('quality');let p=h.worker;await p.setViewportSize({width:390,height:844});
 await p.getByRole('button',{name:'Kontrolü aç',exact:true}).first().waitFor({timeout:90000});
 await p.getByRole('button',{name:'Kontrolü aç',exact:true}).first().click();await idle(p);
 try{
  for(const [filename,mime] of [['drawing.pdf','application/pdf'],['03-running.png','image/png']]){
   if(s.mobileChecks.some(x=>x.name==='Mobile upload '+filename))continue;
   await p.locator('#document-add').click();const input=p.locator('[data-upload-context="quality"] .upload-dropzone input');
   const response=p.waitForResponse(r=>r.url().endsWith(base+'/documents')&&r.request().method()==='POST',{timeout:90000});
   await input.setInputFiles(path.join(out,filename));const r=await response;assert(r.ok());
   const body=await r.json();await p.locator('[data-upload-context="quality"] .upload-feedback').filter({hasText:'eklendi'}).waitFor({timeout:90000});
   const stored=await h.read('/work-documents/'+body.id,p);assert.equal(crypto.createHash('sha256').update(Buffer.from(stored.contentBase64,'base64')).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(path.join(out,filename))).digest('hex'));assert.equal(stored.mime,mime);
   await p.screenshot({path:path.join(out,'08-upload-'+(mime==='image/png'?'photo':'pdf')+'.png'),fullPage:true});
   record('Mobile upload '+filename,{status:r.status(),response:body});
   await p.keyboard.press('Escape');
  }
  const q=await h.read(base+'/quality',p);
  if(q.outputs.some(x=>x.unresolved>0)){
   await p.getByRole('button',{name:'Karar ver',exact:true}).first().click();
   await p.locator('#p1-quality-choices button').filter({hasText:/^Onay$/}).click();
   await p.locator('#quality-dialog-evidence').fill('Mobil kabul testi: ölçü ve yüzey kontrolü uygun.');
   await p.getByRole('button',{name:'Kararı Kaydet',exact:true}).click();await idle(p);
   assert.equal((await h.read(base+'/quality',p)).outputs.reduce((a,x)=>a+x.unresolved,0),0);record('Quality approval through mobile UI');
  }
 }catch(e){await p.screenshot({path:path.join(out,'finish-failure.png'),fullPage:true});throw e;}
 await h.role('operator');p=h.worker;await p.setViewportSize({width:390,height:844});
 await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),job);await idle(p);
 await p.screenshot({path:path.join(out,'09-before-finish.png'),fullPage:true});
 await p.getByRole('button',{name:'İşi bitir',exact:true}).click();await idle(p);
 assert.equal((await h.read('/orders/'+order+'/work-orders')).workOrders.find(x=>x.id===job).status,'completed');record('Finish through mobile UI');
 await p.screenshot({path:path.join(out,'10-finished-mobile.png'),fullPage:true});await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'10-finished-desktop.png'),fullPage:true});
 return s.mobileChecks;
};
