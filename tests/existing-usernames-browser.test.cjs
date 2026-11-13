'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {render}=require('../backend/src/workspace-admin-page');
test('existing username dialog names the account, preserves credentials, cancels safely and fits mobile',async()=>{
 const b=await chromium.launch();try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const sites=[{id:'s',name:'Merkez',code:'MAIN'}];
  const members=[{id:'a',name:'Yönetici',admin:true,assignments:[]},{id:'u',name:'Eski Operatör',admin:false,assignments:[{siteId:'s',role:'operator'}]},{id:'m',name:'Yeni Operatör',username:'yeni.operator',admin:false,assignments:[{siteId:'s',role:'operator'}]}];
  await p.setContent(render({name:'Atölye',version:1,sites,members},{tenantId:'t',siteId:'s'},'a',false,[],false,true,'/',true));await p.addStyleTag({path:'assets/css/workspace-navigation.css'});await p.addStyleTag({path:'assets/css/workspace-admin-navigation.css'});
  assert.equal(await p.getByRole('button',{name:'Eski Operatör · Kullanıcı adı tanımla',exact:true}).count(),1);
  assert.equal(await p.getByRole('button',{name:'Yeni Operatör · Kullanıcı adı tanımla',exact:true}).count(),0);
  for(const width of [320,393,1366]){
   await p.setViewportSize({width,height:851});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.getByRole('button',{name:'Eski Operatör · Kullanıcı adı tanımla',exact:true}).click();
   const d=p.getByRole('dialog');assert.match(await d.innerText(),/Eski Operatör/);assert.equal(await d.locator('[name=password],[name=email]').count(),0);
   assert.equal(await d.locator('[name=userId]').inputValue(),'u');
   await d.locator('[name=username]').fill('bad name');assert.equal(await d.locator('[name=username]').evaluate(x=>x.checkValidity()),false);
   await d.locator('[name=username]').fill('eski.operator');assert.equal(await d.locator('[name=username]').evaluate(x=>x.checkValidity()),true);
   assert(await p.evaluate(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));
   await d.getByRole('button',{name:'Vazgeç',exact:true}).click();await p.locator('dialog').waitFor({state:'detached'});
  }
  assert.equal(await p.locator('.username-assign [name=username]').inputValue(),'');assert.deepEqual(errors,[]);
 }finally{await b.close()}
});
