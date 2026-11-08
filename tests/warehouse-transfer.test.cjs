const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const source=fs.readFileSync('integration/premium-api.js','utf8');
function fn(name){const start=source.indexOf(' function '+name+'('),end=source.indexOf('\n function ',start+1);return source.slice(start,end)}
test('warehouse source eligibility excludes empty and incompatible stock',()=>{
 const inventoryView={balances:[{materialId:'a',quantity:1},{materialId:'b',quantity:2},{materialId:'a',quantity:0}]};
 const eligible=eval('('+fn('warehouseEligibleSources').trim()+')');
 assert.equal(eligible({}).length,2);assert.deepEqual(eligible({materialId:'a'}),[inventoryView.balances[0]]);assert.equal(eligible({materialId:'c'}).length,0);
});
test('single warehouse source is automatic and transfer layout fits desktop and mobile',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();
 await page.setContent('<section class="warehouse-pick-form"><div class="flow-heading"><p></p></div><label><select id="inv-job"><option value="o|j">Job</option></select></label><p id="warehouse-job-context"></p><details class="warehouse-job-search"><summary>Search</summary></details><label><select id="inv-balance"><option value="">Choose</option><option value="l|p">Source</option></select></label><input id="inv-quantity"></section>');
 await page.addStyleTag({content:fs.readFileSync('assets/css/ux-premium-workspace.css','utf8')});
 await page.addScriptTag({content:`const el=id=>document.getElementById(id),h=x=>String(x??''),page='inventory',inventoryTask='pick',inventoryJobsCursor=null,warehouseDraft={job:'o|j'},inventoryView={jobs:[],balances:[{lotId:'l',locationId:'p',materialCode:'Material',lotCode:'LOT-1',quantity:3}]};const job={id:'j',partName:'Part',orderNumber:'ORDER-1',quantity:2,received:0};function warehouseSelectedJob(){return job}function warehouseAvailability(){}function warehouseMaximum(){return 2}function p1Fill(input,value){if(!input.value)input.value=value}function inventoryLocationPath(){return 'Warehouse / Shelf'}${fn('warehouseEligibleSources')}${fn('mountWarehouseTransfer')}${fn('p1WarehouseDefaults')}p1WarehouseDefaults();`});
 assert.equal(await page.locator('#inv-balance').inputValue(),'l|p');assert.equal(await page.locator('#inv-balance').isVisible(),false);assert.equal(await page.locator('.warehouse-transfer-source').count(),1);assert.equal(await page.locator('.warehouse-transfer-target #inv-job').count(),1);
 await page.evaluate(()=>p1WarehouseDefaults());assert.equal(await page.locator('.warehouse-transfer').count(),1);
 for(const width of [390,1280]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 await page.evaluate(()=>{inventoryView.balances.push({lotId:'l2',locationId:'p',quantity:2});el('inv-balance').value='';p1WarehouseDefaults()});assert.equal(await page.locator('#inv-balance').isVisible(),true);assert.equal(await page.locator('#inv-balance').inputValue(),'');
 }finally{await browser.close()}
});
