const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const go=async query=>{await page.goto('http://127.0.0.1:62949/?mode=api&'+query);await page.waitForLoadState('networkidle')};
 await go('view=quality&order=o3&job=j3');await page.getByRole('button',{name:'Karar ver',exact:true}).click();
 for(const [kind,value] of [['approved','3'],['rejected','1'],['rework','1']])await page.locator('#quality-qty-'+kind).fill(value);
 await page.locator('#quality-dialog-evidence').fill('Ölçüm sonucu: 3 uygun, 1 ret, 1 tamir.');
 assert.match(await page.locator('#quality-distribution-total').innerText(),/5 \/ 5/);
 await page.screenshot({path:'artifacts/native-postgres/workspace-ui/quality-distribution.png'});
 await page.getByRole('button',{name:'Kaydet',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#api-quality-dialog')?.open);
 const output=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ritim-ui-preview-quality')).j3[0]);assert.deepEqual([output.approved,output.rejected,output.reworkPending,output.unresolved],[3,1,1,0]);
 await go('view=detail&order=o0');await page.locator('#execution-control-open').click();
 await page.locator('#execution-reason').fill('Demo duruş kontrolü');await page.locator('.execution-confirm input').check();await page.getByRole('button',{name:'Uygula',exact:true}).click();await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ritim-preview-execution'))?.orders.find(o=>o.id==='o0').executionHold);
 await page.locator('#execution-control-open').click();assert.equal(await page.locator('#execution-action').inputValue(),'resume');await page.locator('#execution-reason').fill('Sorun giderildi');await page.locator('.execution-confirm input').check();await page.getByRole('button',{name:'Uygula',exact:true}).click();await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ritim-preview-execution'))?.orders.find(o=>o.id==='o0').executionHold===false);
 await go('view=production-order&order=p1');await page.locator('#execution-control-open').waitFor({timeout:5000});await page.locator('#execution-control-open').click();await page.locator('#execution-action').selectOption('cancel');await page.locator('#execution-reason').fill('Demo iptal kontrolü');await page.locator('.execution-confirm input').check();await page.screenshot({path:'artifacts/native-postgres/workspace-ui/execution-control.png'});await page.getByRole('button',{name:'Uygula',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ritim-preview-execution'))?.jobs.find(j=>j.id==='j1').status==='cancelled');
 await go('view=overview');assert.equal(await page.locator('.overview-section').count(),2);assert.equal(await page.locator('.overview-section .overview-section').count(),0);assert.equal(await page.locator('details.ergonomic-priorities,details.guidance-all-tasks').count(),0);await page.screenshot({path:'artifacts/native-postgres/workspace-ui/overview.png'});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await go('view=quality&order=o6&job=j6');await page.getByRole('button',{name:'Karar ver',exact:true}).click();assert(await page.locator('#api-quality-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.deepEqual(errors,[]);console.log('PASS: mixed quality save, hold/resume, production cancellation, overview hierarchy and mobile');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
