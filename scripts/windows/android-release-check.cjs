'use strict';
const fs=require('node:fs'),path=require('node:path'),{promisify}=require('node:util'),{execFile}=require('node:child_process'),{chromium}=require('playwright');
const exec=promisify(execFile),out=path.resolve('artifacts/cloud-release/android-after'),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
fs.mkdirSync(out,{recursive:true});
const file=path.join(out,'checks.json'),r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{steps:[],shots:[],requests:[]};let p,shooting=false;
const save=()=>fs.writeFileSync(file,JSON.stringify(r,null,2));
async function shot(label){if(shooting)return;shooting=true;try{const name=String(r.shots.length+1).padStart(3,'0')+'-'+label+'.png';const g=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visualHeight:visualViewport.height,refresh:[...document.querySelectorAll('.operator-list-refresh')].map(e=>({width:e.offsetWidth,height:e.offsetHeight}))}));const {stdout}=await exec(adb,['-s','RFCRC1R150K','exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:12000000});fs.writeFileSync(path.join(out,name),stdout);r.shots.push({file:name,label,...g});save()}finally{shooting=false}}
async function step(name,fn){await shot(name+'-before');const t=Date.now(),timer=setInterval(()=>shot(name+'-loading').catch(()=>{}),3000);let error;try{await fn()}catch(e){error=e.message}clearInterval(timer);const ms=Date.now()-t;while(shooting)await new Promise(r=>setTimeout(r,100));await shot(name+'-after');r.steps.push({name,ms,error});save();console.log(JSON.stringify({name,ms,error}));if(error)throw Error(error)}
async function tap(l){await l.scrollIntoViewIfNeeded();const rect=await l.boundingBox(),c=await p.context().newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach()}
const idle=()=>p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:120000});
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:9223');p=b.contexts()[0].pages().find(p=>p.url().startsWith('https://flow.getritim.com/'));if(!p)throw Error('Ritim page missing');p.on('response',res=>{if(res.url().includes('/api/v1/')){r.requests.push({path:new URL(res.url()).pathname+new URL(res.url()).search,status:res.status(),ttfb:res.request().timing().responseStart});save()}});await shot('initial');
 if(process.env.ANDROID_ACTION==='inspect'){console.log(await p.locator('body').innerText());process.exit()}
 if(process.env.ANDROID_ACTION==='finish'){
 const s=JSON.parse(fs.readFileSync('artifacts/cloud-release/scenario/checkpoint.json')),job=s.steps['android3-plan'].workOrders[0].id;
 await step('approved-job',()=>p.evaluate(id=>RitimPremiumAPI.openAssigned(id),job));
 await step('finish',async()=>{await tap(p.getByRole('button',{name:'İş emrini bitir',exact:true}));await idle();await p.getByText('İş emri tamamlandı',{exact:true}).waitFor({timeout:120000})});
 await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await shot('finished-quality');
 const root='/api/v1/sites/e1a19975-91ae-4751-bd52-6155d4c1af79/a90f0723-a46c-483d-ab0c-6e89ca345b6d';
 r.finalCheck=await p.evaluate(async({root,order,job})=>{const get=async url=>{const res=await fetch(root+url);if(!res.ok)throw Error('Read failed '+res.status);return res.json()};const jobs=await get('/orders/'+order+'/work-orders');return {job:jobs.workOrders.find(x=>x.id===job),balances:await get('/orders/'+order+'/work-orders/'+job+'/production/balances'),quality:await get('/orders/'+order+'/work-orders/'+job+'/quality'),recovery:await get('/recovery')};},{root,order:s.steps['android3-order'].id,job});save();console.log(JSON.stringify(r.finalCheck));process.exit();
 }
 if(process.env.ANDROID_ACTION==='active'){
 const s=JSON.parse(fs.readFileSync('artifacts/cloud-release/scenario/checkpoint.json')),job=s.steps['android3-plan'].workOrders[0].id;
 await step('active-job',()=>p.evaluate(id=>RitimPremiumAPI.openAssigned(id),job));
 const click=async(name,scope=p)=>{await tap(scope.getByRole('button',{name,exact:true}));await idle()};
 await step('start',()=>click('İşi başlat'));
 await step('pause-dialog',()=>click('Duraklat'));
 await click('Takım değişimi');await step('pause',()=>click('Duraklat',p.locator('#operator-pause-dialog')));
 await step('resume',()=>click('Devam et'));
 await step('quantity-keyboard',async()=>{await tap(p.locator('#api-production-qty'));await p.locator('#api-production-qty').fill('2');await new Promise(r=>setTimeout(r,700))});
 await step('record-production',()=>click('Üretim gir'));
 await step('scrap-dialog',()=>click('Hurda gir'));
 await step('scrap-keyboard',async()=>{await tap(p.locator('#operator-dialog-qty'));await p.locator('#operator-dialog-qty').fill('1');await new Promise(r=>setTimeout(r,700))});
 await step('record-scrap',()=>click('Hurdayı kaydet'));
 await step('quality-dialog',()=>click('Kalite kontrolü iste'));
 await step('quality-request',()=>click('Talebi gönder'));
 console.log(await p.locator('body').innerText());process.exit();
 }
 await step('refresh',async()=>{await tap(p.locator('.operator-list-refresh'));await idle()});
 await step('completed-history',async()=>{await tap(p.locator('.operator-completed-list summary'));await p.locator('.operator-completed-list button').first().waitFor({timeout:120000});await idle()});
 await step('focused-job',()=>p.evaluate(()=>RitimPremiumAPI.openAssigned('4d66f41a-8d31-488a-80ec-f47990936623')));
 await step('pdf-open',async()=>{await tap(p.locator('.drawing-open'));await p.locator('#drawing-renderer canvas[data-rendered=true]').waitFor({timeout:60000})});
 await step('pdf-zoom',async()=>{const old=await p.locator('#drawing-renderer canvas').evaluate(e=>e.width);await tap(p.locator('[data-action=in]'));await p.waitForFunction(w=>document.querySelector('#drawing-renderer canvas').width>w,old)});
 await step('pdf-pan',async()=>{const v=p.locator('.drawing-viewport'),rect=await v.boundingBox(),c=await p.context().newCDPSession(p),before=await v.evaluate(e=>e.scrollLeft);const x=rect.x+rect.width*.8,y=rect.y+rect.height*.5;await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*25,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();const after=await v.evaluate(e=>e.scrollLeft);r.pan={before,after};if(after===before)throw Error('Pan did not move')});
 await tap(p.locator('#api-drawing-dialog header button'));await shot('pdf-closed');console.log(await p.locator('body').innerText());process.exit()
})().catch(e=>{console.error(e.message);process.exit(1)});
