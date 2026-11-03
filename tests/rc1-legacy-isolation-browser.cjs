/* Characterization only: real native Web Locks, two tabs, disposable fictional origin. */
const { chromium } = require('playwright');
const http = require('node:http');
const assert = require('node:assert/strict');
const { completed } = require('./p0-fixtures.cjs');
const shipping = require('../assets/js/shipment-service.js');
const legacyKey = 'ritimLiteAnonymousDemoV1';
const targetKey = 'ritimLiteAnonymousDemoV1:rc1:v1';
(async () => {
  const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Fictional storage experiment</title>')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,...(process.env.AUDIT_CHROME?{executablePath:process.env.AUDIT_CHROME}:{})});
  const context = await browser.newContext();
  try {
    const a=await context.newPage(), b=await context.newPage();
    const url=`http://127.0.0.1:${server.address().port}/`;
    await Promise.all([a.goto(url),b.goto(url)]);
    const seed=completed(); assert.equal(shipping.release(seed,'SIP-P0',{qty:20}).ok,true);
    await a.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:legacyKey,raw:JSON.stringify(seed)});
    const review=await b.evaluate(key=>localStorage.getItem(key),legacyKey);
    const result=await b.evaluate(async ({legacyKey,targetKey,review})=>navigator.locks.request('fictional-rc1-import',{mode:'exclusive'},()=>{
      if(localStorage.getItem(legacyKey)!==review) return false;
      if(localStorage.getItem(targetKey)!==null) return false;
      localStorage.setItem(targetKey,review);
      return true;
    }),{legacyKey,targetKey,review});
    assert.equal(result,true);
    const after=JSON.parse(await b.evaluate(key=>localStorage.getItem(key),targetKey));
    assert.equal(shipping.ship(after,'SIP-P0',{qty:5,ref:'RC1'}).ok,true);
    await b.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:targetKey,raw:JSON.stringify(after)});
    const targetBefore=await b.evaluate(key=>localStorage.getItem(key),targetKey);
    const old=JSON.parse(review); assert.equal(shipping.ship(old,'SIP-P0',{qty:6,ref:'OLD'}).ok,true);
    await a.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:legacyKey,raw:JSON.stringify(old)});
    assert.equal(await b.evaluate(key=>localStorage.getItem(key),targetKey),targetBefore);
    assert.equal(JSON.parse(await a.evaluate(key=>localStorage.getItem(key),legacyKey)).ux06['SIP-P0'].shipments[0].ref,'OLD');
    await b.reload(); assert.equal(await b.evaluate(key=>localStorage.getItem(key),targetKey),targetBefore);
    console.log('PASS: known fixed-key writer and hypothetical distinct namespace retain separate histories after reload');
    // An unlocked writer changes the source and restores the bytes between reads while the new tab holds a real lock.
    const observed=await b.evaluate(key=>localStorage.getItem(key),legacyKey);
    const handle=await b.evaluateHandle(async ()=>{
      let release, announce; const gate=new Promise(r=>release=r);
      const acquired=new Promise(r=>announce=r);
      const entered=navigator.locks.request('fictional-rc1-import',{mode:'exclusive'},async()=>{announce(); await gate; return true});
      await acquired;
      return {release,entered};
    });
    await a.evaluate(({key,raw})=>{localStorage.setItem(key,raw+' ');localStorage.setItem(key,raw)},{key:legacyKey,raw:observed});
    assert.equal(await b.evaluate(key=>localStorage.getItem(key),legacyKey),observed);
    await handle.evaluate(async h=>{h.release();await h.entered});
    console.log('PASS (risk reproduced): source changed and reverted under lock; byte comparisons cannot observe ABA');
    console.log('2/2 characterization checks; this is not an integrated migration acceptance test');
  } finally { await context.close(); await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1});
