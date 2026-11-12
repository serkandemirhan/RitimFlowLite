const test=require('node:test'),assert=require('node:assert/strict');
const {group,lanes}=require('../backend/src/supplier-planning');
test('supplier columns render beside machines with quantities and return dates',async()=>{
 const fs=require('node:fs'),{chromium}=require('playwright'),source=fs.readFileSync('integration/premium-api.js','utf8');
 const start=source.indexOf(' function mountSupplierPlanning('),end=source.indexOf('\n function ',start+1);
 const browser=await chromium.launch();try{const p=await browser.newPage();await p.setContent('<main class="planning-studio"><div class="machine-board"><section data-machine="m">Torna</section></div></main>');
 await p.evaluate(code=>{window.page='machine-planning';window.boardMode='compact';window.boardActiveMachine=()=> 'all';window.boardVisibleJob=()=>true;window.h=x=>String(x??'').replaceAll('"','&quot;');window.jsArg=x=>h(JSON.stringify(x));window.workspaceDate=x=>x;window.machineBoard={supplierLanes:[{id:'s',name:'Kaplama A',jobs:[{id:'j',productionOrderId:'p',partName:'Mil',operation:'Kaplama',quantity:3,state:'outside',expectedReturnDate:'2026-12-01'}]}]};window.opened=[];window.RitimPremiumAPI={openSupplierJob:(...x)=>opened.push(x)};eval(code+';mountSupplierPlanning()')},source.slice(start,end));
 assert.equal(await p.locator('.machine-board [data-supplier=s]').count(),1);
 assert.match(await p.locator('[data-supplier=s]').innerText(),/3 adet/);assert.match(await p.locator('[data-supplier=s]').innerText(),/2026-12-01/);
 assert.equal(await p.locator('[data-supplier] [draggable=true]').count(),0);await p.locator('.supplier-planning-job').click();assert.deepEqual(await p.evaluate(()=>opened),[['p','j']]);
 }finally{await browser.close()}
});
test('supplier planning separates split dispatches, pending quantities and returns',()=>{
 const base={id:'job',production_order_id:'po',planned_qty:10,part_name:'Mil',operation:'Kaplama'};
 const result=group([{...base,dispatch_id:'d1',supplier_id:'s1',supplier_name:'A',quantity:4,returned:1,expected_return_date:'2026-12-01'},
 {...base,dispatch_id:'d2',supplier_id:'s2',supplier_name:'B',quantity:3,returned:3}]);
 assert.equal(result.find(x=>x.id==='s1').jobs[0].quantity,3);
 assert.equal(result.find(x=>x.id==='s1').jobs[0].expectedReturnDate,'2026-12-01');
 assert.equal(result.some(x=>x.id==='s2'),false);
 assert.equal(result.find(x=>x.id==='pending').jobs[0].quantity,3);
 assert.equal(result.find(x=>x.id==='returned').jobs[0].quantity,4);
});
test('supplier planning scopes external active jobs and enforces board limit',async()=>{
 await lanes({query:async(sql,args)=>{assert.deepEqual(args,['tenant','site']);assert.match(sql,/op.kind='external'/);assert.match(sql,/w.status NOT IN/);return {rows:[]}}},{tenantId:'tenant',siteId:'site'});
 await assert.rejects(()=>lanes({query:async()=>({rows:Array(4001).fill({})})},{}),e=>e.code==='BOARD_LIMIT');
});
