'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function(h){
 const s=h.state,out=path.resolve('artifacts/cloud-release/operator-mobile');fs.mkdirSync(out,{recursive:true});
 const order=s.steps['drag-order'],jobs=[s.steps['drag-plan-0'].workOrders[0],s.steps['drag-plan-1'].workOrders[0]];
 const location=s.steps['location-container'].id;
 const stock=await h.post('mobile-stock','/inventory/receipts',{materialId:s.steps.material.id,locationId:location,lotCode:'SAHA-20261107-02-LOT',quantity:2,supplierRef:'Celik Merkezi',documentRef:'SAHA-20261107-02-IRS'});
 for(const j of jobs){await h.post('mobile-assign-'+j.id,'/orders/'+order.id+'/work-orders/'+j.id+'/assignment/operator',{operatorId:h.operatorId,reason:'Mobil saha kabul testi'});await h.post('mobile-pick-'+j.id,'/inventory/pick',{orderId:order.id,workOrderId:j.id,lotId:stock.lotId,sourceLocationId:location,quantity:1});}
 if(!s.steps['mobile-drawing']){
  const doc=await h.admin.context().newPage();await doc.setContent('<h1>SAHA-20261107-02 · Kontrol çizimi</h1><p>Yalnız uygulama kabul testi içindir; üretim talimatı değildir.</p><svg width="500" height="200"><rect x="40" y="65" width="380" height="60" fill="#ddd" stroke="#111"/><path d="M40 160H420M40 150V170M420 150V170" stroke="#111"/><text x="210" y="185">140 mm</text></svg><p>Revizyon: A · Konveyör tahrik mili</p>');
  const pdf=await doc.pdf({format:'A4'});await doc.close();fs.writeFileSync(path.join(out,'drawing.pdf'),pdf);
  await h.post('mobile-drawing','/orders/'+order.id+'/drawings/publish',{revision:'A',reason:'Mobil cizim goruntuleme kabul testi',contentBase64:pdf.toString('base64')});
 }
 await h.role('operator');const p=h.worker;await p.setViewportSize({width:390,height:844});await p.evaluate(async id=>RitimPremiumAPI.openAssigned(id),jobs[0].id);
 await p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true');
 await p.screenshot({path:path.join(out,'01-ready.png'),fullPage:true});
 return {orderId:order.id,jobs:jobs.map(j=>j.id),buttons:await p.getByRole('button').allTextContents(),text:(await p.locator('#page').innerText()).slice(0,6500)};
};
