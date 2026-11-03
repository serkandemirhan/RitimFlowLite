const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/js/transactions.js');
const P = require('../assets/js/persistence.js');
const S = require('../assets/js/shipment-service.js');
const {fresh, completed} = require('./p0-fixtures.cjs');

const locks = {request: async (name, options, fn) => fn({name, mode:'exclusive'})};
function origin() {
  const values = new Map();
  return {values, storage: {getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v)}};
}
function session(o, key) {return T.open({storage:()=>o.storage, locks:()=>locks, key, initial:fresh()});}
function ship(s, id) {return s.commit(d=>S.ship(d,'SIP-P0',{qty:5,ref:id}), {id,actor:'Yönetici',intent:{kind:'shipping.ship',args:{order:'SIP-P0',qty:5,ref:id}}});}
function seed() {const s=completed(); S.release(s,'SIP-P0',{qty:20}); return s;}

test('explicit fictional upgrade preserves the raw backup and rollback is read-only', async()=>{
  const o=origin(), original=JSON.stringify(seed());
  o.values.set('original',original);
  assert.equal((await T.copy({storage:()=>o.storage,locks:()=>locks,key:'candidate-copy',value:JSON.parse(original)})).ok,true);
  assert.equal(o.values.get('original'),original);
  const s=session(o,'candidate-copy');
  assert.equal((await ship(s,'upgrade-1')).ok,true);
  const updated=o.values.get('candidate-copy');
  assert.equal(session(o,'candidate-copy').revision,1);
  assert.equal(JSON.parse(updated).ux06['SIP-P0'].shipments.length,1);
  assert.ok(['legacy','ready'].includes(P.decode(o.values.get('original')).kind));
  assert.equal(o.values.get('original'),original);
  assert.equal(o.values.get('candidate-copy'),updated);
});

test('separate fictional origins isolate old writers from the candidate snapshot', async()=>{
  const old=origin(), current=origin(), raw=JSON.stringify(seed());
  old.values.set(P.BASE_KEY,raw); current.values.set(P.BASE_KEY,raw);
  assert.equal((await ship(session(current,P.BASE_KEY),'new-origin')).ok,true);
  const persisted=current.values.get(P.BASE_KEY);
  old.storage.setItem(P.BASE_KEY,raw);
  assert.equal(current.values.get(P.BASE_KEY),persisted);
  assert.equal(JSON.parse(persisted).transactionState.revision,1);
});

test('characterization: an unlocked old same-origin writer can overwrite committed history', async()=>{
  const o=origin(), raw=JSON.stringify(seed());
  o.values.set(P.BASE_KEY,raw);
  const current=session(o,P.BASE_KEY);
  assert.equal((await ship(current,'committed-before-old-write')).ok,true);
  assert.equal(JSON.parse(o.values.get(P.BASE_KEY)).transactionState.revision,1);
  o.storage.setItem(P.BASE_KEY,raw); // models a pre-lock client, not a protected command
  assert.equal(current.check().changed,true);
  assert.equal((await ship(current,'after-old-write')).code,'REVISION_ROLLBACK');
  assert.equal(JSON.parse(o.values.get(P.BASE_KEY)).ux06['SIP-P0'].shipments.length,0);
  assert.equal(session(o,P.BASE_KEY).revision,0); // reopening cannot recover lost history
});

test('unsupported fictional future data remains untouched in recovery',()=>{
  const o=origin(), value={...seed(),schemaVersion:999};
  const raw=JSON.stringify(value); o.values.set(P.BASE_KEY,raw);
  assert.equal(session(o,P.BASE_KEY).ready,false);
  assert.equal(o.values.get(P.BASE_KEY),raw);
});
