'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fresh}=require('./p0-fixtures.cjs');
test('demo navigation exposes seven work areas and preserves legacy destinations',async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return} fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(b)});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {browser=await chromium.launch({headless:true,executablePath:process.env.AUDIT_CHROME||undefined});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(seed=>localStorage.setItem('ritimFlowLite:fictional-demo:v1',JSON.stringify(seed)),fresh());const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.waitForSelector('.ritim-main-mobile');
 const before=await p.evaluate(()=>localStorage.getItem('ritimFlowLite:fictional-demo:v1'));
 assert.deepEqual((await p.locator('.ritim-main-mobile button').allTextContents()).slice(0,7),['Genel Bakış','Siparişler','Planlama','Üretim','Kalite','Depo','Lojistik']);
 for(const width of [320,360,375,390,430,768,1440]) { await p.setViewportSize({width,height:900}); assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`horizontal overflow at ${width}px`); }
 await p.setViewportSize({width:390,height:844});
 await p.getByRole('button',{name:'Üretim',exact:true}).last().click();await p.getByRole('button',{name:'Operasyon Transferleri'}).click();assert.equal(await p.locator('#physical-transfer-panel').count(),1);
 await p.getByRole('button',{name:'Depo',exact:true}).last().click();await p.getByRole('button',{name:'Mal Kabul',exact:true}).click();assert.equal(await p.locator('#stock-supplier').count(),1);assert.equal(await p.locator('.ux6-tabs').getByRole('button',{name:'Fason Gönderim'}).count(),0);
 await p.getByRole('button',{name:'Lojistik',exact:true}).last().click();await p.getByRole('button',{name:'Müşteri İadeleri',exact:true}).click();assert.equal(await p.locator('#ux6-shipment').count(),1);assert.equal(await p.locator('.ux6-tabs').getByRole('button',{name:'Malzeme Kabul'}).count(),0);
 await p.evaluate(()=>go('audit'));assert.match(await p.locator('h1').innerText(),/Kontrol|Denetim/);assert.equal(await p.evaluate(()=>localStorage.getItem('ritimFlowLite:fictional-demo:v1')),before);assert.deepEqual(errors,[]);await context.close();
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
