'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('integration/premium-api.js','utf8');
const start=source.indexOf(' function downstreamPanel()');
const end=source.indexOf('\n function ',start+1);
assert.ok(start>=0&&end>start);
function render(outstanding,dispatches){
 const sandbox={extras:{downstream:{supported:true,nextOperation:{name:'İkinci'},outputs:[{lotId:'lot',availableApproved:0,reservations:[{id:'r',outstanding}]}],workOrders:[],dispatches,receipts:[]}},h:String,jsArg:JSON.stringify,capable:()=>true};
 return vm.runInNewContext(source.slice(start,end)+';downstreamPanel()',sandbox);
}
test('a fully dispatched reservation is shown accurately and cannot be dispatched again',()=>{
 const html=render(8,[{id:'d',reservationId:'r',quantity:8,inTransit:3,received:5}]);
 assert.match(html,/Toplam ayrılmış 8 · Sevk edilen 8 · Sevk edilebilir 0/);
 assert.match(html,/movement\('dispatch',"r"\)" disabled>Fiziksel sevk/);
});
test('partial dispatch leaves only the undispatched quantity available',()=>{
 const html=render(8,[{id:'d',reservationId:'r',quantity:3,inTransit:3,received:0}]);
 assert.match(html,/Sevk edilebilir 5/);
 assert.match(html,/max="5" id="reservation-r"/);
});
test('inconsistent physical history fails closed',()=>{
 const html=render(8,[{id:'d',reservationId:'r',quantity:9,inTransit:9,received:0}]);
 assert.match(html,/Miktarlar doğrulanamadı/);
 assert.match(html,/movement\('dispatch',"r"\)" disabled>Fiziksel sevk/);
});
test('common operation statuses and return decisions are understandable in Turkish',()=>{
 const begin=source.indexOf(' const displayStatus=');
 const finish=source.indexOf('\n const shortReference=',begin);
 assert.ok(begin>=0&&finish>begin);
 const labels=vm.runInNewContext(source.slice(begin,finish)+';[displayStatus("complete"),displayStatus("internal"),displayStatus("external"),displayStatus("rework"),displayStatus("scrap"),displayStatus("approved")]',{});
 assert.deepEqual(Array.from(labels),['Tamamlandı','İç operasyon','Fason','Yeniden işleme','Hurda','Onaylı']);
});
test('drawing preview offers a fit-to-width hint and a download',()=>{
 const begin=source.indexOf(' function drawingPanel()');
 const finish=source.indexOf('\n function ',begin+1);
 assert.ok(begin>=0&&finish>begin);
 const html=vm.runInNewContext(source.slice(begin,finish)+';drawingPanel()',{
  drawingInfo:{required:true,revision:'A',publicationId:'pub',acknowledged:false},drawingNotice:'',drawingViewed:null,drawingDocument:'Zml4dHVyZQ==',h:String,jsArg:JSON.stringify,capable:()=>true
 });
 assert.match(html,/#view=FitH/);
 assert.match(html,/PDF indir veya cihazınızda aç/);
 assert.match(html,/disabled>Bu çizimi inceledim/);
});
test('drawing acknowledgement requires the current revision to have been opened',()=>{
 const begin=source.indexOf(' function drawingPanel()'),end=source.indexOf('\n function ',begin+1);
 const context={drawingInfo:{required:true,revision:'B',publicationId:'new',acknowledged:false},drawingNotice:'',drawingViewed:'old',drawingDocument:'JVBERi0=',h:String,jsArg:JSON.stringify,capable:()=>true};
 const panel=vm.runInNewContext(source.slice(begin,end)+';drawingPanel',context);
 assert.match(panel(),/disabled>Bu çizimi inceledim/);
 context.drawingViewed='new';
 assert.doesNotMatch(panel(),/disabled>Bu çizimi inceledim/);
 context.drawingViewed=null;
 assert.match(panel(),/disabled>Bu çizimi inceledim/);
});
test('stale PDF frame cannot unlock acknowledgement for a new revision',()=>{
 const begin=source.indexOf('drawingLoaded(frame,publicationId){');
 const end=source.indexOf('\n async ackDrawing()',begin);
 assert.ok(begin>=0&&end>begin);
 const frame={},stale={},button={disabled:true};
 const context={drawingDocument:'JVBERi0=',drawingInfo:{publicationId:'new',acknowledged:false},drawingViewed:null,capable:()=>true,el:()=>({querySelector:()=>frame,closest:()=>({querySelector:()=>button})})};
 const loaded=vm.runInNewContext('({'+source.slice(begin,end).replace(/,\s*$/,'')+'}).drawingLoaded',context);
 loaded(stale,'old');assert.equal(button.disabled,true);assert.equal(context.drawingViewed,null);
 loaded(frame,'old');assert.equal(button.disabled,true);assert.equal(context.drawingViewed,null);
 loaded(frame,'new');assert.equal(button.disabled,false);assert.equal(context.drawingViewed,'new');
});
