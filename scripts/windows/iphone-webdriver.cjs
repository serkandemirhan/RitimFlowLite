'use strict';
// Real iPhone Safari via the paired Mac. Scripts arrive on stdin, never as files containing credentials.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const key=path.join(process.env.USERPROFILE,'.ssh/ritim_mac_test');
const input=fs.readFileSync(0,'utf8');
const prelude=`
const fs=require('fs');
const dir='/tmp/ritim-iphone-test';
const root='http://127.0.0.1:4728/session/D43DB4DB-172F-4BCF-B842-4A00449E63BE';
async function wd(p,b,method){const r=await fetch(root+p,{method:method||(b?'POST':'GET'),headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined,signal:AbortSignal.timeout(30000)});const j=await r.json();if(j.value?.error)throw Error(JSON.stringify(j.value));return j.value;}
const js=(script,...args)=>wd('/execute/sync',{script,args});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(){await sleep(500);for(let i=0;i<80;i++){if(await js('return document.getElementById("app")?.getAttribute("aria-busy")!=="true" && !document.body.innerText.includes("İşlem sürüyor")'))return;await sleep(400);}throw Error('UI did not settle');}
async function domClick(selector){await js('document.querySelector(arguments[0]).click()',selector);await settle();}
async function el(selector){return (await wd('/element',{using:'css selector',value:selector}))['element-6066-11e4-a52e-4f735466cecf'];}
async function click(selector){return wd('/element/'+await el(selector)+'/click',{});}
async function fill(selector,text){const id=await el(selector);await wd('/element/'+id+'/clear',{});return wd('/element/'+id+'/value',{text});}
async function inspect(){return js('return {url:location.href,text:document.body.innerText.slice(0,10000),inputs:[...document.querySelectorAll("input,textarea,select")].map(e=>({id:e.id,type:e.type,name:e.name})),buttons:[...document.querySelectorAll("button")].map(e=>({text:e.innerText,id:e.id,cls:e.className,disabled:e.disabled}))}');}
async function shot(name){const image=await wd('/screenshot');fs.writeFileSync(dir+'/'+name+'.png',Buffer.from(image,'base64'));const info=await js('return {url:location.href,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,viewport:{height:visualViewport.height,width:visualViewport.width,offsetTop:visualViewport.offsetTop},activeElement:document.activeElement?.id,text:document.body.innerText.slice(0,12000)}');fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(info,null,2));console.log(JSON.stringify({shot:name,...info}));}
(async()=>{${input}\n})().catch(e=>{console.error(e.stack);process.exitCode=1;});
`;
try { process.stdout.write(execFileSync('ssh',['-T','-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=10','user@192.168.1.105','node'],{input:prelude,encoding:'utf8',windowsHide:true,timeout:150000,maxBuffer:8000000})); }
catch(e){process.stdout.write(e.stdout||'');process.stderr.write(e.stderr||e.message);process.exitCode=1;}
