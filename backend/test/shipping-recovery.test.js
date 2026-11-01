'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {describe,storageKind}=require('../src/recovery-catalog');
const {authorizeRecoveryResource}=require('../src/recovery-resource');
const order='10000000-0000-4000-8000-000000000001',shippingOrder='20000000-0000-4000-8000-000000000002',lot='30000000-0000-4000-8000-000000000003';
test('shipping recovery is capability-bound and preserves only supported replay paths',()=>{
 const command={kind:'shipping',target:order,body:{command:'allocate',orderId:order,shippingOrderId:shippingOrder,payload:{outputLotId:lot,quantity:4}}};
 assert.equal(storageKind(command),'shipping');assert.deepEqual(describe(command),{capability:'shipment.write',suffix:`/orders/${order}/shipping/orders/${shippingOrder}/allocate`,payload:command.body.payload});
 assert.throws(()=>describe({...command,target:lot}),{code:'INVALID_COMMAND'});assert.throws(()=>describe({...command,body:{...command.body,command:'delete'}}),{code:'INVALID_COMMAND'});
});
test('shipping recovery refuses records outside scoped order and shipment',async()=>{
 const command={kind:'shipping',target:order,body:{command:'allocate',orderId:order,shippingOrderId:shippingOrder,payload:{outputLotId:lot,quantity:4}}};
 let n=0;const client={query:async()=>({rowCount:++n===1?1:0})};
 await assert.rejects(authorizeRecoveryResource(client,{tenantId:order,siteId:order},'shipping',command),{statusCode:403});
});
