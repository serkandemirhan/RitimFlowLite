const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const source=fs.readFileSync('integration/premium-api.js','utf8'),functionLine=name=>source.split('\n').find(line=>line.startsWith(' function '+name+'('));
const helpers=['qualityScreenOriginal','qualityScreen','qualityDocumentLinks'].map(functionLine).join('\n');
const refine=source.slice(source.indexOf(' function refineQuality(){'),source.indexOf(' function refineReturns(){'));
const output={eventId:'production-record-123',outputLotId:'4ba65fb0-94e9-4d10-872c-bb1ad7f4bdc0',approved:2,rejected:0,unresolved:0,reworkPending:0};
async function fixture(run,options={}){
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div class="ritim-ui api-shell"><main id="page"></main></div>');
  await page.addStyleTag({content:fs.readFileSync('index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1]});
  for(const file of ['assets/css/ux-premium-workspace.css','assets/vendor/ui/tabler.scoped.css','assets/css/modern-ui.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  for(const file of ['integration/transient-panels.js','integration/visual-clarity.js','integration/workspace-polish.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(({helpers,refine,output,options})=>{
   Object.assign(window,{h:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),jsArg:x=>h(JSON.stringify(x)),page:'quality',jobSelected:'job',detail:{id:'order',partName:'Konveyör Tahrik Mili Ø25 × 140'},jobs:[{id:'job',partName:'Konveyör Tahrik Mili Ø25 × 140',workOrderNumber:'IE-2026-0006',operation:{name:'CNC torna'}}],assignedJobs:[],qualityView:{outputs:[{...output,...options.output}],unavailable:!!options.unavailable},capable:()=>!options.readOnly,shortReference:x=>x.slice(0,8),displayStatus:x=>({approved:'Onaylı',pending:'Bekliyor',scrap:'Hurda'})[x]||x,outcomeIcon:()=>'',operationsTemplate:html=>{const t=document.createElement('template');t.innerHTML=html;return t},refineState:(title,body,state)=>'<section class="refine-state-card is-'+state+'"><strong>'+title+'</strong><p>'+body+'</p></section>',extras:{qualityHistory:{decisions:[{id:'decision',outcome:'approved',quantity:2,evidence:'Ölçüler uygun <kontrol>',actorName:'Kalite Kullanıcısı',occurredAt:'2026-11-12T08:00:00Z',outputLotId:output.outputLotId,documents:[{id:'doc',filename:'Ölçüm.pdf'}]}]},productionHistory:{events:[{eventId:'production-record-123',kind:'pending',quantity:2,outputLotId:output.outputLotId},{eventId:'scrap-record',kind:'scrap',quantity:1}]}}});
   if(options.empty)qualityView.outputs=[];
   window.calls=[];window.RitimPremiumAPI={qualitySection:history=>calls.push(['queue',history]),documentOpen:id=>calls.push(['document',id]),openRepair:()=>calls.push(['repair']),openRecovery:()=>calls.push(['recovery']),openLotTrace:id=>calls.push(['trace',id]),openQualityDialog:index=>{calls.push(['decision',index]);document.getElementById('api-quality-dialog').showModal()},qualityDistributionChanged:()=>{},submitQualityDialog:()=>calls.push(['save'])};
   eval(helpers+'\n'+refine+'\ndocument.getElementById("page").innerHTML=qualityScreen();refineQuality();');
   RitimFormErgonomics.mount({page:'quality',context:{customer:'Eksen Ambalaj Makinaları',orderNumber:'SAHA-20261108-06',dueDate:'20 Kas 2026'}});
   RitimVisualClarity.mount({page:'quality',detail,jobs,jobSelected});
   RitimWorkspacePolish.mount({page:'quality',qualityView,extras,jobs,jobSelected,detail});
  },{helpers,refine,output,options});
  await run(page);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
}
test('accepted output separates current result, historic notification and production scrap at four sizes',()=>fixture(async page=>{
 assert.equal(await page.getByText('2 adet onaylandı',{exact:true}).count(),1);
 assert.match(await page.locator('.quality-state-content').innerText(),/bekleyen kalite kararı yok/);
 assert.equal(await page.getByText('Bekliyor',{exact:true}).count(),0);
 assert.match(await page.locator('.quality-records').innerText(),/Üretim hurdası[\s\S]*1 adet/);
 assert.match(await page.locator('h2').first().innerText(),/Konveyör.*CNC torna/);
 assert.equal(await page.locator('#page>.required-help').count(),0);
 assert.equal(await page.locator('#api-quality-dialog .required-help').count(),1);
 assert.equal(await page.getByText(output.outputLotId,{exact:true}).first().isVisible(),false);
 await page.locator('.quality-record-trace summary').first().click();assert.equal(await page.getByText(output.outputLotId,{exact:true}).first().isVisible(),true);
 await page.getByRole('button',{name:'Ölçüm.pdf'}).click();await page.getByRole('button',{name:'Bekleyen kontrollere dön'}).click();assert.deepEqual(await page.evaluate(()=>calls),[['document','doc'],['queue',false]]);
 assert.equal(await page.locator('.quality-history-record script').count(),0);assert.match(await page.locator('.quality-history-record').first().innerText(),/Ölçüler uygun <kontrol>/);
 await page.locator('.quality-record-trace').first().evaluate(e=>e.open=false);
 const dir=path.resolve('artifacts/quality-detail-clarity');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height]of [[1920,1080],[1366,768],[390,844],[375,667]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dir,'completed-'+width+'.png'),fullPage:true})}
}));
test('pending control retains original decision dialog and save action',()=>fixture(async page=>{
 assert.match(await page.locator('.quality-state-content').innerText(),/3 adet kontrol bekliyor/);
 await page.getByRole('button',{name:'Karar ver',exact:true}).click();assert.equal(await page.locator('#api-quality-dialog').isVisible(),true);
 await page.locator('#quality-qty-approved').fill('3');await page.locator('#quality-dialog-evidence').fill('Ölçüler uygun');await page.getByRole('button',{name:'Kaydet',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls),[['decision',0],['save']]);
},{output:{unresolved:3}}));
test('read-only role cannot issue a decision',()=>fixture(async page=>{assert.equal(await page.getByRole('button',{name:'Karar ver',exact:true}).isDisabled(),true)},{output:{unresolved:3},readOnly:true}));
test('repair state offers the existing repair workflow without implying completion',()=>fixture(async page=>{assert.match(await page.locator('.quality-state-content').innerText(),/2 adet tamir bekliyor/);await page.getByRole('button',{name:'Tamir işlerini aç'}).click();assert.deepEqual(await page.evaluate(()=>calls),[['repair']]);assert.equal(await page.locator('.refine-state-card.is-complete').count(),0)},{output:{approved:0,reworkPending:2}}));
test('all rejected output has no false approval or green completion',()=>fixture(async page=>{assert.equal(await page.locator('.quality-state-content strong').innerText(),'2 adet reddedildi');assert.equal(await page.locator('.refine-state-card.is-complete').count(),0)},{output:{approved:0,rejected:2}}));
test('unreconciled quantities never claim there is no pending decision',()=>fixture(async page=>{assert.match(await page.locator('.quality-state-content').innerText(),/doğrulanamadı/);assert.doesNotMatch(await page.locator('.quality-state-content').innerText(),/bekleyen kalite kararı yok/);assert.equal(await page.locator('.refine-state-card.is-complete').count(),0)},{unavailable:true}));
test('no output explains when control becomes available',()=>fixture(async page=>{assert.match(await page.locator('.quality-state-content').innerText(),/Operatör üretim bildirdiğinde/);assert.equal(await page.getByRole('button',{name:'Karar ver',exact:true}).count(),0)},{empty:true}));
