'use strict';
const assert=require('node:assert/strict');
module.exports=async({page,ready,call,base,lifecycle,capture,origin})=>{
 const order=lifecycle.orderId,get=async()=>{const r=await call('GET',base+'/orders/'+order+'/rma');assert.equal(r.statusCode,200,r.body);return r.json()};
 await page.evaluate(id=>RitimPremiumAPI.returnFromOrder(id),order);await ready();
 if(!await page.locator('#rma-number').isVisible())await page.getByText('Müşteri iadesi aç',{exact:true}).click();
 const delivery=(await get()).deliveries.find(d=>d.available>0);assert(delivery);await page.locator('#rma-delivery').selectOption(delivery.id);await page.locator('#rma-number').fill('MOBILE-RMA');await page.locator('#rma-reason').fill('Mobil kontrol: müşteri fiziksel iadesi');await page.locator('#rma-qty').fill('1');await capture('return-authorize');await page.getByRole('button',{name:'İadeyi aç',exact:true}).click();await ready();
 let data=await get();const rma=data.returns.find(r=>r.number==='MOBILE-RMA');assert(rma);const quantity=page.locator('#rma-receive-'+rma.id);if(!await quantity.isVisible())await quantity.locator('xpath=ancestor::details[1]').locator(':scope>summary').click();await quantity.fill('1');await capture('return-receive');await page.getByRole('button',{name:'Karantinaya kabul et',exact:true}).click();await ready();
 data=await get();const receipt=data.returns.find(r=>r.id===rma.id).receipts[0];assert(receipt);assert.equal(receipt.quarantined,1);
 await page.goto(origin+'/?view=quality-control&controlSource=return&control='+receipt.id);await ready();await page.locator('#control-outcome').selectOption('approved');await page.locator('#control-quantity').fill('1');await page.locator('#control-note').fill('İade edilen parça fiziksel olarak kontrol edildi.');await capture('return-quality');await page.getByRole('button',{name:'Kalite kararını kaydet',exact:true}).click();await ready();await capture('return-approved');
 assert.equal((await get()).returns.find(r=>r.id===rma.id).receipts[0].approved,1);
 return {authorization:true,physicalReceipt:true,quarantine:true,qualityDecision:true,orderId:order,rmaId:rma.id};
};
