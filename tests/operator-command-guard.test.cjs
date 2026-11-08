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
 for(const offline of [true,false]){let writes=0;const alert={textContent:''},context={busy:false,navigator:{onLine:!offline},journal:{list:()=>offline?[]:[{kind:'production',body:{workOrderId:'job'}}]},jobSelected:'job',error:'',el:()=>alert,run:()=>{writes++}};vm.createContext(context);vm.runInContext('handler=({'+line+'}).productionAction',context);await context.handler('results');assert.equal(writes,0);assert(alert.textContent.length>0);assert(context.error.length>0);}
});
