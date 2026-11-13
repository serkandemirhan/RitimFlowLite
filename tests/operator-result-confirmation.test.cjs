const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{chromium}=require('playwright');
const source=fs.readFileSync('integration/premium-api.js','utf8');
const prompt=source.split('\n').find(x=>x.includes('function productionResultPrompt('));
const action=source.split('\n').find(x=>x.includes('async productionAction(action,override)'));
test('production and scrap confirmation shows separate cumulative totals',()=>{
 const c={};vm.createContext(c);vm.runInContext(prompt,c);
 const view={outputs:{pending:18,good:2,scrap:3,setup_scrap:1}};
 assert.match(c.productionResultPrompt(view,{kind:'pending',quantity:8}),/20 → 28/);
 assert.match(c.productionResultPrompt(view,{kind:'scrap',quantity:2}),/4 → 6/);
 assert.match(c.productionResultPrompt(view,{kind:'setup_scrap',quantity:1}),/ayar hurdası[\s\S]*4 → 5/);
});
test('desktop and touch confirmation cancel never saves; accepting saves once',async()=>{
 const browser=await chromium.launch();try{for(const touch of [false,true]){
  const context=await browser.newContext({viewport:{width:touch?393:1440,height:844},hasTouch:touch,isMobile:touch}),page=await context.newPage();
  await page.setContent('<button id="submit">Kaydet</button>');
  await page.evaluate(({prompt,action})=>{
   Object.assign(window,{busy:false,page:'operator',operatorTeamView:()=>false,navigatorOnline:true,journal:{list:()=>[]},jobSelected:'job',detail:{id:'order'},scope:{},capable:()=>true,productionView:{outputs:{pending:20,scrap:3,setup_scrap:1},lots:[{lotId:'lot',available:30}]},el:()=>null,fieldError:()=>{window.invalid=true},run:async()=>{window.saves++},saves:0,error:'',extras:{}});
   eval(prompt+';window.promptResult=productionResultPrompt');window.productionResultPrompt=window.promptResult;
   window.handler=eval('({'+action+'}).productionAction');
   document.getElementById('submit').onclick=()=>handler('results',{kind:window.kind||'pending',lotId:'lot',quantity:8});
  },{prompt,action});
  for(const kind of ['pending','scrap','setup_scrap']){
   await page.evaluate(kind=>window.kind=kind,kind);
   const before=await page.evaluate(()=>saves);
   page.once('dialog',async d=>{assert.equal(d.type(),'confirm');assert.match(d.message(),kind==='pending'?/20 → 28/:/4 → 12/);await d.dismiss()});
   await page.locator('#submit').click();assert.equal(await page.evaluate(()=>saves),before);
   page.once('dialog',d=>d.accept());await page.locator('#submit').click();assert.equal(await page.evaluate(()=>saves),before+1);
  }
  await context.close();
 }}finally{await browser.close()}
});
