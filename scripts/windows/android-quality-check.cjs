'use strict';
const fs=require('node:fs');
module.exports=async h=>{
 const s=h.state,order=s.steps['android3-order'].id,job=s.steps['android3-plan'].workOrders[0].id,base='/orders/'+order+'/work-orders/'+job;
 const q=await h.read(base+'/quality');
 if(!q.outputs.some(x=>x.qualityRequested&&x.unresolved===2))throw Error('Expected requested quality quantity 2 before approval');
 for(const o of q.outputs.filter(x=>x.qualityRequested&&x.unresolved>0))await h.post('android3-quality-'+o.eventId,base+'/quality/decisions',{eventId:o.eventId,lotId:o.lotId,outputLotId:o.outputLotId,outcome:'approved',quantity:o.unresolved,evidence:'Android kabul testi: uygulama kontrol kaydi, fiziksel olcum yapilmadi.'});
 const result={actor:'manager',method:'authenticated API; not phone quality UI',quality:await h.read(base+'/quality'),balances:await h.read(base+'/production/balances')};
 fs.writeFileSync('artifacts/cloud-release/android-after/quality-check.json',JSON.stringify(result,null,2));return result;
};
