'use strict';
// Read-only UI verification. The only POST creates the browser's login session.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts/header-toolbar/live'),origin='https://flow.getritim.com';
const screens=[['orders','Siparişler','view=orders'],['production-orders','Üretim Emirleri','view=production-orders'],['jobs','İş Emirleri','view=jobs'],['tracking','Üretim Takibi','view=production-monitor'],['compensations','Telafi Takibi','view=compensations'],['shipping','Sevkiyat','view=shipping'],['outsourcing','Fason','view=outsourcing'],['returns','Müşteri İadeleri','view=returns'],['receipt','Mal Kabul','view=inventory'],['move','Konumlar Arası Transfer','view=inventory'],['pick','Üretime Malzeme Teslimi','view=inventory'],['stock','Stok Durumu','view=inventory'],['scrap','Hurda','view=inventory'],['history','Hareket Geçmişi','view=inventory'],['quality','Bekleyen Kontroller','view=quality-list'],['quality-history','Geçmiş Kontroller','view=quality-list&tab=history'],['rework','Tamir','view=rework']];
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const revision=process.env.HEADER_TOOLBAR_RELEASE||'current',report={origin,revision,at:new Date().toISOString(),readOnly:true,assets:[],checks:[],captures:[],errors:[],httpErrors:[]};
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext(),account=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json'),'utf8')).admin;
  const login=await context.request.post(origin+'/auth/login',{data:account,headers:{origin},maxRedirects:0});assert.equal(login.status(),303,'Verification account login failed');
  const health=await context.request.get(origin+'/health/ready');assert.equal(health.status(),200);report.health=health.status();
  for(const file of ['integration/compact-workspace.js','assets/css/compact-workspace.css','integration/premium-api.js','integration/modern-ui.js']){
   const response=await context.request.get(origin+'/'+file+'?release='+encodeURIComponent(revision));assert.equal(response.status(),200,file);
   const expected=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),actual=crypto.createHash('sha256').update(await response.body()).digest('hex');assert.equal(actual,expected,'Deployed bytes differ: '+file);report.assets.push({file,sha256:actual});
  }
  const sessionResponse=await context.request.get(origin+'/api/v1/session');assert.equal(sessionResponse.status(),200);const session=await sessionResponse.json();
  const checkpoint=path.join(root,'artifacts/scenario-checkpoints/live-stock-release.json'),knownSite=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')).siteId:null;
  const index=Math.max(0,session.memberships.findIndex(m=>m.siteId===knownSite));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.status()>=400)report.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()})});
  async function ready(){await page.waitForFunction(()=>document.querySelector('.api-shell')&&document.querySelector('#page')&&document.getElementById('app')?.getAttribute('aria-busy')!=='true');await page.waitForTimeout(300);assert.equal(await page.locator('#api-alert').innerText(),'')}
  await page.goto(origin+'/?view=orders');await page.waitForFunction(()=>document.getElementById('api-scope')||document.querySelector('.standard-workspace'));
  if(await page.locator('#api-scope').count()){await page.locator('#api-scope').selectOption(String(index));await page.getByRole('button',{name:'Devam',exact:true}).click()}
  await ready();
  for(const [key,label,query]of screens){
   await page.goto(origin+'/?'+query);await ready();
   if(['move','pick','stock','scrap','history'].includes(key)){await page.evaluate(k=>RitimPremiumAPI.inventorySelectTask(k),key);await ready()}
   assert.equal(await page.locator('.standard-workspace').count(),1,label+' standard layout');
   if(key==='jobs')await page.locator('.tabulator').waitFor();
   for(const [width,height]of [[1920,1080],[1366,768],[390,844],[375,667]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,label+' '+width+' overflow');
    const file=key+'-'+width+'x'+height+'.png';await page.screenshot({path:path.join(dir,file)});report.captures.push({key,label,width,height,file});
    report.checks.push({key,width,overflow,heading:await page.locator('.workspace-header h1').innerText()});
   }
   console.log('LIVE PASS '+label);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='PASS';
 }finally{await browser.close();fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2))}
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canlı header ve toolbar doğrulaması</title><style>body{font:14px/1.6 system-ui;background:#f4f7fb;color:#20364f;margin:24px}main{max-width:1200px;margin:auto}section{background:white;border:1px solid #dce5ef;border-radius:8px;padding:16px;margin:16px 0}img{max-width:100%}</style><main><h1>Canlı header ve toolbar doğrulaması</h1><p>PASS · <a href="'+origin+'">'+origin+'</a> · Sürüm '+h(revision)+'</p><p>17 ekran, dört çözünürlük, '+report.captures.length+' görüntü. Canlı iş kayıtları değiştirilmedi; mevcut test iş yeri okundu. Sağlık kontrolü 200; yayımlanan dört JS/CSS dosyasının SHA-256 değerleri test edilen kaynakla eşleşti. Tarayıcı hatası ve başarısız UI API yanıtı: 0.</p><p><a href="report.json">Canlı rapor</a> · <a href="../index.html">Önce/sonra ölçümleri</a></p>'+report.captures.map(c=>'<section><h2>'+h(c.label)+' · '+c.width+'×'+c.height+'</h2><a href="'+c.file+'"><img loading="lazy" src="'+c.file+'" alt="'+h(c.label)+'"></a></section>').join('')+'</main></html>');
 console.log(JSON.stringify({status:report.status,origin,revision,captures:report.captures.length,errors:report.errors.length,httpErrors:report.httpErrors.length}));
}
main().catch(e=>{console.error('Live verification failed: '+e.message);process.exitCode=1});
