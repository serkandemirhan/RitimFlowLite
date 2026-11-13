'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async(context,suite)=>{
 const dir=path.resolve('artifacts/manager-audit',suite);fs.mkdirSync(dir,{recursive:true});const states=[],seen=new Set();
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 return {
  async capture(page){
   if(!page.url().startsWith('http'))return;
   const data=await page.evaluate(()=>({screen:document.querySelector('.api-shell')?.dataset.screen||location.pathname,title:document.querySelector('dialog[open] h2,.modal h2,#page h2,h1')?.textContent||'',text:document.body.innerText,fields:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].map(e=>({id:e.id,name:e.name,value:e.type==='password'?'masked':e.value,checked:e.checked,disabled:e.disabled}))}));
   const key=crypto.createHash('sha256').update(data.screen+data.text+JSON.stringify(data.fields)).digest('hex');if(seen.has(key))return;seen.add(key);
   const file=String(states.length+1).padStart(3,'0')+'-'+data.screen.replace(/[^a-z0-9-]/gi,'-')+'.png';await page.screenshot({path:path.join(dir,file),fullPage:!await page.locator('dialog[open],.modal').count()});
   states.push({file,screen:data.screen,title:data.title,url:new URL(page.url()).pathname+new URL(page.url()).search,viewport:page.viewportSize(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  },
  async stop(error){await context.tracing.stop({path:path.join(dir,'trace.zip')});fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({status:error?'FAIL':'PASS',suite,disposableDatabase:true,physicalDevice:false,error:error?String(error.message).split('\n')[0]:null,stack:error?.stack,states},null,2));console.log('Mobile audit '+suite+': '+states.length+' states, '+(error?'FAIL':'PASS'));}
 };
};
