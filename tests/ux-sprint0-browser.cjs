/* Sprint 0 regressions; no real user storage. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {fresh}=require('./p0-fixtures.cjs');
const root=path.resolve(process.env.RITIM_APP_ROOT||path.join(__dirname,'..'));
const key='ritimFlowLite:fictional-demo:v1';
(async()=>{
 const server=http.createServer((req,res)=>{const rel=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';const f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf'})[path.extname(f)]||'application/octet-stream');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,...(process.env.AUDIT_CHROME?{executablePath:process.env.AUDIT_CHROME}:{})});let n=0,errors=[];
 async function run(name,seed,fn){const c=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR'});try{await c.addInitScript(({key,raw})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,raw)},{key,raw:JSON.stringify(seed)});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForFunction(()=>window.RitimUX&&window.RitimUX07);await fn(p);console.log('PASS '+name);n++}finally{await c.close()}}
 const split=()=>{const s=fresh({qty:10,planned:5});s.jobs.push({...structuredClone(s.jobs[0]),id:'WO-SECOND',machine:'',good:0});return s};
 try{
  await run('split work-order plan used in list, details, linked order, machine and CSV',split(),async p=>{
   await p.evaluate(()=>go('jobs'));await p.waitForSelector('#results .list-card');const cards=p.locator('#results .list-card');assert.equal(await cards.count(),2);for(let i=0;i<2;i++)assert.match(await cards.nth(i).innerText(),/0\s*\/\s*5\s*adet/);
   await p.evaluate(()=>openJob('WO-P0'));assert.match(await p.locator('#page').innerText(),/0\s*\/\s*5\s*sağlam/);await p.evaluate(()=>openOrder('SIP-P0'));let text=await p.locator('#page').innerText();assert.match(text,/10 adet/);assert.equal((text.match(/0\/5 üretim/g)||[]).length,2);
   await p.evaluate(()=>go('home'));assert.match(await p.locator('.machine-card').first().innerText(),/0\s*\/\s*5/);
   const pending=p.waitForEvent('download');await p.evaluate(()=>exportCSV());const d=await pending;let csv='';for await(const b of await d.createReadStream())csv+=b;assert.match(csv,/"WO-P0"[^\n]*"5"/);assert.match(csv,/"WO-SECOND"[^\n]*"5"/);
  });
  await run('partial historical production is displayed against each job plan',(()=>{const s=split();s.jobs[0].good=2;return s})(),async p=>{await p.evaluate(()=>go('jobs'));await p.waitForSelector('#results .list-card');const a=await p.locator('#results .list-card').first().innerText();assert.match(a,/2\s*\/\s*5/);assert.match(a,/%40/);await p.evaluate(()=>openJob('WO-P0'));assert.match(await p.locator('#page').innerText(),/2\s*\/\s*5\s*sağlam/);});
  await run('unassigned work shows unassigned machine and accurate ownership message',(()=>{let s=split();s.user='Operatör A';return s})(),async p=>{
   await p.evaluate(()=>RitimUX.openProduction('WO-SECOND'));assert.equal(await p.locator('.op-machine-select').inputValue(),'');assert.match(await p.locator('.op-machine-select option:checked').innerText(),/Atanmamış/);
   await p.evaluate(()=>RitimUX.openProduction('WO-P0'));const result=await p.evaluate(()=>RitimUX05.production('WO-P0'));assert.equal(result.ok,false);assert.match(result.message,/operatörü atanmamış/i);assert(!result.message.includes('başka operatöre'));
  });
  await run('rejected machine change restores persisted selection',split(),async p=>{
   await p.evaluate(()=>openJob('WO-SECOND'));const selector=p.locator('[data-work-machine]');assert.equal(await selector.inputValue(),'');await selector.selectOption('CNC-02');await p.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('gerekçesi'));await p.waitForFunction(()=>document.querySelector('[data-work-machine]')?.value==='');assert.equal(await p.evaluate(()=>job('WO-SECOND').machine),'');
  });
  await run('modal focus, tab trap, Escape and trigger restoration',split(),async p=>{
   await p.evaluate(()=>go('orders'));const trigger=p.getByRole('button',{name:'Yeni Sipariş',exact:true}).first();await trigger.click();await p.waitForSelector('.wizard-modal');await p.waitForFunction(()=>document.querySelector('.wizard-modal')?.contains(document.activeElement));
   const focus=()=>p.evaluate(()=>document.querySelector('.wizard-modal').contains(document.activeElement));for(let i=0;i<20;i++){await p.keyboard.press('Tab');assert(await focus())}for(let i=0;i<20;i++){await p.keyboard.press('Shift+Tab');assert(await focus())}
   await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('.wizard-modal'));assert(await trigger.evaluate(e=>document.activeElement===e));
  });
  await run('UX07 historical -2 remains visible with warning and unchanged raw snapshot',(()=>{const s=fresh({qty:5});delete s.jobs[0].plannedQty;s.jobs[0].good=6;s.jobs[0].scrap=1;return s})(),async p=>{
   const raw=await p.evaluate(k=>localStorage.getItem(k),key);const result=await p.evaluate(()=>RitimUX07.audit());assert.equal(result.critical.length,0);assert(result.warningFindings.some(f=>f.code==='LEGACY_PRODUCTION'));assert.equal(result.balances.jobs[0].unstartedPlan,-2);await p.evaluate(()=>go('audit'));assert.match(await p.locator('#page').innerText(),/Başlamamış Plan/);assert.match(await p.locator('#page').innerText(),/-2/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);
  });
  assert.deepEqual(errors,[]);console.log(`${n}/${n} sprint checks; zero unexpected page errors`);
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
