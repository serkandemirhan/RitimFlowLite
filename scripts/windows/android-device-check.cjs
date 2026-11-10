'use strict';
// Real-device read-only checks; credentials, when needed, arrive on stdin only.
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{chromium}=require('playwright');
const exec=promisify(execFile),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const out=path.resolve('artifacts/cloud-release/android-device');
const result=process.env.ANDROID_CONTINUE?JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8')):{device:'Samsung SM-A326B / Android 13',started:new Date().toISOString(),steps:[],shots:[],requests:[],errors:[]};
let p,seq=result.shots.length,shooting=false;
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
async function shot(label){if(shooting)return;shooting=true;try{
 const geometry=await p.evaluate(()=>({width:innerWidth,height:innerHeight,visual:{width:visualViewport.width,height:visualViewport.height,top:visualViewport.offsetTop},scrollWidth:document.documentElement.scrollWidth,focus:document.activeElement?.tagName,overflow:[...document.querySelectorAll('main *,#app *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&r.height&&s.visibility!=='hidden'&&r.top<innerHeight&&r.bottom>0&&(r.right>innerWidth+2||r.left<-2)}).slice(0,20).map(e=>({tag:e.tagName,class:e.className,rect:{x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width}}))}));
 const file=String(++seq).padStart(3,'0')+'-'+label+'.png';
 const {stdout}=await exec(adb,['-s','RFCRC1R150K','exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:12*1024*1024});
 fs.writeFileSync(path.join(out,file),stdout);result.shots.push({file,label,time:new Date().toISOString(),...geometry});save();
 }finally{shooting=false}}
async function step(name,fn){await shot(name+'-before');const start=Date.now();let failure;const timer=setInterval(()=>shot(name+'-loading').catch(()=>{}),2500);try{await fn()}catch(e){failure=e.message;result.errors.push({step:name,message:failure})}finally{const actionMs=Date.now()-start;clearInterval(timer);while(shooting)await new Promise(r=>setTimeout(r,100));await shot(name+'-after');const row={name,ms:actionMs,includingCaptureMs:Date.now()-start,error:failure};result.steps.push(row);save();console.log(JSON.stringify(row));}if(failure)throw Error(failure)}
async function tap(locator){await locator.scrollIntoViewIfNeeded();const r=await locator.boundingBox();if(!r)throw Error('Target not visible');const c=await p.context().newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
async function ready(){await p.waitForFunction(()=>window.RitimPremiumAPI&&document.querySelector('.side-btn')&&!document.body.innerText.includes('Oturum doğrulanıyor')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true',null,{timeout:180000})}
(async()=>{fs.mkdirSync(out,{recursive:true});let input='';for await(const c of process.stdin)input+=c;const credentials=input.trim()?JSON.parse(input):{};
 const b=await chromium.connectOverCDP('http://127.0.0.1:9223');p=b.contexts()[0].pages().find(x=>x.url().startsWith('https://flow.getritim.com/'));if(!p)throw Error('Open Ritim Flow in phone Chrome');
 p.on('response',r=>{const u=new URL(r.url());if(u.origin==='https://flow.getritim.com'&&u.pathname.startsWith('/api/')){result.requests.push({path:u.pathname,status:r.status(),ttfbMs:Math.round(r.request().timing().responseStart)});save()}});
 p.on('pageerror',e=>{result.errors.push({message:e.message});save()});
 if(process.env.ANDROID_CONTINUE){
  await ready();
  if(!process.env.ANDROID_PDF_ONLY){
  await step('search-keyboard',async()=>{await tap(p.locator('#operator-query'));await p.locator('#operator-query').fill('CNC');await new Promise(r=>setTimeout(r,800))});
  await p.locator('#operator-query').fill('');await tap(p.locator('h1').first());await new Promise(r=>setTimeout(r,600));await shot('search-dismiss');
  await step('completed-list',async()=>{await tap(p.locator('.operator-completed-list summary'));});
  await step('completed-job',async()=>{const button=p.locator('.operator-completed-list button').filter({hasText:'CNC torna'}).first();await tap(button);await ready();await p.locator('.operator-focus .operator-finish-summary,.operator-focus .operator-studio-job,.operator-focus h3').first().waitFor({timeout:10000}).catch(()=>{});});
  }else await step('drawing-job',async()=>{await p.evaluate(()=>RitimPremiumAPI.openAssigned('4d66f41a-8d31-488a-80ec-f47990936623'));await ready()});
  await p.evaluate(()=>scrollTo(0,0));await shot('job-top');
  const pdf=p.getByRole('button',{name:'PDF çizimini aç',exact:true});
  if(await pdf.count()){
   await step('pdf-open',async()=>{await tap(pdf);await p.locator('#drawing-renderer canvas[data-rendered=true]').waitFor({timeout:60000})});
   const before=await p.locator('#drawing-renderer canvas').evaluate(c=>c.width);
   await step('pdf-zoom',async()=>{await tap(p.getByRole('button',{name:'Yakınlaştır',exact:true}));await p.waitForFunction(w=>document.querySelector('#drawing-renderer canvas').width>w,before)});
   await step('pdf-pan',async()=>{const viewport=p.locator('.drawing-viewport');await viewport.scrollIntoViewIfNeeded();const r=await viewport.boundingBox(),c=await p.context().newCDPSession(p);const before=await viewport.evaluate(e=>e.scrollLeft);const x=r.x+r.width*.8,y=r.y+r.height*.5;await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*25,y}]});await new Promise(r=>setTimeout(r,50))}await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();const after=await viewport.evaluate(e=>e.scrollLeft);result.pan={before,after,moved:after!==before};if(after===before)throw Error('PDF did not pan under touch drag')});
   await tap(p.getByRole('button',{name:'Çizimi kapat',exact:true}));await shot('pdf-closed');
  }else result.errors.push({step:'pdf-open',message:'Selected completed job has no PDF button'});
  await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await shot('job-bottom');save();process.exit(0);
 }
 await shot('initial');
 if(await p.getByRole('button',{name:'Giriş yap',exact:true}).count())await step('open-login',async()=>{await tap(p.getByRole('button',{name:'Giriş yap',exact:true}));await p.locator('[name=email]').waitFor()});
 if(await p.locator('[name=email]').count()){
  await tap(p.locator('[name=email]'));await new Promise(r=>setTimeout(r,800));await shot('email-keyboard');
  if(!credentials.email||!credentials.password)throw Error('Login credentials required on stdin');
  await p.locator('[name=email]').fill(credentials.email);await tap(p.locator('[name=password]'));await new Promise(r=>setTimeout(r,800));await shot('password-keyboard-empty');await p.locator('[name=password]').fill(credentials.password);
  await step('login',async()=>{await tap(p.getByRole('button',{name:'Giriş yap',exact:true}));await p.waitForURL(u=>u.pathname==='/',{timeout:120000});await ready()});
 }
 await ready();await shot('workspace');
 console.log(JSON.stringify({text:(await p.locator('body').innerText()).slice(0,6000)}));
 save();process.exit(0);
})().catch(e=>{result.errors.push({message:e.message});save();console.error(e.message);process.exit(1)});
