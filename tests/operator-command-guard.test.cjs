const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const line=fs.readFileSync('integration/premium-api.js','utf8').split('\n').find(x=>x.includes('async productionAction(action,override)'));
test('refresh and job switch leave active state intact while a command is pending',async()=>{
 const source=fs.readFileSync('integration/premium-api.js','utf8');
 const handlers=source.split('\n').find(x=>x.includes('async refreshAssigned(){'));
 const context={busy:true,assignedListOpen:false,productionView:{marker:'production'},qualityView:{marker:'quality'},operatorJobId:'original',jobSelected:'original',drawingInfo:{marker:'drawing'},extras:{marker:'extras'}};
 vm.createContext(context);vm.runInContext('handlers=({'+handlers+'})',context);
 await context.handlers.refreshAssigned();await context.handlers.openAssigned('other');
 assert.equal(context.operatorJobId,'original');assert.equal(context.jobSelected,'original');assert.equal(context.assignedListOpen,false);assert.equal(context.productionView.marker,'production');assert.equal(context.qualityView.marker,'quality');assert.equal(context.drawingInfo.marker,'drawing');
});
test('offline and uncertain commands stop before any new production write',async()=>{
 for(const offline of [true,false]){let writes=0;const alert={textContent:''},context={page:'operator',operatorTeamView:()=>false,busy:false,navigator:{onLine:!offline},journal:{list:()=>offline?[]:[{kind:'production',body:{workOrderId:'job'}}]},jobSelected:'job',error:'',el:()=>alert,run:()=>{writes++}};vm.createContext(context);vm.runInContext('handler=({'+line+'}).productionAction',context);await context.handler('results');assert.equal(writes,0);assert(alert.textContent.length>0);assert(context.error.length>0);}
});

test('production refresh checks ownership and permissions without loading unrelated jobs',async()=>{
 const source=fs.readFileSync('integration/premium-api.js','utf8'),start=source.indexOf(' async function refreshOperatorResult('),end=source.indexOf('\n async function',start+10),code=source.slice(start,end),calls=[];
 const current={id:'job',orderId:'order',status:'running',attention:{produced:3}},c={scope:{tenantId:'t',siteId:'s'},caps:[],operatorJobId:'job',assignedJobs:[{id:'job',status:'running'},{id:'other',status:'waiting'}],jobs:[{id:'job',status:'running'}],productionView:{old:true},qualityView:{old:true},extras:{},canOpenOperator:()=>true,api:{selectScope:async()=>({roles:['operator'],capabilities:['production.write']}),production:async()=>({consumedQuantity:3}),quality:async()=>({outputs:[]})},assignedOperatorWorkOrders:async(after,id)=>{calls.push([after,id]);return {workOrders:[current]}},loadExtras:async()=>{calls.push('history')}};
 vm.createContext(c);vm.runInContext(code,c);await c.refreshOperatorResult('order','job');assert.equal(c.productionView.consumedQuantity,3);assert.equal(c.assignedJobs.length,2);assert.equal(c.jobs[0].attention.produced,3);assert.deepEqual(calls,[[null,'job'],'history']);
 c.api.quality=async()=>{throw Error('Connection lost')};await assert.rejects(c.refreshOperatorResult('order','job'),/Connection lost/);assert.equal(c.productionView,null);assert.equal(c.qualityView,null);
 c.assignedOperatorWorkOrders=async()=>({workOrders:[]});await assert.rejects(c.refreshOperatorResult('order','job'),/erişilebilir değil/);assert.equal(c.productionView,null);
});
