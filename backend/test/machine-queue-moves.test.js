'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {input,project}=require('../src/machine-queue-moves'),{estimate}=require('../src/capacity-planning');
const cal={weekdays:[1,2,3,4,5],startMinute:480,endMinute:1020,breakStartMinute:720,breakEndMinute:780};
test('bulk queue projection preserves chosen order, source order and the untouched input',()=>{
 const m=randomUUID(),n=randomUUID(),ids=Array.from({length:4},randomUUID),jobs=ids.map((id,i)=>({id,machineId:i===3?n:m,status:'waiting',number:'W'+i,quantity:10,produced:0,timing:{setupMinutes:0,cycleMinutes:1},attention:{blockers:[]}})),b=estimate({revision:'r',machines:[{id:m,calendar:cal},{id:n,calendar:cal}],jobs},Date.parse('2026-11-06T08:00:00+03:00')),copy=structuredClone(b),p=input({workOrderIds:[ids[2],ids[0]],machineId:n,beforeId:ids[3],revision:'r'}),result=project(b,p);
 assert.deepEqual(b,copy);assert.deepEqual(result.preview.destinationQueue.map(x=>x.id),[ids[2],ids[0],ids[3]]);assert.deepEqual(result.after.jobs.filter(x=>x.machineId===m).map(x=>x.id),[ids[1]]);assert.equal(result.preview.changes.filter(x=>x.selected).length,2);assert.equal(result.preview.capacities.length,2);
 for(const body of [{...p,workOrderIds:[ids[0],ids[0]]},{...p,workOrderIds:[]},{...p,workOrderIds:Array.from({length:51},randomUUID)}])assert.throws(()=>input(body));
 assert.throws(()=>project(b,{...p,revision:'stale'}),{code:'VERSION_CONFLICT'});assert.throws(()=>project(b,{...p,beforeId:ids[0]}),{code:'INVALID_INPUT'});b.jobs[0].status='running';assert.throws(()=>project(b,p),{code:'INVALID_STATE'});
});
