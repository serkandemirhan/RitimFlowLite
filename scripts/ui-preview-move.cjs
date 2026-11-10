// Loopback fixture service only; never connects to a database.
module.exports=async function(req,res){
 res.setHeader('content-type','application/json; charset=utf-8');
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000000)throw Error('Fixture too large')}
  const {board,payload:p,kind}=JSON.parse(raw);
  if(kind==='jobTiming'){
   const job=board.jobs.find(j=>j.id===p.workOrderId);
   if(!job||!['waiting','paused'].includes(job.status))throw Error('Süreyi değiştirmek için işi duraklatın.');
   if(job.timing.version!==p.version)throw Error('İş süresi değişti. Sayfayı yenileyin.');
   for(const key of ['setupMinutes','cycleMinutes'])if(p[key]!==null&&(!Number.isFinite(p[key])||p[key]<0||p[key]>10080))throw Error('Geçerli bir süre girin.');
   job.timing={version:p.version+1,setupMinutes:p.setupMinutes,cycleMinutes:p.cycleMinutes};
   const after=require('../backend/src/capacity-planning').estimate(board,Date.parse(board.generatedAt));after.revision='fixture-'+require('node:crypto').randomUUID();res.end(JSON.stringify(after));return;
  }
  if(kind==='siteCalendar'){
   const {normalize}=require('../backend/src/site-calendar');
   if(p.version!==(board.workCalendar?.version||0))throw Error('Takvim değişti.');
   board.workCalendar={calendar:normalize(p.calendar),version:p.version+1};
   for(const m of board.machines){m.calendar=board.workCalendar.calendar;m.calendar_version=board.workCalendar.version}
   const after=require('../backend/src/capacity-planning').estimate(board,Date.parse(board.generatedAt));after.revision='fixture-'+require('node:crypto').randomUUID();res.end(JSON.stringify(after));return;
  }
  const job=board.jobs.find(j=>j.id===p.workOrderId);
  if(!job||!['waiting','paused'].includes(job.status))throw Error('Çalışan işi önce duraklatın.');
  if(board.revision!==p.revision)throw Error('Pano değişti.');
  const queue=board.jobs.filter(j=>j.machineId===p.machineId&&j.id!==job.id).sort((a,b)=>a.schedule.position-b.schedule.position);
  const index=p.beforeId?queue.findIndex(j=>j.id===p.beforeId):queue.length;if(index<0)throw Error('Hedef iş değişti.');queue.splice(index,0,job);
  const {parse,validateMove}=require('../backend/src/planned-start');
  const after=validateMove(board,job.id,p.machineId,queue,Object.hasOwn(p,'plannedStartAt')?parse(p.plannedStartAt):undefined,p.plannedOvertime);
  after.revision='fixture-'+require('node:crypto').randomUUID();
  for(const j of after.jobs)j.machineCode=after.machines.find(m=>m.id===j.machineId)?.code||'';
  res.end(JSON.stringify(after));
 }catch(e){res.statusCode=409;res.end(JSON.stringify({error:e.message}))}
};
