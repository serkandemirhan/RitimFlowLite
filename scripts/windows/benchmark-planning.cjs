'use strict';
// Computation benchmark, not a database or production throughput claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {estimate}=require('../../backend/src/capacity-planning');
const cal={weekdays:[1,2,3,4,5],startMinute:480,endMinute:1020,breakStartMinute:720,breakEndMinute:780},samples=[];
for(let repeat=0;repeat<4;repeat++){
 const board={machines:Array.from({length:20},(_,i)=>({id:'m'+i,calendar:cal})),jobs:Array.from({length:2000},(_,i)=>({id:'j'+i,machineId:'m'+(i%20),status:'waiting',quantity:10,produced:0,timing:{setupMinutes:2,cycleMinutes:1},attention:{blockers:[]},dueDate:'2026-11-11'}))};
 const started=performance.now(),result=estimate(board,Date.parse('2026-11-04T08:00:00+03:00')),elapsedMs=performance.now()-started;
 assert.equal(result.jobs.length,2000);assert(result.jobs.every(j=>j.schedule.end));assert(result.machines.every(m=>m.capacity.days.length===7));samples.push(Math.round(elapsedMs));
}
const sorted=samples.slice(1).sort((a,b)=>a-b),report={measuredAt:new Date().toISOString(),scope:'Synthetic capacity calculation only; excludes SQL, network and DOM',jobs:2000,machines:20,horizonDays:7,samplesMs:samples,warmMedianMs:sorted[1],node:process.versions.node};
const output=path.resolve(__dirname,'../../artifacts/premium-development/phase4');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'capacity-benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
