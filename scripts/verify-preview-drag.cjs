const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto('http://127.0.0.1:62949/?mode=api&view=machine-planning');
  await page.waitForSelector('#modern-resource-scheduler');
  await page.evaluate(()=>RitimPremiumAPI.boardView('queue'));
  await page.locator('[data-job="j2"]').dragTo(page.locator('.machine-lane[data-machine="m0"]'));
  await page.waitForFunction(()=>uiFixture.jobs.find(x=>x.id==='j2').machineId==='m0');
  await page.reload();
  await page.waitForFunction(()=>window.uiFixture&&uiFixture.jobs.find(x=>x.id==='j2').machineId==='m0');
  await page.evaluate(()=>RitimPremiumAPI.boardView('time'));
  await page.waitForSelector('#modern-resource-scheduler');
  const source=page.locator('.scheduler_default_event').filter({hasText:'IE-2026-0004'});
  const target=page.locator('.scheduler_default_event').filter({hasText:'IE-2026-0005'});
  const from=await source.boundingBox(),to=await target.boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await page.mouse.down();
  await page.mouse.move(from.x+from.width/2+5,from.y+from.height/2,{steps:5});
  const dayOffset=await page.evaluate(()=>26*60/uiTestScheduler.cellDuration*uiTestScheduler.cellWidth);
  await page.mouse.move(from.x+from.width/2+dayOffset,to.y+to.height/2,{steps:20});
  await page.mouse.up();
  await page.waitForFunction(()=>uiFixture.jobs.find(x=>x.id==='j3').machineId==='m4',{},{timeout:5000});
  const pinned=await page.evaluate(()=>uiFixture.jobs.find(x=>x.id==='j3').plannedStartAt);
  assert.ok(pinned);
  assert.equal(await page.evaluate(()=>uiFixture.jobs.find(x=>x.id==='j3').schedule.start),pinned);
  await page.reload();
  await page.waitForFunction(()=>window.uiFixture&&uiFixture.jobs.find(x=>x.id==='j3').machineId==='m4');
  assert.equal(await page.evaluate(()=>uiFixture.jobs.find(x=>x.id==='j3').plannedStartAt),pinned);
  assert.equal(await page.evaluate(()=>uiFixture.jobs.find(x=>x.id==='j0').machineId),'m0');
  console.log(JSON.stringify({queueDrag:'PASS',timelineMouseDrag:'PASS',previewReload:'PASS'}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
