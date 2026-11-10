'use strict';
const {fail}=require('./orders-planning');
const {estimate}=require('./capacity-planning');
function parse(value){
 if(value===null)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,'INVALID_INPUT','Başlangıç zamanı saat dilimiyle birlikte geçerli bir tarih olmalı.');
 return new Date(value).toISOString();
}
function validateMove(current,jobId,machineId,queue,plannedStartAt,plannedOvertime){
 const copy=structuredClone(current),job=copy.jobs.find(j=>j.id===jobId);
 job.machineId=machineId;
 if(plannedStartAt!==undefined)job.plannedStartAt=plannedStartAt;
 if(plannedOvertime!==undefined)job.plannedOvertime=plannedOvertime;
 if(!job.plannedStartAt)job.plannedOvertime=false;
 if(job.plannedStartAt&&!machineId)fail(409,'PLANNING_CONFLICT','Sabit başlangıç için bir makine seçin veya başlangıç sabitlemesini kaldırın.');
 if(machineId&&job.attention?.blockers)job.attention.blockers=job.attention.blockers.filter(b=>b.code!=='machine');
 const map=new Map(copy.jobs.map(j=>[j.id,j]));
 copy.jobs=copy.jobs.filter(j=>j.machineId!==machineId).concat(queue.map(j=>map.get(j.id)));
 const result=estimate(copy,Date.parse(current.generatedAt));
 for(const next of result.jobs){
  if(!next.schedule.conflict)continue;
  const previous=current.jobs.find(j=>j.id===next.id);
  if(next.id===jobId||!previous.schedule.conflict||previous.schedule.start!==next.schedule.start)
   fail(409,'PLANNING_CONFLICT',`${next.number}: ${next.schedule.conflictReason}`);
 }
 return result;
}
module.exports={parse,validateMove};
