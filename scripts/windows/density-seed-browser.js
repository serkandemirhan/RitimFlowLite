// Run inside the authenticated browser on the authorized tenant. Resume-safe.
globalThis.runDensitySeed=async function(phase,start=0,end=1){
 const prefix='YOGUNLUK-20261109',key='ritim-density:'+prefix,root='/api/v1/sites/e1a19975-91ae-4751-bd52-6155d4c1af79/a90f0723-a46c-483d-ab0c-6e89ca345b6d';
 const state=JSON.parse(localStorage.getItem(key)||'null')||{prefix,root,steps:{},createdAt:new Date().toISOString()};
 const save=()=>localStorage.setItem(key,JSON.stringify(state));
 async function post(name,path,body){if(state.steps[name])return state.steps[name];const response=await fetch(root+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':prefix+'-'+name},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(name+' '+response.status+' '+JSON.stringify(data));state.steps[name]=data;save();return data}
 for(let i=start;i<end;i++){
  const n=String(i+1).padStart(3,'0'),id=prefix+'-'+n;
  if(phase==='customers')await post('customer-'+i,'/master-data/customers',{code:id+'-M',name:prefix+' · '+['Atlas Makina','Marmara Otomotiv','Ege Hidrolik','Anadolu Robotik','Kuzey Ambalaj'][i%5]+' '+n});
  if(phase==='parts')await post('part-'+i,'/master-data/parts',{code:id+'-P',name:prefix+' · '+['Tahrik mili Ø25 × 140','Bağlantı flanşı Ø120','Hidrolik piston gövdesi','Hassas yatak burcu','Redüktör dişlisi'][i%5]+' '+n});
  if(phase==='machines')await post('machine-'+i,'/machine-planning/machines',{code:prefix+'-'+['CNC','FREZE','TORNA','OLCUM'][i%4]+'-'+n});
  if(phase==='orders'){const c=state.steps['customer-'+(i%25)],p=state.steps['part-'+(i%40)];await post('order-'+i,'/orders',{orderNumber:id,customer:c.name,customerId:c.id,partName:p.name,partNumber:p.code,partId:p.id,orderedQuantity:[10,25,50,100,250,500][i%6],dueDate:'2026-11-'+String(1+i%28).padStart(2,'0')})}
  if(phase==='production'){const o=state.steps['order-'+i];await post('production-'+i,'/orders/'+o.id+'/production-orders',{number:id+'-UE',quantity:[10,25,50,100,250,500][i%6],operations:[{name:'CNC işleme',kind:'internal',setupMinutes:15,cycleMinutes:3},{name:'Son kontrol ve paketleme',kind:'internal',setupMinutes:5,cycleMinutes:1}]})}
  if(phase==='plan'){const p=state.steps['production-'+i];const planned=await post('plan-'+i,'/production-orders/'+p.id+'/state',{action:'plan',version:p.version,plannedDate:'2026-11-'+String(1+i%28).padStart(2,'0')});const m=state.steps['machine-'+(i%12)],o=state.steps['order-'+i];for(const j of planned.workOrders)await post('assignment-'+j.id,'/orders/'+o.id+'/work-orders/'+j.id+'/assignment/machine',{machineId:m.id,reason:prefix+' ekran yoğunluk testi'})}
 }
 return {phase,start,end,storedSteps:Object.keys(state.steps).length};
};
