'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,order=s.steps['perf4-order'].id,job=s.steps['perf4-plan'].workOrders[0].id,base='/orders/'+order+'/work-orders/'+job,w=h.worker,out='artifacts/cloud-release/operator-performance',file=out+'/live-actions.json',result=JSON.parse(fs.readFileSync(file));
 result.steps=result.steps.filter(x=>!['scrap','finish'].includes(x.name));result.harnessCorrection='Initial scripted scrap supplied warehouse lot instead of production input lot; UI correctly rejected it. Retested through scrap dialog with its selected input.';
 await w.setViewportSize({width:384,height:721});await w.bringToFront();await w.evaluate(id=>RitimPremiumAPI.openAssigned(id),job);
 const balance=await h.read(base+'/production/balances');assert.equal(balance.status,'running');assert.equal(balance.consumedQuantity,0);
 await w.getByRole('button',{name:'Hurda gir',exact:true}).click();await w.locator('#operator-dialog-qty').fill('1');
 let start=Date.now();await w.getByRole('button',{name:'Hurdayı kaydet',exact:true}).click();await w.waitForFunction(()=>document.getElementById('app').getAttribute('aria-busy')==='false',null,{timeout:120000});result.steps.push({name:'scrap',ms:Date.now()-start});
 assert.equal((await h.read(base+'/production/balances')).outputs.scrap,1);await w.screenshot({path:out+'/scrap.png',fullPage:true});fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify(result.steps.at(-1)));
 start=Date.now();await w.evaluate(()=>RitimPremiumAPI.productionAction('complete'));result.steps.push({name:'finish',ms:Date.now()-start});
 const final=await h.read(base+'/production/balances');assert.equal(final.status,'complete');assert.equal(final.consumedQuantity,1);assert.equal((await h.read('/recovery',w)).commands.length,0);assert.equal(await w.locator('.operator-list-panel>summary').isVisible(),false);assert.equal(await w.locator('.operator-completed-list>summary').isVisible(),true);
 await w.screenshot({path:out+'/finish.png',fullPage:true});result.verified=true;fs.writeFileSync(file,JSON.stringify(result,null,2));return result;
};
