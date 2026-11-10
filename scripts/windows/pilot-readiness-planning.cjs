'use strict';
const assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,jobs=s.po.workOrders,base='/orders/'+s.orderId+'/work-orders/';
 await h.post('planning-pause',base+jobs[0].id+'/production/pause',{reason:'Pilot: süre ve kuyruk testi'},'operatorDesktop');
 for(const [i,j] of jobs.entries()){const b=await h.read('/machine-planning');await h.post('planning-queue-'+i,'/machine-planning/move',{workOrderId:j.id,machineId:s.machines[0].id,beforeId:null,revision:b.revision,reason:'Pilot kuyruk testi'});}
 const before=await h.read('/machine-planning'),first=before.jobs.find(x=>x.id===jobs[0].id),next=before.jobs.find(x=>x.id===jobs[1].id);
 await h.post('planning-duration',base+jobs[0].id+'/timing',{version:first.timing.version,setupMinutes:5,cycleMinutes:7});
 const after=await h.read('/machine-planning'),changed=after.jobs.find(x=>x.id===jobs[1].id);
 s.planningEvidence={before:before.jobs.filter(x=>jobs.some(j=>j.id===x.id)),after:after.jobs.filter(x=>jobs.some(j=>j.id===x.id))};h.save();
 assert(next.schedule.start&&changed.schedule.start);assert(new Date(changed.schedule.start)>new Date(next.schedule.start));
 h.check('Sure degisince kuyruk kayar','PASS','Çevrim 2→7 dk; aynı makinedeki sonraki işin plan başlangıcı '+next.schedule.start+' → '+changed.schedule.start+'.','Authenticated API scheduling assertion');
 await h.navigate('admin','machine-planning');await h.shot('15-duration-cascade');
 return {oldStart:next.schedule.start,newStart:changed.schedule.start};
};
