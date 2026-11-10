'use strict';
// Explicit opt-in: changes only the isolated pilot operator, then restores its saved password.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='https://flow.getritim.com',tenant='0d8438b5-f20b-46af-bb25-c7a42718d256',operator='6a41df19-6071-4520-ad11-a25c1e322ecd';
(async()=>{
 if(!process.argv.includes('--pilot-only'))throw Error('Requires --pilot-only');
 const accounts=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8'));
 assert.equal(accounts.admin.email,'pilot.admin@getritim.com');assert.equal(accounts.operator.email,'pilot.operator@getritim.com');assert(accounts.operator.password.length>=12);
 const out=path.resolve('artifacts/team-admin');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();let attempted=false,restored=false;
 async function login(request,email,password){const r=await request.post(origin+'/auth/login',{form:{email,password},headers:{origin},maxRedirects:0});assert.equal(r.status(),303);assert.equal(r.headers().location,'/','Login rejected');}
 async function update(password){await page.goto(origin+'/auth/team?tenantId='+tenant+'#team');assert((await page.locator('.nav-workspace').innerText()).includes('PILOT TEST 20261110'));const person=page.locator('.person').filter({has:page.locator('input[name=userId][value="'+operator+'"]')});await person.getByRole('button',{name:/Şifre değiştir/}).click();await page.locator('dialog input[name=password]').fill(password);await page.locator('dialog input[name=confirmation]').fill(password);await Promise.all([page.waitForURL(/saved=1/),page.locator('dialog button[type=submit]').click()]);assert(await page.locator('[role=status]').isVisible());}
 try{
 await login(context.request,accounts.admin.email,accounts.admin.password);
 const temporary='Pilot-'+crypto.randomBytes(18).toString('base64url');
 attempted=true;await update(temporary);
 const testContext=await browser.newContext();try{await login(testContext.request,accounts.operator.email,temporary);}finally{await testContext.close();}
 await update(accounts.operator.password);restored=true;
 const restoredContext=await browser.newContext();try{await login(restoredContext.request,accounts.operator.email,accounts.operator.password);}finally{await restoredContext.close();}
 await page.screenshot({path:path.join(out,'live-team.png'),fullPage:true});
 const result={status:'PASS',tenant,temporaryPasswordLogin:true,originalPasswordRestored:true,originalPasswordLogin:true,at:new Date().toISOString()};fs.writeFileSync(path.join(out,'live-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
 if(attempted&&!restored){try{await update(accounts.operator.password);console.log('Original pilot password restored after test interruption.');}catch{console.error('RESTORE REQUIRED: pilot operator password restoration could not be confirmed.');}}
 await browser.close();
 }
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
