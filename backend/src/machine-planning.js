'use strict';
const crypto=require('node:crypto');
const {data,payload,identifier,str,cmd,scoped,audit,lockedOrder,number,fail}=require('./orders-planning');
async function board(c,s){
 const machines=(await c.query('SELECT id,code,calendar,calendar_version FROM machines WHERE tenant_id=$1 AND site_id=$2 ORDER BY code,id',[s.tenantId,s.siteId])).rows;
 const workCalendar=await require('./site-calendar').read(c,s);for(const m of machines){m.calendar=workCalendar.calendar;m.calendar_version=workCalendar.version}
 const r=await c.query(`SELECT w.id,w.order_id,w.work_order_number,w.status,w.planned_qty,w.queue_position,w.planned_start_at,w.planned_overtime,w.setup_minutes,w.cycle_minutes,w.timing_version,w.production_order_id,op.name,op.sequence,p.number production_number,p.planning_state,p.planned_date::text planned_date,o.order_number,o.customer,o.part_name,a.id assignment_id,a.machine_id,a.user_id,
 COALESCE((SELECT SUM(e.quantity_pieces) FROM effective_production_events e WHERE (e.tenant_id,e.site_id,e.work_order_id)=(w.tenant_id,w.site_id,w.id)),0) produced
 FROM work_orders w JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id) JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id)
 LEFT JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
 LEFT JOIN work_assignments a ON (a.tenant_id,a.site_id,a.work_order_id)=(w.tenant_id,w.site_id,w.id) AND a.released_at IS NULL
 WHERE w.tenant_id=$1 AND w.site_id=$2 AND op.kind='internal' AND o.status='open' AND w.status NOT IN ('complete','cancelled') ORDER BY w.queue_position,w.id LIMIT 2001`,[s.tenantId,s.siteId]);
 if(r.rowCount>2000)fail(409,'BOARD_LIMIT','Planlama panosu 2000 açık iş sınırını aşıyor');
 const attention=r.rowCount?await require('./workflow-summary').facts(c,s,{ids:r.rows.map(x=>x.id)}):[];
 const facts=new Map(attention.map(x=>[x.id,x]));const revision=crypto.createHash('sha256').update(JSON.stringify({machines,rows:r.rows})).digest('hex');
 return require('./capacity-planning').estimate({revision,workCalendar,machines,jobs:r.rows.map(x=>({id:x.id,orderId:x.order_id,number:x.work_order_number,status:x.status,quantity:number(x.planned_qty),produced:number(x.produced),operation:x.name,sequence:x.sequence,productionOrderId:x.production_order_id,productionNumber:x.production_number,plannedOvertime:x.planned_overtime,plannedStartAt:x.planned_start_at?new Date(x.planned_start_at).toISOString():null,planningState:x.planning_state,plannedDate:x.planned_date,orderNumber:x.order_number,customer:x.customer,partName:x.part_name,machineId:x.machine_id,operatorId:x.user_id,dueDate:facts.get(x.id)?.dueDate,attention:facts.get(x.id),timing:{version:x.timing_version,setupMinutes:x.setup_minutes===null?null:Number(x.setup_minutes),cycleMinutes:x.cycle_minutes===null?null:Number(x.cycle_minutes)}}))});
}
function routes(api){const base='/sites/:tenantId/:siteId/machine-planning';
 api.post(base+'/move-preview',req=>{const p=require('./machine-queue-moves').input(payload(req));return scoped(req,async(c,s)=>require('./machine-queue-moves').project(await board(c,s),p).preview)});
 api.post(base+'/move-batch',async(req,reply)=>{const s=data(req),b=payload(req),p={...require('./machine-queue-moves').input(b),reason:str(b.reason,'reason')};const result=await cmd(req,'machine_planning.batch','planning.write',p,async(c,permission)=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['machine-board:'+s.tenantId+':'+s.siteId]);
  const initial=await board(c,s),selected=p.workOrderIds.map(id=>initial.jobs.find(j=>j.id===id));if(selected.some(j=>!j))fail(409,'QUEUE_CHANGED','Selected work is no longer available');
  for(const order of [...new Set(selected.map(j=>j.orderId))].sort())await lockedOrder(c,s,order);
  const current=await board(c,s),projection=require('./machine-queue-moves').project(current,p);
  if(selected.some(job=>job.plannedOvertime)){if(!permission.roles.some(role=>['manager','tenant_admin','superadmin'].includes(role)))fail(403,'FORBIDDEN','Mesai dışı planı yalnız yönetici düzenleyebilir.')}
  for(const job of selected){const previous=(await c.query('SELECT id,user_id FROM work_assignments WHERE tenant_id=$1 AND site_id=$2 AND work_order_id=$3 AND released_at IS NULL FOR UPDATE',[s.tenantId,s.siteId,job.id])).rows[0];if(previous)await c.query('UPDATE work_assignments SET released_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,previous.id]);if(p.machineId||previous?.user_id)await c.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.tenantId,s.siteId,crypto.randomUUID(),job.id,p.machineId,previous?.user_id||null,p.reason]);await audit(c,s,'machine_planning.batch_moved','work_order',job.id,{orderId:job.orderId,previousMachineId:job.machineId,machineId:p.machineId,reason:p.reason,workOrderIds:p.workOrderIds})}
  for(const [i,job]of projection.preview.destinationQueue.entries())await c.query('UPDATE work_orders SET queue_position=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,job.id,(i+1)*1024]);
  return {status:200,body:await board(c,s)};
 });return reply.code(result.status).send(result.body)});
 api.post(base+'/machines',async(req,reply)=>{const s=data(req),b=payload(req),p={code:str(b.code,'code')};const r=await cmd(req,'machine.create','master.write',p,async(c,permission)=>{const id=crypto.randomUUID();await c.query('INSERT INTO machines(tenant_id,site_id,id,code) VALUES($1,$2,$3,$4)',[s.tenantId,s.siteId,id,p.code]);await audit(c,s,'machine.created','machine',id,p);return {status:201,body:{id,...p}}});return reply.code(r.status).send(r.body)});
 api.get(base,req=>scoped(req,(c,s)=>board(c,s)));
 api.post(base+'/move',async(req,reply)=>{const s=data(req),b=payload(req),p={workOrderId:identifier(b.workOrderId),machineId:b.machineId?identifier(b.machineId):null,beforeId:b.beforeId?identifier(b.beforeId):null,revision:str(b.revision,'revision'),reason:str(b.reason,'reason')};
 if(Object.hasOwn(b,'plannedStartAt'))p.plannedStartAt=require('./planned-start').parse(b.plannedStartAt);
 if(Object.hasOwn(b,'plannedOvertime')){if(typeof b.plannedOvertime!=='boolean')fail(400,'INVALID_INPUT','Geçersiz mesai dışı plan bilgisi.');p.plannedOvertime=b.plannedOvertime;if(p.plannedOvertime&&!p.plannedStartAt)fail(400,'INVALID_INPUT','Mesai dışı plan için başlangıç saati gerekli.')}
 if(Object.hasOwn(p,'plannedStartAt')&&!Object.hasOwn(p,'plannedOvertime'))p.plannedOvertime=false;
 if(p.plannedStartAt===null)p.plannedOvertime=false;
 const r=await cmd(req,'machine_planning.move','planning.write',p,async(c,permission)=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['machine-board:'+s.tenantId+':'+s.siteId]);
  const first=await board(c,s),job=first.jobs.find(x=>x.id===p.workOrderId);if(!job)fail(409,'QUEUE_CHANGED','İş artık planlama panosunda değil. Güncel işleri görmek için panoyu yenileyin.');
  await lockedOrder(c,s,job.orderId);const current=await board(c,s);if(current.revision!==p.revision)fail(409,'VERSION_CONFLICT','Pano değişti; yenileyip tekrar deneyin');
  if(p.plannedOvertime||job.plannedOvertime){if(!permission.roles.some(role=>['manager','tenant_admin','superadmin'].includes(role)))fail(403,'FORBIDDEN','Mesai dışı planı yalnız yönetici düzenleyebilir.')}
  if(!['waiting','paused'].includes(job.status))fail(409,'INVALID_STATE','Çalışan işi taşımadan önce duraklatın');
  if(p.machineId&&!current.machines.some(x=>x.id===p.machineId))fail(409,'MACHINE_NOT_FOUND','Makine bu iş yerinde bulunamadı');
  if(p.beforeId===job.id)fail(400,'INVALID_INPUT','İş kendi önüne taşınamaz');
  const queue=current.jobs.filter(x=>x.machineId===p.machineId&&x.id!==job.id);
  const index=p.beforeId?queue.findIndex(x=>x.id===p.beforeId):queue.length;if(index<0)fail(409,'QUEUE_CHANGED','Hedef iş bu kuyrukta değil');if(p.beforeId&&queue[index].status==='running')fail(409,'INVALID_STATE','Çalışan iş sabittir; bekleyen kuyruğa yerleştirin');
  queue.splice(index,0,job);
  require('./planned-start').validateMove(current,job.id,p.machineId,queue,p.plannedStartAt,p.plannedOvertime);
  if(Object.hasOwn(p,'plannedStartAt'))await c.query('UPDATE work_orders SET planned_start_at=$4,planned_overtime=$5 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,job.id,p.plannedStartAt,p.plannedOvertime??false]);
  const previous=(await c.query('SELECT id,user_id FROM work_assignments WHERE tenant_id=$1 AND site_id=$2 AND work_order_id=$3 AND released_at IS NULL FOR UPDATE',[s.tenantId,s.siteId,job.id])).rows[0];
  if(previous)await c.query('UPDATE work_assignments SET released_at=now() WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,previous.id]);
  if(p.machineId||previous?.user_id)await c.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.tenantId,s.siteId,crypto.randomUUID(),job.id,p.machineId,previous?.user_id||null,p.reason]);
  for(const [i,item] of queue.entries())await c.query('UPDATE work_orders SET queue_position=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,item.id,(i+1)*1024]);
  await audit(c,s,'machine_planning.moved','work_order',job.id,{...p,orderId:job.orderId,previousMachineId:job.machineId});return {status:200,body:await board(c,s)};
 });return reply.code(r.status).send(r.body)});
}
module.exports={routes,board};
