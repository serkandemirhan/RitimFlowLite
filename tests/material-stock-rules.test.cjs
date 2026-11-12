const test=require('node:test'),assert=require('node:assert/strict');
const {amount,stockNumber,unitAmount}=require('../backend/src/material-stock');
const {describe,storageKind}=require('../backend/src/recovery-catalog');
test('raw stock accepts decimal quantities without allowing product-piece conversions',()=>{
 assert.equal(amount('2.500001'),2.500001);assert.equal(stockNumber(.1+.2),.3);
 for(const n of [0,-1,'1e3','NaN','Infinity','1.0000001',1e10])assert.throws(()=>amount(n));
 assert.throws(()=>unitAmount({fractional:false},1.5));assert.doesNotThrow(()=>unitAmount({fractional:true},1.5));
});
test('new material commands retain scoped, capability-specific replay destinations',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 for(const [kind,target,path,capability]of [['stockUnit','','/stock-units','master.write'],['rawIssue','','/inventory/raw-issues','stock.write'],['rawReturn',id,'/inventory/raw-issues/'+id+'/return','stock.write'],['incomingInspect',id,'/inventory/lots/'+id+'/inspect','quality.write'],['materialReadiness',id,'/production-orders/'+id+'/material-readiness','planning.write']]){
  const command={kind,target,body:{payload:{}}},d=describe(command);assert.equal(d.suffix,path);assert.equal(d.capability,capability);assert.equal(storageKind(command),kind);
 }
 assert.throws(()=>describe({kind:'rawReturn',target:'../other',body:{payload:{}}}));
});
