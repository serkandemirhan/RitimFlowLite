'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({page,ready,audit})=>{
 const out=path.resolve('artifacts/manager-pwa');
 for(const [view,label]of [['orders','orders'],['jobs','jobs'],['production-monitor','tracking']]){
  await page.evaluate(v=>RitimPremiumAPI.navigate(v),view);await ready();
  for(const width of [360,393,768,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(view==='production-monitor'){if(width<1024)assert(await page.locator('.mgr-tracking-filters>summary').isVisible());else assert(await page.locator('.tracking-search input[name=q]').isVisible())}if(view==='jobs')assert.equal(await page.locator('.manager-job-list').isVisible(),width<1024);await page.screenshot({path:path.join(out,label+'-'+width+'.png'),fullPage:true});if(audit)await audit.capture(page)}
 }
};
