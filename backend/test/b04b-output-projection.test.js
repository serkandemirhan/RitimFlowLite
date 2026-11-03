'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {projectOutput} = require('../src/output-projection');
const event = {id:'e',lotId:'l',workOrderId:'source',kind:'pending',quantity:10};
const decision = {id:'d',eventId:'e',lotId:'l',workOrderId:'source',outcome:'approved',quantity:6};
const reservation = {id:'r',eventId:'e',lotId:'l',workOrderId:'source',destinationWorkOrderId:'next',quantity:4};
test('pending and good remain unavailable without explicit approval', () => {
  for (const kind of ['pending','good']) assert.equal(projectOutput({events:[{...event,kind}],decisions:[],reservations:[]})[0].available, 0);
});
test('partial disposition and reservation preserve provenance and input objects', () => {
  const snapshot = {events:[event],decisions:[decision,{...decision,id:'d2',outcome:'scrap',quantity:2}],reservations:[reservation]};
  const before = JSON.stringify(snapshot), [row] = projectOutput(snapshot);
  assert.deepEqual([row.approved,row.scrap,row.undisposed,row.reserved,row.available],[6,2,2,4,2]);
  assert.equal(JSON.stringify(snapshot),before);
});
test('reject over-disposition, over-reservation, duplicate ids and invalid provenance', () => {
  assert.throws(()=>projectOutput({events:[event],decisions:[decision,{...decision,id:'d2',quantity:5}],reservations:[]}),/OVER_DISPOSITION/);
  assert.throws(()=>projectOutput({events:[event],decisions:[decision],reservations:[{...reservation,quantity:7}]}),/OVER_RESERVATION/);
  assert.throws(()=>projectOutput({events:[event,event],decisions:[],reservations:[]}),/INVALID_IDENTIFIER/);
  assert.throws(()=>projectOutput({events:[event],decisions:[{...decision,lotId:'other'}],reservations:[]}),/INVALID_PROVENANCE/);
  assert.throws(()=>projectOutput({events:[event],decisions:[],reservations:[reservation]}),/OVER_RESERVATION/);
});
test('reject unsafe, negative and non-integer quantities', () => {
  for (const quantity of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>projectOutput({events:[{...event,quantity}],decisions:[],reservations:[]}),/INVALID_QUANTITY/);
});
test('append-only reservation release restores available quantity without changing history', () => {
  const release={id:'rel',reservationId:'r',eventId:'e',lotId:'l',workOrderId:'source',destinationWorkOrderId:'next',quantity:2};
  const snapshot={events:[event],decisions:[decision],reservations:[reservation],releases:[release]};
  const before=JSON.stringify(snapshot),[row]=projectOutput(snapshot);
  assert.deepEqual([row.approved,row.reserved,row.available],[6,2,4]);
  assert.equal(JSON.stringify(snapshot),before);
  assert.throws(()=>projectOutput({...snapshot,releases:[{...release,quantity:5}]}),/OVER_RELEASE/);
  assert.throws(()=>projectOutput({...snapshot,releases:[release,release]}),/INVALID_IDENTIFIER/);
  assert.throws(()=>projectOutput({...snapshot,releases:[{...release,destinationWorkOrderId:'other'}]}),/INVALID_PROVENANCE/);
  assert.throws(()=>projectOutput({...snapshot,reservations:[reservation,{...reservation,id:'r2',quantity:3}]}),/OVER_RESERVATION/);
});
