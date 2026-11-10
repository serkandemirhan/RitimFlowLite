'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calendar,advance,estimate}=require('../src/capacity-planning');
const cal={weekdays:[1,2,3,4,5],startMinute:480,endMinute:1020,breakStartMinute:720,breakEndMinute:780};
test('duration edits shift following jobs both ways without reordering or changing other machines',()=>{
 const job=(id,machineId,minutes)=>({id,machineId,quantity:1,produced:0,status:'waiting',timing:{setupMinutes:0,cycleMinutes:minutes},attention:{blockers:[]}});
 const input={machines:[{id:'m',calendar:cal},{id:'other',calendar:cal}],jobs:[job('before','m',60),job('edit','m',60),job('after','m',60),job('unrelated','other',60)]},now=Date.parse('2026-11-09T10:00:00+03:00');
 const initial=estimate(structuredClone(input),now),longer=structuredClone(input);longer.jobs[1].timing.cycleMinutes=120;
 const changed=estimate(longer,now);
 assert.equal(changed.jobs[0].schedule.end,initial.jobs[0].schedule.end);
 assert.equal(changed.jobs[2].schedule.start,'2026-11-09T11:00:00.000Z');
 assert.equal(changed.jobs[3].schedule.end,initial.jobs[3].schedule.end);
 assert.deepEqual(changed.jobs.map(j=>j.schedule.position),initial.jobs.map(j=>j.schedule.position));
 changed.jobs[1].timing.cycleMinutes=30;const shorter=estimate(changed,now);
 assert.equal(shorter.jobs[2].schedule.start,'2026-11-09T08:30:00.000Z');
});
test('capacity skips lunch, overnight and weekends using Istanbul workdays',()=>{
 assert.equal(new Date(advance(Date.parse('2026-11-06T11:30:00+03:00'),90,cal).end).toISOString(),'2026-11-06T11:00:00.000Z');
 assert.equal(new Date(advance(Date.parse('2026-11-06T16:30:00+03:00'),90,cal).end).toISOString(),'2026-11-09T06:00:00.000Z');
 assert.throws(()=>calendar({...cal,weekdays:[]}));assert.throws(()=>calendar({...cal,breakStartMinute:400}));assert.throws(()=>calendar({...cal,endMinute:480}));
});
test('missing duration propagates uncertainty and moving a job recalculates risk',()=>{
 const now=Date.parse('2026-11-06T16:00:00+03:00'),machine={id:'m',calendar:cal},job=(id,cycle)=>({id,machineId:'m',quantity:10,produced:0,status:'waiting',dueDate:'2026-11-06',timing:{setupMinutes:0,cycleMinutes:cycle},attention:{blockers:[]}});
 let b=estimate({machines:[structuredClone(machine)],jobs:[job('a',null),job('b',10)]},now);assert.equal(b.jobs[1].schedule.end,null);assert.equal(b.machines[0].capacity.unknownJobs,2);
 b=estimate({machines:[structuredClone(machine)],jobs:[job('b',10),job('a',null)]},now);assert.equal(b.jobs[0].schedule.late,true);assert.equal(b.jobs[0].schedule.position,1);assert.equal(b.machines[0].capacity.scheduledMinutes,60);assert.equal(b.machines[0].capacity.availableMinutes,60);
});
test('capacity respects a future production date and leaves unassigned jobs without a fabricated end',()=>{
 const now=Date.parse('2026-11-03T08:00:00+03:00'),job={id:'a',machineId:'m',plannedDate:'2026-11-05',quantity:10,produced:0,status:'waiting',dueDate:'2026-11-05',timing:{setupMinutes:10,cycleMinutes:2},attention:{blockers:[]}};
 const board=estimate({machines:[{id:'m',calendar:cal}],jobs:[job,{...structuredClone(job),id:'b',machineId:null}]},now);assert.equal(board.jobs[0].schedule.start,'2026-11-05T05:00:00.000Z');assert.equal(board.jobs[0].schedule.end,'2026-11-05T05:30:00.000Z');assert.equal(board.jobs[1].schedule.end,null);assert.equal(board.jobs[1].schedule.durationMinutes,30);
});
test('seven-day capacity counts work segments and never counts lunch, overnight or weekend as busy',()=>{
 const job={id:'one',machineId:'m',quantity:200,produced:0,status:'waiting',timing:{setupMinutes:0,cycleMinutes:1},attention:{blockers:[]}};
 const b=estimate({machines:[{id:'m',calendar:cal}],jobs:[job]},Date.parse('2026-11-06T16:00:00+03:00'));
 assert.equal(b.horizon.dates.length,7);assert.equal(b.machines[0].capacity.days[0].scheduledMinutes,60);assert.equal(b.machines[0].capacity.days[1].scheduledMinutes,0);assert.equal(b.machines[0].capacity.days[2].availableMinutes,0);assert.equal(b.machines[0].capacity.days[3].scheduledMinutes,140);assert.equal(b.jobs[0].schedule.segments.length,2);assert.equal(b.jobs[0].schedule.segments.reduce((n,s)=>n+(Date.parse(s.end)-Date.parse(s.start))/60000,0),200);
 const lunch=advance(Date.parse('2026-11-06T11:30:00+03:00'),90,cal);assert.equal(lunch.segments.length,2);assert.equal(lunch.segments[0].end,'2026-11-06T09:00:00.000Z');assert.equal(lunch.segments[1].start,'2026-11-06T10:00:00.000Z');
});
test('unknown work has no fabricated segments and partial production does not repeat setup',()=>{
 const jobs=[{id:'one',machineId:'m',quantity:10,produced:2,status:'running',timing:{setupMinutes:100,cycleMinutes:2},attention:{blockers:[]}},{id:'two',machineId:'m',quantity:10,produced:0,status:'waiting',timing:{setupMinutes:0,cycleMinutes:null},attention:{blockers:[]}}];
 const b=estimate({machines:[{id:'m',calendar:cal}],jobs},Date.parse('2026-11-06T08:00:00+03:00'));assert.equal(b.jobs[0].schedule.durationMinutes,16);assert.equal(b.jobs[1].schedule.end,null);assert.deepEqual(b.jobs[1].schedule.segments,[]);assert.equal(b.machines[0].capacity.unknownJobs,1);
});
