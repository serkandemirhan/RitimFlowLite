'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),L=require('../integration/legacy-recovery');
function storage(initial={}){const m=new Map(Object.entries(initial));return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,removeItem:k=>m.delete(k)}}
test('cleanup removes all legacy records without parsing or touching other keys',()=>{const s=storage({'ritim:api-dev:pending-commands:v1':'malformed secret','ritim:api-dev:order-workflow:v1:x':'secret','demo':'preserve'}),l=storage({'ritim:api-dev:order-workflow:v1':'secret','other':'keep'});assert.equal(L.cleanup([s,l]).removed,3);assert.equal(s.getItem('demo'),'preserve');assert.equal(l.getItem('other'),'keep')});
test('storage failure stops access',()=>{assert.throws(()=>L.cleanup([{get length(){throw Error('denied')}}]),{code:'LEGACY_CLEANUP_FAILED'})});
test('failed removal is detected',()=>{const s=storage({'ritim:api-dev:pending-commands:v1':'secret'});s.removeItem=()=>{};assert.throws(()=>L.cleanup([s]),{code:'LEGACY_CLEANUP_FAILED'})});
