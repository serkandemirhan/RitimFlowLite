'use strict';
// Runs against the actual UI and the disposable PostgreSQL fixture, never a live account.
const assert=require('node:assert/strict');
module.exports=async function({page,origin,ready,checks,seedLongLists,recordLongComparison}){
 const p=page,requests=[];p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url())});
 async function check(name,run){try{await run();checks.push({name,pass:true});console.log('PASS '+name)}catch(e){checks.push({name,pass:false,error:e.message});throw e}}
 async function open(query){await p.goto(origin+'/?'+query);await ready();await p.setViewportSize({width:1366,height:768})}
 async function settle(){await ready();await p.waitForTimeout(100)}
 const bar=()=>p.locator('.contextual-toolbar').first();
 async function noLoadOnPanel(panel){await p.waitForLoadState('networkidle');const n=requests.length;await panel.locator(':scope>summary').click();await p.waitForTimeout(100);assert.equal(requests.length,n,'Opening the panel must not load data');assert(await panel.evaluate(e=>e.open));await p.keyboard.press('Escape');assert.equal(await panel.evaluate(e=>e.open),false)}
 await check('Siparişler: tek toolbar, filtreyi açmak sorgu göndermez, ana aksiyon erişilebilir',async()=>{
  await open('view=orders');assert.equal(await p.locator('.contextual-toolbar').count(),1);
  await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.locator('.workspace-header').getByRole('button',{name:'Yeni Sipariş',exact:true}).click();await p.locator('.modal').waitFor();await p.evaluate(()=>closeModal());
 });
 await check('Siparişler: Uygula, aktif arama etiketi, temizleme ve kolon görünürlüğü',async()=>{
  const first=await p.locator('tbody [data-column=number] .grid-link').first().innerText();
  await p.locator('#orders-query').fill(first);await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();
  assert.equal(await p.locator('tbody tr[data-order-id]').count(),1);assert(await p.locator('.active-filter-chip').filter({hasText:first}).isVisible());
  await p.locator('.active-filter-chip').filter({hasText:first}).click();await settle();assert((await p.locator('tbody tr[data-order-id]').count())>1);
  await p.locator('.compact-columns>summary').click();const box=p.locator('[data-grid-column=created]');await box.uncheck();assert.equal(await p.locator('thead [data-column=created]').isVisible(),false);
  await p.reload();await settle();assert.equal(await p.locator('thead [data-column=created]').isVisible(),false);await p.locator('.compact-columns>summary').click();await p.locator('[data-grid-column=created]').check();
  await p.locator('thead [data-column=customer] .grid-sort').click();await settle();assert.notEqual(await p.locator('thead [data-column=customer]').getAttribute('aria-sort'),'none');
  await p.locator('.workspace-refresh').click();await settle();
 });
 await check('Üretim Emirleri: yüklenen kayıtlarda arama, durum, kolon ve ilerleme korunur',async()=>{
  await open('view=production-orders&productionStatus=all');assert(await p.locator('progress.polish-progress').first().isVisible());
  const search=p.getByRole('searchbox',{name:'Yüklenen üretim emirlerinde ara'});await search.fill('no-match-XYZ');assert.equal(await p.locator('tbody tr:visible').count(),0);await search.fill('');assert((await p.locator('tbody tr:visible').count())>0);
  await p.getByRole('combobox',{name:'Üretim emri durumu',exact:true}).selectOption('0');await settle();assert.equal(new URL(p.url()).searchParams.get('productionStatus'),'active');
  await p.locator('.compact-columns>summary').click();assert((await p.locator('[data-grid-column]').count())>0);
 });
 await check('İş Emirleri: global arama ve kolon filtresi bağımsız, gelişmiş panel sorgusuz',async()=>{
  await open('view=jobs');await p.locator('.tabulator-row').first().waitFor();await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.locator('#workspace-query').fill('Finished');await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();await p.locator('.tabulator-row').first().waitFor();
  const filter=p.locator('.tabulator-col[tabulator-field=operation] input');await filter.fill('');await filter.pressSequentially('coating');await p.waitForTimeout(600);
  assert.equal(await p.locator('#workspace-query').inputValue(),'Finished');assert.equal(new URL(p.url()).searchParams.get('q'),'Finished');
  const values=await p.locator('.tabulator-row:visible .tabulator-cell[tabulator-field=operation]').allTextContents();assert(values.length>0);assert(values.every(v=>v.toLowerCase().includes('coating')),JSON.stringify({values,filters:await p.evaluate(()=>Tabulator.findTable('.modern-job-grid')[0].getHeaderFilters())}));
  await filter.press('ControlOrMeta+A');await filter.press('Backspace');await p.waitForTimeout(500);assert.equal(await p.locator('#workspace-query').inputValue(),'Finished');
  await p.locator('.compact-columns>summary').click();const quantity=p.locator('.compact-columns label').filter({hasText:'Hedef'}).locator('input');await quantity.uncheck();assert.equal(await p.locator('.tabulator-col[tabulator-field=quantity]').isVisible(),false);
  await p.locator('#workspace-status').selectOption('running');await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();assert.equal(new URL(p.url()).searchParams.get('status'),'running');
 });
 await check('Telafi: durum seçimi, kaynak/süreç paneli, yardım ve Yeni Telafi',async()=>{
  await open('view=compensations');assert.equal(await p.locator('.compensation-workspace h2').count(),0);await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.getByRole('combobox',{name:'Telafi görünümü'}).selectOption('1');await settle();assert.equal(new URL(p.url()).searchParams.get('state'),'all');
  await p.locator('.compact-filter-panel>summary').click();await p.locator('#compensation-source').selectOption({index:1});const source=await p.locator('#compensation-source').inputValue();await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();assert.equal(new URL(p.url()).searchParams.get('source'),source);assert((await p.locator('.active-filter-chip').count())>0);
  await p.locator('.workspace-header').getByRole('button',{name:'Yeni telafi',exact:true}).click();await p.locator('#compensation-order-query').waitFor();await p.locator('#workflow-dialog').evaluate(d=>d.close());
 });
 await check('Üretim Takibi: hiyerarşi, aç/kapat, yoğunluk ve sekmeler korunur',async()=>{
  await open('view=production-monitor');await p.locator('[data-tab=all]').click();await settle();
  await p.locator('[data-action=expand]').click();await settle();assert((await p.locator('.tracking-production').count())>0);assert((await p.locator('.tracking-job').count())>0);
  await p.locator('.compact-view-preferences>summary').click();await p.locator('[data-setting=density]').selectOption('compact');await settle();assert(await p.locator('.production-tracking').evaluate(e=>e.classList.contains('density-compact')));
  await p.locator('[data-action=collapse]').click();await settle();assert.equal(await p.locator('.tracking-production').count(),0);
  await p.locator('[data-action=expand]').click();await settle();const toggle=p.locator('.tracking-production-row [data-toggle]').first();await toggle.focus();await p.keyboard.press('Enter');await settle();assert.equal(await p.locator('.tracking-production-row [data-toggle]').first().getAttribute('aria-expanded'),'false');
  await p.locator('[data-tab=completed]').click();await settle();assert(await p.locator('[data-setting=range]').isVisible());
 });
 await check('Lojistik: arama görünür, durum filtresi ve sevkiyat ana aksiyonu çalışır',async()=>{
  await open('view=shipping');assert(await p.locator('#logistics-filter').isVisible());await p.getByRole('combobox',{name:'Kayıt durumu'}).selectOption('1');await settle();
  await p.locator('#logistics-filter').fill('no-match-XYZ');await bar().getByRole('button',{name:/Uygula|Ara|Tüm kayıtlarda ara/}).click();await settle();assert(await p.locator('#logistics-filter').isVisible());
  await p.locator('.active-filter-chip').filter({hasText:'no-match-XYZ'}).click();await settle();assert.equal(await p.locator('#logistics-filter').inputValue(),'');
  await p.locator('.workspace-header').getByRole('button',{name:'Yeni sevkiyat',exact:true}).click();await p.locator('#clarity-shipping-dialog[open]').waitFor();await p.keyboard.press('Escape');
 });
 await check('Fason: arama, tedarikçi paneli, gruplama ve editör erişilebilir',async()=>{
  await open('view=outsourcing');await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.locator('.compact-view-preferences>summary').click();await p.locator('.compact-view-content input[type=checkbox]').check();await settle();assert((await p.locator('.supplier-group-total').count())>0);
  await p.locator('.workspace-header button[onclick*="supplierEditorToggle"]').click();await settle();assert(await p.locator('.supplier-editor').isVisible());
 });
 await check('Müşteri İadeleri: bağımsız durum/arama ve iade işlemleri korunur',async()=>{
  await open('view=returns');assert(await p.locator('#logistics-filter').isVisible());await p.getByRole('combobox',{name:'İade durumu'}).selectOption('active');await settle();assert(await p.locator('.returns-list').isVisible());
  await p.locator('.api-secondary-nav').getByRole('button',{name:'Sevkiyat',exact:true}).click();await settle();await p.getByRole('combobox',{name:'Kayıt durumu'}).selectOption('1');await settle();
  await p.locator('.api-secondary-nav').getByRole('button',{name:'Müşteri İadeleri',exact:true}).click();await settle();assert.equal(await p.getByRole('combobox',{name:'İade durumu'}).inputValue(),'active');
 });
 await check('Depo: altı görev, form sahipliği, miktar ve transfer validasyonu korunur',async()=>{
  await open('view=inventory');assert.equal(await p.locator('[data-inventory-tab]').count(),6);assert(await p.locator('#inv-receipt-quantity').isVisible());assert.equal(await p.locator('.contextual-toolbar #inv-receipt-quantity').count(),0);
  const original=await p.locator('#inv-receipt-quantity').evaluate(e=>e.form?.id||null);await p.locator('#inv-receipt-quantity').fill('1.5');assert.equal(await p.locator('#inv-receipt-quantity').evaluate(e=>e.form?.id||null),original);
  await p.locator('[data-inventory-tab=move]').click();await settle();await p.locator('#inv-balance').selectOption({index:0});await p.locator('#inv-quantity').fill('999999999');await p.getByRole('button',{name:'Konumlar arası taşı',exact:true}).click();assert(await p.locator('#inv-quantity').evaluate(e=>e.getAttribute('aria-invalid')==='true'||!!e.closest('label')?.querySelector('.field-error')||!!document.querySelector('.field-error')));
  await p.locator('[data-inventory-tab=pick]').click();await settle();assert(await p.locator('#raw-stock-panel').isVisible());
  await p.locator('[data-inventory-tab=scrap]').click();await settle();assert(await p.locator('#inv-scrap-reason').isVisible());assert.equal(await p.locator('.contextual-toolbar #inv-scrap-reason').count(),0);
 });
 await check('Stok: arama, gelişmiş filtre, etiket temizleme ve LOT aç/kapat',async()=>{
  await open('view=inventory');await p.locator('[data-inventory-tab=stock]').click();await settle();await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.locator('#inventory-balance-query').fill('no-match-XYZ');assert.equal(await p.locator('.stock-product:visible').count(),0);
  await p.locator('.active-filter-chip').click();assert((await p.locator('.stock-product:visible').count())>0);await p.locator('.stock-product>summary').first().click();assert(await p.locator('.stock-lot-details').first().isVisible());
 });
 await check('Hareket Geçmişi: arama, tür filtresi, temizleme ve düzeltme erişimi',async()=>{
  await p.locator('[data-inventory-tab=history]').click();await settle();await noLoadOnPanel(p.locator('.compact-filter-panel'));
  await p.locator('#inventory-movements-query').fill('no-match-XYZ');await bar().getByRole('button',{name:'Ara',exact:true}).click();await settle();assert.equal(await p.locator('.inventory-movement').count(),0);
  await bar().getByRole('button',{name:'Temizle',exact:true}).click();await settle();assert((await p.locator('.inventory-movement').count())>0);assert((await p.locator('button[onclick*="auditCorrect("]').count())>0);
 });
 await check('Kalite: giriş kontrolü aç/kapat, üretim araması, kolon ve yenileme',async()=>{
  await open('view=quality-list');const incoming=p.locator('#incoming-material-panel>details');assert(await incoming.evaluate(e=>e.open));await incoming.locator(':scope>summary').click();assert.equal(await incoming.evaluate(e=>e.open),false);await incoming.locator(':scope>summary').click();
  const input=bar().locator('input[type=search]');await input.fill('no-match-XYZ');await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();assert((await p.locator('.active-filter-chip').count())>0);await p.locator('.active-filter-chip').click();await settle();assert.equal(await bar().locator('input[type=search]').inputValue(),'');
  await bar().getByRole('button',{name:'Kontrolleri yenile',exact:true}).click();await settle();assert(await p.locator('.compact-columns>summary').isVisible());
 });
 await check('Geçmiş Kontroller: giriş geçmişi ve üretim kayıtlarına erişim, arama temizleme',async()=>{
  await open('view=quality-list&tab=history');const history=p.locator('.compact-incoming-history');assert.equal(await history.evaluate(e=>e.open),false);await history.locator(':scope>summary').click();assert(await p.locator('.audit-incoming-history').isVisible());
  await p.locator('#quality-history-search').fill('no-match-XYZ');await bar().getByRole('button',{name:'Ara',exact:true}).click();await settle();await p.locator('.active-filter-chip').click();await settle();assert.equal(await p.locator('#quality-history-search').inputValue(),'');
 });
 await check('Tamir: tek başlık, aktif/geçmiş seçimi ve arama temizleme',async()=>{
  await open('view=rework');assert.equal(await p.locator('.operations-rework>h2').count(),0);await p.getByRole('combobox',{name:'Tamir durumu'}).selectOption('1');await settle();
  await bar().locator('input[type=search]').fill('no-match-XYZ');await bar().getByRole('button',{name:'Uygula',exact:true}).click();await settle();await p.locator('.active-filter-chip').click();await settle();assert.equal(await bar().locator('input[type=search]').inputValue(),'');
 });
 if(seedLongLists)await check('Uzun listeler: sayfalama, masaüstü sticky toolbar, formda normal akış',async()=>{
  await seedLongLists();if(recordLongComparison)await recordLongComparison();await open('view=orders');assert.equal(await p.locator('tbody tr[data-order-id]').count(),25);
  const toolbar=p.locator('.compact-sticky-toolbar').first();assert(await toolbar.isVisible());await p.evaluate(()=>scrollTo(0,350));await p.waitForTimeout(100);const box=await toolbar.boundingBox();assert(box.y>=-1&&box.y<=2,'Toolbar must stick to top');
  const next=p.getByRole('button',{name:'Sonraki →',exact:true});await next.click();await settle();assert.match(await p.locator('.workspace-pagination').innerText(),/Sayfa 2/);
  await open('view=jobs&status=all');await p.locator('.tabulator-row').first().waitFor();await p.waitForTimeout(200);assert(await p.locator('.compact-sticky-toolbar').isVisible());
  await open('view=inventory');assert.equal(await p.locator('.compact-sticky-toolbar').count(),0);
 });
 await check('Mobil: ikincil araç menüsü, klavye odağı ve açık filtrede taşma kontrolü',async()=>{
  await open('view=orders');await p.setViewportSize({width:375,height:667});await p.waitForTimeout(100);
  const menu=p.locator('.compact-secondary-actions');assert.equal(await menu.evaluate(e=>e.open),false);await menu.locator(':scope>summary').focus();await p.keyboard.press('Enter');assert(await menu.evaluate(e=>e.open));
  await p.locator('.compact-columns>summary').click();assert(await p.locator('[data-grid-column=created]').isVisible());await p.keyboard.press('Escape');assert.equal(await p.locator('.compact-columns').evaluate(e=>e.open),false);await p.keyboard.press('Escape');assert.equal(await menu.evaluate(e=>e.open),false);
  const panel=p.locator('.compact-filter-panel');await panel.locator(':scope>summary').click();assert(await p.locator('#orders-dueFrom').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.keyboard.press('Escape');
  assert(await p.locator('.workspace-header').getByRole('button',{name:'Yeni Sipariş',exact:true}).isVisible());
 });
 await check('Yükleniyor ve hata: meşgul bildirimi, arama taslağı ve yenilemeyle toparlanma',async()=>{
  await open('view=orders');let release,entered;
  const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),pattern=/\/order-workspace\?/;
  await p.route(pattern,async route=>{entered();await gate;await route.continue()});
  try{await p.locator('.workspace-refresh').click();await started;assert.equal(await p.locator('#app').getAttribute('aria-busy'),'true');assert.match(await p.locator('#api-alert').innerText(),/İşlem sürüyor/)}finally{release()}
  await settle();await p.unroute(pattern);
  await p.locator('#orders-query').fill('Korunacak taslak');await p.route(pattern,route=>route.abort('failed'));
  await bar().getByRole('button',{name:'Uygula',exact:true}).click();await p.waitForFunction(()=>document.getElementById('app')?.getAttribute('aria-busy')==='false'&&document.getElementById('api-alert')?.textContent.trim());
  assert.equal(await p.locator('#orders-query').inputValue(),'Korunacak taslak');assert(await bar().isVisible());
  await p.unroute(pattern);await p.locator('.workspace-refresh').click();await settle();assert.equal(await p.locator('#api-alert').innerText(),'');
 });
};
