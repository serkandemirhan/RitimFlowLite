'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../integration/production-tracking');
test('operation counts do not sum production quantities or include cancelled work',()=>{
 assert.deepEqual(ui.progress([{status:'complete',quantity:100},{status:'waiting',quantity:100},{status:'cancelled',quantity:100}]),{total:2,done:1});
 assert.equal(ui.approvedFinal([{sequence:0,approved:100,status:'complete'},{sequence:1,approved:35,status:'running'},{sequence:1,approved:4,status:'complete',purpose:'rework'},{sequence:2,approved:100,status:'cancelled'}]),39);
});
test('hierarchy retains production orders with no jobs and unallocated product lines',()=>{
 const order={id:'o',items:[{id:'i',name:'Mil'},{id:'unused',name:'Burç'}],productions:[{id:'p',itemId:'i'}],jobs:[]};
 const ps=ui.groups(order,{tab:'open'});assert.equal(ps.length,2);assert.equal(ps[0].id,'p');assert.equal(ps[1].unplanned,true);
 const completed=ui.groups(order,{tab:'completed'});assert.equal(completed.length,0);
});
test('ready view retains completed production with remaining stock and excludes other products',()=>{
 const order={id:'ready-order',number:'S-1',customer:'Atölye',priority:0,items:[{id:'a'},{id:'b'}],productions:[{id:'pa',itemId:'a',number:'UE-A',shipping:{readyQuantity:3,dispatchedQuantity:7}},{id:'pb',itemId:'b',number:'UE-B',shipping:{readyQuantity:0,dispatchedQuantity:0}}],jobs:[{id:'ja',productionOrderId:'pa',status:'complete',sequence:0,approved:10},{id:'jb',productionOrderId:'pb',status:'waiting',sequence:0,approved:0}],shipping:{readyQuantity:3,products:[]}};
 assert.deepEqual(ui.groups(order,{tab:'ready'}).map(p=>p.id),['pa']);
 order.jobs[0].status='running';ui.reset('ready-test');const html=ui.render({page:1,total:1,orders:[order]},'ready-test');assert(html.includes('Sevke hazır 3 adet'));assert(html.includes('Sevk edilen 7 adet'));assert(html.includes('data-shipping="ready-order"'));
});
test('completed date uses Istanbul calendar, including a UTC previous-day completion',()=>{
 const job={status:'complete',completedAt:'2026-11-11T22:30:00Z'};
 assert.equal(ui.visibleJob(job,{tab:'completed',from:'2026-11-12',to:'2026-11-12'}),true);
 assert.equal(ui.visibleJob(job,{tab:'completed',from:'2026-11-11',to:'2026-11-11'}),false);
 assert.equal(ui.visibleJob({...job,completedAt:null},{tab:'completed'}),null);
});
test('closed and paused work retain their actual status; hold does not pretend to resume',()=>{
 assert.equal(ui.jobState({status:'complete',executionHeld:true}),'Tamamlandı');
 assert.equal(ui.jobState({status:'paused'}),'Duraklatıldı');
 assert.equal(ui.jobState({status:'waiting',supplierOutstanding:2}),'Tedarikçide');
});
test('display escapes user content and keeps exact production parent identifiers',()=>{
 ui.reset('test');const html=ui.render({page:1,total:1,orders:[{id:'o',number:'<script>',customer:'A&B',items:[],productions:[{id:'p',number:'UE',jobs:[]}],jobs:[],priority:0}]},'test');
 assert(html.includes('&lt;script&gt;'));assert(html.includes('A&amp;B'));assert(html.includes('data-production="p"'));assert(!html.includes('<script>'));
});
