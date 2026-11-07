'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../integration/premium-api.js'),'utf8');
const loader=source.slice(source.indexOf('async function loadJobViews('),source.indexOf('async function loadExtras('));
for(const stage of ['drawing','production','quality','extras'])test('job refresh clears stale actionable state when '+stage+' fails',async()=>{
 const failure=Object.assign(new Error('offline'),{code:'NETWORK_ERROR'}),call=name=>async()=>{if(stage===name)throw failure;return {fresh:true}};
 const context=vm.createContext({productionView:{old:true},qualityView:{old:true},extras:{old:true},api:{readOperation:call('drawing'),production:call('production'),quality:call('quality')},loadExtras:call('extras')});
 vm.runInContext(loader,context);
 await assert.rejects(context.loadJobViews('order','job'),{code:'NETWORK_ERROR'});
 assert.equal(context.productionView,null);assert.equal(context.qualityView,null);assert.equal(Object.keys(context.extras).length,0);
});
test('network read failure suggests refresh; uncertain write preserves retry guidance',async()=>{
 const A=require('../integration/api-adapter');let offline=false;
 const api=A.create({token:'fixture',fetcher:async()=>{if(offline)throw Error('offline');return {ok:true,status:200,json:async()=>({})}}});
 await api.selectScope('tenant','site');offline=true;
 await assert.rejects(api.production('order','job'),e=>e.code==='NETWORK_ERROR'&&!e.message.includes('komut anahtarı'));
 await assert.rejects(api.productionCommand('order','job','start',{},'original-key'),e=>e.code==='NETWORK_ERROR'&&e.message.includes('komut anahtarı'));
});
test('operator detail omits order-wide summaries without dropping work-order context',async()=>{
 const start=source.indexOf('async function loadDetail('),end=source.indexOf('\n',start),calls=[];
 const api={order:async()=>({id:'o',route:[{id:'op',sequence:0}]}),workOrders:async()=>({workOrders:[{id:'j'}]}),orderSummary:async()=>{calls.push('summary');return {}},orderEditing:async()=>{calls.push('editing');return {}},availability:async()=>{calls.push('availability');return {}}};
 const context=vm.createContext({api,orders:[],shippingReady:[],orderSummary:{stale:true},orderEditingView:{stale:true}});
 vm.runInContext(source.slice(start,end),context);
 await context.loadDetail('o',false);
 assert.deepEqual(calls,[]);assert.equal(context.orderSummary,null);assert.equal(context.orderEditingView,null);assert.equal(context.jobs[0].id,'j');assert.equal(context.selected,'o');
 await context.loadDetail('o');assert.deepEqual(calls,['editing','summary','availability']);
});
