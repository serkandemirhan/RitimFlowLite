'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {describe}=require('../src/recovery-catalog');
const order=randomUUID(),job=randomUUID(),reserve=randomUUID();
test('recovery catalog maps only supported commands to fixed endpoints and permissions',()=>{
 assert.deepEqual(describe({kind:'createOrder',target:'',body:{customer:'fixture'}}),{capability:'orders.write',suffix:'/orders',payload:{customer:'fixture'}});
 assert.equal(describe({kind:'plan',target:order,body:{}}).suffix,`/orders/${order}/work-orders`);
 assert.equal(describe({kind:'production',target:job,body:{orderId:order,workOrderId:job,action:'results',payload:{quantity:1}}}).capability,'production.write');
 assert.equal(describe({kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'dispatch',payload:{quantity:1}}}).suffix,`/orders/${order}/output-reservations/${reserve}/dispatches`);
});
test('catalog fails closed for arbitrary routes, mismatched resource and unknown operations',()=>{
 for(const x of [{kind:'http://evil',target:'',body:{}},{kind:'createOrder',target:order,body:{}},{kind:'production',target:randomUUID(),body:{orderId:order,workOrderId:job,action:'results',payload:{}}},{kind:'production',target:job,body:{orderId:order,workOrderId:job,action:'../../orders',payload:{}}},{kind:'operation',target:reserve,body:{orderId:order,resourceId:reserve,command:'__proto__',payload:{}}}])assert.throws(()=>describe(x));
});
