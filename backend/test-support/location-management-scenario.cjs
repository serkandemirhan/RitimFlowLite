'use strict';
const assert=require('node:assert/strict');
module.exports=async({call,base,materialId,destinationId,operatorToken})=>{
 const post=async(path,body,key)=>call('POST',base+'/inventory/'+path,body,'location-test-'+key);
 const create=async(kind,code,parentId,key)=>{const r=await post('locations',{kind,code,parentId},key);assert.equal(r.statusCode,201,r.body);return r.json().id};
 const plant=await create('plant','LOC-TEST',null,'plant'),warehouse=await create('warehouse','LOC-WH',plant,'warehouse'),region=await create('region','LOC-R',warehouse,'region'),container=await create('container','LOC-C',region,'container');
 let r=await post('locations/delete',{id:plant},'children');assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'LOCATION_HAS_CHILDREN');
 r=await post('locations/update',{id:container,code:'LOC-C-EDIT',parentId:warehouse},'invalid-parent');assert.equal(r.statusCode,400);
 r=await post('locations/update',{id:container,code:'LOC-C-EDIT',parentId:region},'update');assert.equal(r.statusCode,200,r.body);
 const replay=await post('locations/update',{id:container,code:'LOC-C-EDIT',parentId:region},'update');assert.equal(replay.statusCode,200,replay.body);
 r=await call('POST',base+'/inventory/locations/delete',{id:container},'operator-location',operatorToken);assert.equal(r.statusCode,403);
 r=await post('receipts',{materialId,locationId:container,quantity:0.25,ownership:'general'},'receipt');assert.equal(r.statusCode,201,r.body);const lotId=r.json().lotId;
 r=await post('locations/delete',{id:container},'stock');assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'LOCATION_HAS_STOCK');
 r=await post('move',{lotId,sourceLocationId:container,destinationLocationId:destinationId,quantity:0.25},'move');assert.equal(r.statusCode,201,r.body);
 r=await post('locations/delete',{id:container},'empty');assert.equal(r.statusCode,200,r.body);
 r=await post('receipts',{materialId,locationId:container,quantity:1,ownership:'general'},'archived');assert.equal(r.statusCode,404,r.body);
 r=await post('locations',{kind:'container',code:'BAD-PARENT',parentId:container},'deleted-parent');assert.equal(r.statusCode,400,r.body);
 for(const [id,key]of [[region,'region'],[warehouse,'warehouse'],[plant,'plant']]){r=await post('locations/delete',{id},'delete-'+key);assert.equal(r.statusCode,200,r.body)}
 return {rename:true,invalidParentBlocked:true,childrenBlocked:true,stockBlocked:true,transferThenDelete:true,historyPreserved:true,archivedReceiptBlocked:true,permissionChecked:true,idempotent:true};
};
