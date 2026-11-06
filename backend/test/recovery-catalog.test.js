'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {describe}=require('../src/recovery-catalog');
const order=randomUUID(),job=randomUUID(),reserve=randomUUID();

test('premium editing, atomic batches, job durations and calendars have fixed replay permissions',()=>{
 const {storageKind}=require('../src/recovery-catalog');for(const [command,capability,suffix,resource] of [['orderUpdate','orders.write',`/orders/${order}/update`,false],['productionBatches','planning.write',`/orders/${order}/production-batches`,false],['jobTiming','planning.write',`/orders/${order}/work-orders/${job}/timing`,true]]){const x={kind:'operation',target:resource?job:order,body:{command,orderId:order,resourceId:resource?job:'',payload:{version:1}}};assert.equal(describe(x).capability,capability);assert.equal(describe(x).suffix,suffix);assert.equal(storageKind(x),'operation:'+command)}
 const x={kind:'machineCalendar',target:job,body:{payload:{version:1}}};assert.equal(storageKind(x),'machineCalendar');assert.equal(describe(x).capability,'planning.write');assert.throws(()=>describe({...x,target:'../orders'}));assert.throws(()=>describe({...x,body:{}}));assert.equal(describe({kind:'productionOrder',target:order,body:{action:'update',payload:{version:1}}}).suffix,`/production-orders/${order}/update`);
});
test('recovery catalog maps only supported commands to fixed endpoints and permissions',()=>{
 assert.deepEqual(describe({kind:'createOrder',target:'',body:{customer:'fixture'}}),{capability:'orders.write',suffix:'/orders',payload:{customer:'fixture'}});
 assert.equal(describe({kind:'plan',target:order,body:{}}).suffix,`/orders/${order}/work-orders`);
 assert.equal(describe({kind:'production',target:job,body:{orderId:order,workOrderId:job,action:'results',payload:{quantity:1}}}).capability,'production.write');
 assert.equal(describe({kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'dispatch',payload:{quantity:1}}}).suffix,`/orders/${order}/output-reservations/${reserve}/dispatches`);
 assert.deepEqual(describe({kind:'operation',target:order,body:{orderId:order,command:'reworkAllocate',payload:{decisionId:reserve,quantity:1}}}),{capability:'quality.write',suffix:`/orders/${order}/rework-allocations`,payload:{decisionId:reserve,quantity:1}});
 assert.deepEqual(describe({kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'reworkRelease',payload:{quantity:1}}}),{capability:'quality.write',suffix:`/orders/${order}/rework-allocations/${reserve}/releases`,payload:{quantity:1}});
 assert.deepEqual(describe({kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'outsourcingPlan',payload:{workOrderNumber:'F',plannedQuantity:1}}}),{capability:'planning.write',suffix:`/orders/${order}/outsourcing/returns/${reserve}/downstream-work-orders`,payload:{workOrderNumber:'F',plannedQuantity:1}});
 assert.deepEqual(describe({kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'reworkWorkOrder',payload:{workOrderNumber:'RW'}}}),{capability:'quality.write',suffix:`/orders/${order}/rework-allocations/${reserve}/work-order`,payload:{workOrderNumber:'RW'}});
});
test('catalog fails closed for arbitrary routes, mismatched resource and unknown operations',()=>{
 for(const x of [{kind:'http://evil',target:'',body:{}},{kind:'createOrder',target:order,body:{}},{kind:'production',target:randomUUID(),body:{orderId:order,workOrderId:job,action:'results',payload:{}}},{kind:'production',target:job,body:{orderId:order,workOrderId:job,action:'../../orders',payload:{}}},{kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'__proto__',payload:{}}}])assert.throws(()=>describe(x));
});

test('master recovery uses fixed entities, actions and management permission',()=>{
 for(const entity of ['customers','parts'])for(const action of ['create','update','delete']){const target=action==='create'?'':order,body={entity,action,payload:{name:'Fixture',version:1}};const descriptor=describe({kind:'masterData',target,body});assert.equal(descriptor.capability,'master.write');assert.equal(descriptor.suffix,'/master-data/'+entity+(target?'/'+target+'/'+action:''))}
 for(const body of [{entity:'../orders',action:'create',payload:{}},{entity:'customers',action:'patch',payload:{}},{entity:'parts',action:'delete',payload:[]}])assert.throws(()=>describe({kind:'masterData',target:order,body}));
});

test('production hierarchy and supplier recovery preserve endpoints and scoped capabilities',()=>{const {storageKind}=require('../src/recovery-catalog');for(const action of ['create','state']){const command={kind:'productionOrder',target:order,body:{action,payload:{quantity:1}}};assert.equal(describe(command).capability,'planning.write');assert.equal(storageKind(command),'productionOrder')}for(const action of ['dispatch','return','complete']){const command={kind:'productionSupplier',target:order,body:{action,workOrderId:job,payload:{quantity:1}}};assert.equal(storageKind(command),'productionSupplier:'+action);assert.equal(describe(command).capability,action==='complete'?'quality.write':'stock.write')}assert.throws(()=>describe({kind:'productionSupplier',target:order,body:{action:'../orders',workOrderId:job,payload:{}}}));});
