'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,context,origin,ready,call,base,ta,sa,admin,schema,operator,operatorToken,errors,responses})=>{
 const fixture=await require('../backend/test-support/shipping-workspace-fixture.cjs')({admin,schema,call,base,ta,sa,operator,operatorToken});
 const out=path.resolve(__dirname,'../artifacts/shipping-workspace');fs.mkdirSync(out,{recursive:true});
 await page.goto(origin+'/?view=shipping');
 await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.clarity-shipping-workspace'));
 if(await page.locator('#api-scope').count()){const session=await(await context.request.get(origin+'/api/v1/session')).json(),index=session.memberships.findIndex(m=>m.siteId===sa);assert(index>=0);await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click();}
 await ready();await page.evaluate(()=>RitimPremiumAPI.clarityShippingShow());try{await ready()}catch(e){console.log('Shipping HTTP failures',JSON.stringify(responses));throw e;}
 const eligible=(await call('GET',base+'/shipping/ready-orders')).json();assert(eligible.total>0,'Fixture must contain approved final output');
 await page.locator('#shipping-ready-order').waitFor();await page.locator('#shipping-ready-order').selectOption(fixture.order);await ready();assert.equal(await page.locator('[data-shipping-item]').count(),5);assert.equal(await page.locator('[data-shipping-item]:disabled').count(),3);
 const options=await page.locator('#shipping-ready-order option').evaluateAll(es=>es.filter(e=>e.value).map(e=>({id:e.value,text:e.textContent})));
 assert.deepEqual(options.map(o=>o.id),eligible.items.map(o=>o.id));assert(options.every(o=>/Sevke hazır \d+ adet/.test(o.text)));
 assert.equal(await page.locator('#ship-source').count(),0,'No manual lot selection');assert.equal(await page.locator('#shipping-products-form select').count(),0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:844});await page.screenshot({path:path.join(out,'compose-'+width+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);}
 const orderId=await page.locator('#shipping-ready-order').inputValue(),before=(await call('GET',base+'/orders/'+orderId+'/shipping')).json(),products=(await call('GET',base+'/orders/'+orderId+'/shipping/products')).json();
 const item=products.products.find(p=>p.readyQuantity>=2);assert(item);const quantity=Math.min(7,item.readyQuantity-1);
 await page.locator('[data-shipping-item="'+item.id+'"]').fill(String(quantity));const second=products.products.find(p=>p.id!==item.id&&p.readyQuantity>0);const secondQuantity=3;await page.locator('[data-shipping-item="'+second.id+'"]').fill(String(secondQuantity));const total=quantity+secondQuantity;await page.locator('#shipping-physical-confirm').check();
 await page.getByRole('button',{name:'Sevk et',exact:true}).click();await ready();await page.locator('.shipping-deliver-all').waitFor();
 const after=(await call('GET',base+'/orders/'+orderId+'/shipping')).json();assert.equal(after.totals.dispatched-before.totals.dispatched,total);assert.equal(after.totals.delivered,before.totals.delivered,'Physical exit is not delivery');assert.equal(after.shippingOrders.length,before.shippingOrders.length+1);
 const remaining=(await call('GET',base+'/orders/'+orderId+'/shipping/products')).json();assert.equal(remaining.products.find(p=>p.id===item.id).readyQuantity,item.readyQuantity-quantity);
 await page.screenshot({path:path.join(out,'dispatched-390.png'),fullPage:true});
 page.once('dialog',d=>d.accept());await page.locator('.shipping-deliver-all').click();await ready();
 const delivered=(await call('GET',base+'/orders/'+orderId+'/shipping')).json();assert.equal(delivered.totals.delivered-before.totals.delivered,total);
 await page.screenshot({path:path.join(out,'delivered-390.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({status:'PASS',viewports:[1440,390],eligibleOrdersOnly:true,automaticLots:true,partialQuantity:quantity,remainingReady:item.readyQuantity-quantity,physicalExitSeparateFromDelivery:true,batchDelivery:true,errors,responses},null,2));
 console.log('Shipping workspace PASS: ready-only selector, partial dispatch, automatic lots, separate delivery, desktop and phone.');
};
