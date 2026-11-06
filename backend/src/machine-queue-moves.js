'use strict';
const {identifier,str,fail}=require('./orders-planning');
const {estimate}=require('./capacity-planning');
function input(b){if(!b||!Array.isArray(b.workOrderIds)||b.workOrderIds.length<1||b.workOrderIds.length>50)fail(400,'INVALID_INPUT','Select 1–50 work orders');const ids=b.workOrderIds.map(identifier);if(new Set(ids).size!==ids.length)fail(400,'INVALID_INPUT','Duplicate work order');return {workOrderIds:ids,machineId:b.machineId?identifier(b.machineId):null,beforeId:b.beforeId?identifier(b.beforeId):null,revision:str(b.revision,'revision')}}
function project(board,p){
 if(board.revision!==p.revision)fail(409,'VERSION_CONFLICT','Machine board changed');
 const map=new Map(board.jobs.map(j=>[j.id,j])),selected=p.workOrderIds.map(id=>map.get(id));
 if(selected.some(j=>!j))fail(409,'QUEUE_CHANGED','A selected job is no longer in this board');
 if(selected.some(j=>!['waiting','paused'].includes(j.status)))fail(409,'INVALID_STATE','Pause running work before moving it');
 if(p.machineId&&!board.machines.some(m=>m.id===p.machineId))fail(409,'MACHINE_NOT_FOUND','Machine is not in this site');
 if(p.workOrderIds.includes(p.beforeId))fail(400,'INVALID_INPUT','Destination cannot be a selected job');
 const ids=new Set(p.workOrderIds),target=board.jobs.filter(j=>j.machineId===p.machineId&&!ids.has(j.id)).sort((a,b)=>(a.status==='running'?-1:0)-(b.status==='running'?-1:0)),at=p.beforeId?target.findIndex(j=>j.id===p.beforeId):target.length;
 if(at<0)fail(409,'QUEUE_CHANGED','Destination job moved');if(p.beforeId&&target[at].status==='running')fail(409,'INVALID_STATE','Running work stays at the head of its queue');
 const copy=structuredClone(board),copies=new Map(copy.jobs.map(j=>[j.id,j]));
 for(const id of p.workOrderIds){const j=copies.get(id);j.machineId=p.machineId;if(p.machineId&&j.attention?.blockers)j.attention.blockers=j.attention.blockers.filter(b=>b.code!=='machine')}
 const destination=target.map(j=>copies.get(j.id));destination.splice(at,0,...p.workOrderIds.map(id=>copies.get(id)));
 // Source queues retain their relative order; the target uses selection order.
 copy.jobs=copy.jobs.filter(j=>j.machineId!==p.machineId);copy.jobs.push(...destination);
 const after=estimate(copy,Date.parse(board.generatedAt));
 const affectedMachines=new Set([p.machineId,...selected.map(j=>j.machineId)]),changes=after.jobs.filter(j=>affectedMachines.has(j.machineId)).map(j=>({id:j.id,orderId:j.orderId,orderNumber:j.orderNumber,dueDate:j.dueDate,number:j.number,partName:j.partName,selected:ids.has(j.id),fromMachineId:map.get(j.id).machineId,toMachineId:j.machineId,before:map.get(j.id).schedule,after:j.schedule}));
 return {after,preview:{impact:require('./work-guidance').moveImpact(changes),revision:board.revision,workOrderIds:p.workOrderIds,machineId:p.machineId,beforeId:p.beforeId,changes,destinationQueue:destination.map(j=>({id:j.id,number:j.number,partName:j.partName,selected:ids.has(j.id),status:j.status})),capacities:after.machines.filter(m=>affectedMachines.has(m.id)).map(m=>({id:m.id,code:m.code,capacity:m.capacity})),estimatedAt:board.generatedAt}};
}
module.exports={input,project};
