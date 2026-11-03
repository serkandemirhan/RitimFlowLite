/* Proof of existing validation behavior; no production import is installed. */
const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../assets/js/persistence.js');
const I=require('../assets/js/integrity.js');
const {completed}=require('./p0-fixtures.cjs');
function review(raw) {
  const decoded=P.decode(raw);
  if(!['ready','legacy'].includes(decoded.kind)) return {ok:false,kind:decoded.kind};
  const audit=I.validate(decoded.value);
  return {ok:audit.critical.length===0,kind:decoded.kind,critical:audit.critical};
}
test('schema and integrity preview reads supported fictional snapshot without changing raw bytes',()=>{
  const raw=JSON.stringify(completed());
  assert.equal(review(raw).ok,true); assert.equal(raw,JSON.stringify(completed()));
});
test('malformed and unsupported data are refused',()=>{
  assert.equal(review('{').ok,false);
  const future=completed(); future.schemaVersion=999;
  assert.equal(review(JSON.stringify(future)).ok,false);
});
test('schema-valid over-allocation is rejected by integrity preview',()=>{
  const snapshot=completed({qty:250,planned:150}); snapshot.ux06['SIP-P0'].allocations[0].qty=200;
  const raw=JSON.stringify(snapshot);
  assert.equal(P.decode(raw).kind,'ready');
  assert.equal(review(raw).ok,false);
});
