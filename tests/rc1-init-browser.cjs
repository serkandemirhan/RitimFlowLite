/* Bootstrap, recovery and failures in disposable browser contexts. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.env.RITIM_APP_ROOT||path.join(__dirname,'..'));
const key='ritimFlowLite:fictional-demo:v1',old='ritimLiteAnonymousDemoV1';
(async()=>{
 const server=http.createServer((req,res)=>{let rel=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';let f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,...(process.env.AUDIT_CHROME?{executablePath:process.env.AUDIT_CHROME}:{})});
 let checks=0,errors=[];
 async function scenario(name,fn){const ctx=await browser.newContext();try{await fn(ctx);console.log('PASS '+name);checks++;}finally{await ctx.close();}}
 function pageErrors(p){p.on('pageerror',e=>errors.push(e.message));return p;}
 try {
  await scenario('fresh first launch commits one initialization receipt; old bytes unchanged',async c=>{
   await c.addInitScript(({old})=>localStorage.setItem(old,'legacy raw unchanged'),{old});const p=pageErrors(await c.newPage());await p.goto(url);await p.waitForSelector('#page');
   const s=JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key));assert.equal(s.transactionState.revision,1);assert.equal(s.transactionState.commands[0].kind,'demo.initialize');
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),old),'legacy raw unchanged');await p.reload();await p.waitForSelector('#page');assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)).transactionState.revision,1);
  });
  await scenario('quota failure blocks bootstrap with no new snapshot or success',async c=>{
   await c.addInitScript(({key,old})=>{localStorage.setItem(old,'old');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('full','QuotaExceededError');return original.call(this,k,v)}},{key,old});
   const p=pageErrors(await c.newPage());await p.goto(url);await p.locator('#demo-bootstrap-status').waitFor();await p.waitForFunction(()=>document.querySelector('#demo-bootstrap-status')?.textContent.includes('kota'));
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);assert.equal(await p.evaluate(k=>localStorage.getItem(k),old),'old');assert.equal(await p.locator('#page').count(),0);
  });
  await scenario('unsupported Web Locks fails closed',async c=>{
   await c.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));const p=pageErrors(await c.newPage());await p.goto(url);await p.waitForFunction(()=>document.querySelector('#demo-bootstrap-status')?.textContent.includes('kilidi'));
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);assert.equal(await p.locator('#page').count(),0);
  });
  await scenario('malformed isolated snapshot recovery and raw export preserve both keys',async c=>{
   await c.addInitScript(({key,old})=>{localStorage.setItem(key,'{broken');localStorage.setItem(old,'old untouched')},{key,old});const p=pageErrors(await c.newPage());await p.goto(url);await p.waitForSelector('[data-recovery]');
   const downloadPromise=p.waitForEvent('download');await p.locator('#recovery-export').click();const d=await downloadPromise;const stream=await d.createReadStream();let raw='';for await(const chunk of stream)raw+=chunk;assert.equal(raw,'{broken');
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),'{broken');assert.equal(await p.evaluate(k=>localStorage.getItem(k),old),'old untouched');
  });
  await scenario('two fresh tabs converge on one initialization receipt',async c=>{
   const a=pageErrors(await c.newPage()),b=pageErrors(await c.newPage());await Promise.all([a.goto(url),b.goto(url)]);
   for(const p of [a,b]) {if(await p.locator('#demo-bootstrap-retry').count()) await p.locator('#demo-bootstrap-retry').click({timeout:10000}).catch(()=>{});await p.waitForSelector('#page',{timeout:15000});}
   const s=JSON.parse(await a.evaluate(k=>localStorage.getItem(k),key));assert.equal(s.transactionState.commands.filter(x=>x.kind==='demo.initialize').length,1);assert.equal(s.transactionState.revision,1);
  });
  assert.deepEqual(errors,[]);console.log(`${checks}/${checks} bootstrap/recovery checks, no unexpected application errors`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
