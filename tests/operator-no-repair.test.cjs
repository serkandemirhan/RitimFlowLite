'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function operator(){
 const j={id:'j',order:'o',machine:'CNC',owner:'Ali',state:'running',good:0,scrap:0,op:0,ux05:{received:10,pending:0,setup:0,rework:0,receipts:[]}};
 const fields={'ux05-qty':'2','ux05-type':'pending','ux05-ig':'1','ux05-is':'0','ux05-ir':'5'};
 const c={eventsMarkup:()=>'',operatorJob:null,recordQty:null,setStatus:null,finishJob:null,state:{jobs:[j],orders:[{id:'o'}],events:[],user:'Yönetici'},document:{getElementById:id=>({value:fields[id]})},jo:()=>({id:'o',part:'Mil',route:['Torna']}),jsArg:JSON.stringify,I:()=>'',badge:()=>'',prog:()=>'',commitState:fn=>fn(c.state),RitimTransfers:{consume:()=>({ok:true})},RitimQuality:{canSelf:()=>true,inspect:(s,input)=>{c.inspection=input;return {ok:true}}},RitimQuantities:{jobBalance:()=>({planned:10,unprocessed:10,received:10,unstarted:0,used:0})}};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/js/ux-operator.js','utf8'),c);
 return {c,j,fields};
}

test('operator has normal production and scrap entries, without repair controls or commands',()=>{
 const {c,j,fields}=operator();const html=c.operatorJob(j);
 assert.doesNotMatch(html,/ux05-ir|ux05-rg|ux05-rs|quality-task|RitimUX05\.rework|Rework bekleyen/);
 assert.equal(c.RitimUX05.rework,undefined);
 assert.equal(c.RitimUX05.production('j').ok,true);assert.equal(j.ux05.pending,2);
 fields['ux05-type']='scrap';assert.equal(c.RitimUX05.production('j').ok,true);assert.equal(j.scrap,2);
 fields['ux05-type']='good';assert.equal(c.RitimUX05.production('j').ok,true);assert.equal(j.good,2);
 fields['ux05-type']='rework';c.RitimUX05.production('j');assert.equal(j.ux05.rework,0);
 assert.equal(c.RitimUX05.inspect('j').ok,true);assert.equal(c.inspection.rework,0,'Removed field cannot create repair decisions');
});

test('historical repair quantities remain visible and prevent silently closing unresolved work',()=>{
 const {c,j}=operator();j.ux05.rework=3;
 assert.match(c.operatorJob(j),/Geçmiş tamir kararı/);
 assert.equal(c.RitimUX05.close('j').ok,false);assert.equal(j.ux05.rework,3);assert.equal(j.state,'running');
});
