const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const line=fs.readFileSync('integration/premium-api.js','utf8').split('\n').find(x=>x.includes('async productionAction(action,override)'));
test('offline and uncertain commands stop before any new production write',async()=>{
 for(const offline of [true,false]){let writes=0;const alert={textContent:''},context={busy:false,navigator:{onLine:!offline},journal:{list:()=>offline?[]:[{kind:'production',body:{workOrderId:'job'}}]},jobSelected:'job',error:'',el:()=>alert,run:()=>{writes++}};vm.createContext(context);vm.runInContext('handler=({'+line+'}).productionAction',context);await context.handler('results');assert.equal(writes,0);assert(alert.textContent.length>0);assert(context.error.length>0);}
});
