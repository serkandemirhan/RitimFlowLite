'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,context,origin,ready,ta,sa,errors,responses})=>{
 const out=path.resolve(__dirname,'../artifacts/operator-manager');fs.mkdirSync(out,{recursive:true});
 await page.goto(origin+'/auth/team?tenantId='+ta+'#team');
 await page.getByRole('link',{name:'Operatör Ekranı',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.operator-studio'));
 if(await page.locator('#api-scope').count()){const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===sa);assert(index>=0);await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click();}
 await ready();await page.locator('.operator-studio-heading h2').waitFor();
 assert.equal(await page.locator('.operator-studio-heading h2').innerText(),'Operatör İşleri');
 async function workButton(){if(await page.locator('.operator-job-choice').count()){assert.match(await page.locator('.operator-job-choice').first().innerText(),/Operatör:/);return page.locator('.operator-job-choice').first();}const history=page.locator('.operator-completed-list');if(!await history.evaluate(e=>e.open))await history.locator('summary').click();await history.locator('button').first().waitFor();return history.locator('button').first();}
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844});const button=await workButton();await page.screenshot({path:path.join(out,'list-'+width+'.png'),fullPage:true});
  await button.click();await ready();await page.locator('.operator-manager-notice').waitFor();
  assert.equal(await page.locator('.operator-secondary-actions button:enabled').count(),0);
  assert.equal(await page.locator('button[onclick*="productionAction"]:enabled').count(),0);
  assert.equal(await page.locator('#operator-scrap-dialog').count(),0);
  assert(await page.getByRole('button',{name:'İş emri yönetimini aç',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'detail-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'İş emri yönetimini aç',exact:true}).click();await ready();assert.equal(await page.locator('.api-shell').getAttribute('data-screen'),'job');
  await page.goto(origin+'/?view=operator');await ready();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({status:'PASS',viewports:[1440,390],entryFromTeam:true,managerWithoutOperatorMembership:true,teamList:true,readOnlyPreview:true,managementLink:true,errors,responses},null,2));console.log('Manager operator workspace PASS: team entry, assigned jobs, read-only detail and job management.');
};
