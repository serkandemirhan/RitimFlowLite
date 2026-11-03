/* Audit-only harness. npm install --prefix /tmp/ritim-ux-audit playwright
 * Start python3 -m http.server 8765 in repository root, then:
 * NODE_PATH=/tmp/ritim-ux-audit/node_modules node docs/audit/run-audit.cjs
 * Uses disposable contexts; never reads an existing browser profile.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.join(__dirname, 'evidence');
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:8765/';
const KEY = 'ritimLiteAnonymousDemoV1';
const results = [], telemetry = [], layouts = [];
let browser;
const fixture = (route = ['İmalat'], qty = 250, plan = 150) => ({
  user: 'Yönetici',
  orders: [{ id: 'SIP-AUDIT-001', customer: 'Kurgusal Audit Firma', part: 'Audit Parçası', partNo: 'AUD-001', revision: 'A', qty, created: '2026-10-20', due: '2026-10-25', material: 'Çelik', dimensions: '', route, drawing: 'teknikResim.pdf' }],
  jobs: [{ id: 'WO-AUDIT-001', order: 'SIP-AUDIT-001', machine: 'CNC-01', plannedQty: plan, state: 'waiting', good: 0, scrap: 0, op: 0 }], events: [], shipments: []
});
async function pageFor(seed, width = 1440, suffix = '') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Europe/Istanbul', locale: 'tr-TR' });
  if (seed) await context.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: KEY, seed });
  const page = await context.newPage();
  page.on('pageerror', e => telemetry.push({ kind: 'pageerror', url: page.url(), message: e.message }));
  page.on('console', m => { if (m.type() === 'error') telemetry.push({ kind: 'console', url: page.url(), message: m.text() }); });
  page.on('requestfailed', r => telemetry.push({ kind: 'requestfailed', url: r.url(), message: r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) telemetry.push({ kind: 'http', url: r.url(), status: r.status() }); });
  await page.goto(BASE + suffix); await page.waitForTimeout(150);
  return { page, context };
}
async function test(id, name, fn) {
  if (process.env.AUDIT_TEST_IDS && !process.env.AUDIT_TEST_IDS.split(',').includes(id)) return;
  try { const detail = await fn(); results.push({ id, name, status: detail.pass ? 'PASS' : 'FAIL', ...detail }); }
  catch (e) { results.push({ id, name, status: 'ERROR', error: e.stack }); }
  console.log(id, results.at(-1).status, name);
}
async function isolated(seed, fn, width) {
  const { page, context } = await pageFor(seed, width);
  try { return await fn(page); } finally { await context.close(); }
}
async function logistics(page, tab, n, ref) {
  await page.evaluate(tab => { go('logistics'); RitimUX06.setTab(tab); }, tab);
  await page.locator('#ux6-qty').fill(String(n));
  if (ref) await page.locator('#ux6-ref').fill(ref);
  await page.locator('.ux6-form button.full').click();
}
async function receiveProduce(page, count = 100) {
  await logistics(page, 'material', count, 'AUD-MAT-1');
  await logistics(page, 'allocate', count);
  await page.evaluate(() => go('production'));
  await page.locator('#ux05-receive').fill(String(count));
  await page.getByRole('button', { name: 'Teslim Aldım', exact: true }).click();
  await page.getByRole('button', { name: 'İşe Başla', exact: true }).click();
}
async function production(page, type, n) {
  await page.locator('#ux05-type').selectOption(type); await page.locator('#ux05-qty').fill(String(n));
  await page.getByRole('button', { name: 'Üretim Sonucunu Kaydet', exact: true }).click();
}
async function snapshot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); return name + '.png'; }
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.AUDIT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const version = browser.version();
  await test('T01', 'Fresh demo initial render and all routes at 1440/390/360', async () => {
    for (const width of [1440, 390, 360]) await isolated(null, async p => {
      for (const route of ['home','orders','jobs','production','shipping','history','logistics','audit','orderDetail','detail']) {
        await p.evaluate(route => { if(route === 'orderDetail') openOrder('DEMO-SIP-001'); else if(route === 'detail') openJob('DEMO-IE-001'); else go(route); }, route);
        await p.waitForTimeout(100);
        layouts.push(await p.evaluate(({width, route}) => ({width, route, heading: document.querySelector('h1')?.textContent, bodyWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, smallTargets: [...document.querySelectorAll('#page button')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height < 44).length }), {width,route}));
        if (['home','production','shipping','audit'].includes(route)) await snapshot(p, `${width}-${route}`);
      }
    }, width);
    return {pass: layouts.every(l=>l.heading && !l.overflow), detail: layouts};
  });
  await test('T02', 'Dashboard active work KPI applies running filter', () => isolated(null, async p => {
    await p.locator('.ux-kpi-link').nth(1).click();
    const actual = await p.evaluate(()=>({filter, displayed:document.querySelectorAll('#results .list-card').length,running:state.jobs.filter(j=>j.state==='running').length}));
    return {pass:actual.filter==='running' && actual.displayed===actual.running, actual};
  }));
  await test('T03', 'Back from order detail retains search', () => isolated(null, async p => {
    await p.evaluate(()=>go('orders'));await p.getByRole('textbox',{name:'Ara',exact:true}).fill('Braketi');await p.locator('.order-card-v4').click();await p.getByRole('button',{name:'← Siparişler',exact:true}).click();
    return {pass:await p.getByRole('textbox',{name:'Ara',exact:true}).inputValue()==='Braketi',actual:await p.getByRole('textbox',{name:'Ara',exact:true}).inputValue()};
  }));
  await test('T04', 'Wizard autocomplete threshold, route reorder, creation', () => isolated(null, async p => {
    await p.evaluate(()=>openWizard());await p.locator('[data-wiz=customer]').fill('De');await p.waitForTimeout(50);let before=await p.locator('.ux-suggestion').count();await p.locator('[data-wiz=customer]').fill('Demo');await p.waitForTimeout(50);let after=await p.locator('.ux-suggestion').count();
    await p.locator('[data-wiz=id]').fill('SIP-AUDIT-NEW');await p.locator('[data-wiz=customer]').fill('Kurgusal Audit');await p.locator('[data-wiz=part]').fill('Audit Parçası');await p.locator('[data-wiz=qty]').fill('250');await p.getByRole('button',{name:'Devam Et →',exact:true}).click();
    await p.locator('#newRoute').selectOption('Tesviye');await p.getByRole('button',{name:'Ekle',exact:true}).click();await p.locator('.route-row button[aria-label="Aşağı taşı"]').first().click();await p.getByRole('button',{name:'Devam Et →',exact:true}).click();await p.locator('[data-wiz=jobId]').fill('WO-AUDIT-NEW');await p.locator('[data-wiz=jobQty]').fill('150');await p.getByRole('button',{name:'Siparişi Oluştur',exact:true}).click();
    let actual=await p.evaluate(()=>({o:order('SIP-AUDIT-NEW'),j:job('WO-AUDIT-NEW')}));return {pass:before===0&&after>0&&actual.j.plannedQty===150&&actual.o.route[0]==='Tesviye',actual:{before,after,...actual}};
  }));
  await test('T05', 'Additional work order specifies operation and planned quantity', () => isolated(fixture(['İmalat','Tesviye']), async p=>{
    await p.evaluate(()=>newJobFor('SIP-AUDIT-001'));let inputs=await p.locator('.modal-body input,.modal-body select').evaluateAll(es=>es.map(e=>e.id));await p.locator('#additionalJobId').fill('WO-AUDIT-002');await p.getByRole('button',{name:'İş Emri Oluştur',exact:true}).click();let j=await p.evaluate(()=>job('WO-AUDIT-002'));return {pass:Number.isInteger(j.plannedQty)&&inputs.some(x=>/op/i.test(x)),actual:{inputs,j}};
  }));
  await test('T06', '250/150/100 acceptance: 60 good + 3 scrap + 12 pending +25 unprocessed; 50 unstarted', ()=>isolated(fixture(),async p=>{
    await receiveProduce(p);await production(p,'good',60);await production(p,'scrap',3);await production(p,'pending',12);
    const actual=await p.evaluate(()=>{let j=job('WO-AUDIT-001'),x=j.ux05;return {ordered:jo(j).qty,planned:j.plannedQty,received:x.received,good:j.good,scrap:j.scrap,pending:x.pending,setup:x.setup,rework:x.rework,unprocessed:x.received-j.good-j.scrap-x.pending-x.setup-x.rework,unstarted:j.plannedQty-x.received,warnings:RitimUX07.audit().warnings}});
    const evidence=await snapshot(p,'acceptance-250-150-100');return {pass:actual.received===100&&actual.unprocessed===25&&actual.unstarted===50&&actual.good===60&&actual.pending===12,actual,evidence};
  }));
  await test('T07', 'Prevent physical receipt before material allocation', ()=>isolated(fixture(),async p=>{
    await p.evaluate(()=>go('production'));await p.locator('#ux05-receive').fill('10');await p.getByRole('button',{name:'Teslim Aldım',exact:true}).click();return {pass:await p.evaluate(()=>job('WO-AUDIT-001').ux05.received===0),message:await p.locator('.toast').textContent()};
  }));
  await test('T08', 'Prevent allocation above material and negative material receipt',()=>isolated(fixture(),async p=>{
    await logistics(p,'material',100,'AUD-MAT-1');await logistics(p,'allocate',101);await logistics(p,'material',-1,'AUD-MAT-2');const actual=await p.evaluate(()=>{let x=RitimUX07Ledger.data(order('SIP-AUDIT-001'));return {material:x.material,allocated:x.allocated}});return {pass:actual.material===100&&actual.allocated===0,actual};
  }));
  await test('T09', 'Prevent production beyond physically unprocessed quantity',()=>isolated(fixture(),async p=>{
    await receiveProduce(p,10);await production(p,'pending',11);return {pass:await p.evaluate(()=>job('WO-AUDIT-001').ux05.pending===0)};
  }));
  await test('T10', 'Inspection/rework conserve quantity and reject operator approval',()=>isolated(fixture(),async p=>{
    await receiveProduce(p,20);await production(p,'pending',20);await p.locator('#ux05-ig').fill('12');await p.locator('#ux05-is').fill('3');await p.locator('#ux05-ir').fill('5');await p.getByRole('button',{name:/^Kontrol Sonucunu Onayla/}).click();await p.locator('#ux05-rg').fill('4');await p.locator('#ux05-rs').fill('1');await p.getByRole('button',{name:'Rework Kontrolünü Onayla',exact:true}).click();await p.getByRole('combobox',{name:'Aktif kullanıcı'}).selectOption('Operatör A');let actual=await p.evaluate(()=>({good:job('WO-AUDIT-001').good,scrap:job('WO-AUDIT-001').scrap,x:job('WO-AUDIT-001').ux05}));return {pass:actual.good===16&&actual.scrap===4&&actual.x.rework===0&&await p.getByRole('button',{name:/^Kontrol Sonucunu Onayla/}).isDisabled(),actual};
  }));
  await test('T11', 'Work order closure rejects pending and unstarted quantity',()=>isolated(fixture(),async p=>{
    await receiveProduce(p,10);await production(p,'pending',10);await p.getByRole('button',{name:'İş Emrini Kapat',exact:true}).click();return {pass:await p.evaluate(()=>job('WO-AUDIT-001').state==='running'),message:await p.locator('.toast').textContent()};
  }));
  await test('T12', 'Handover requires different user and explicit resume',()=>isolated(fixture(),async p=>{
    await receiveProduce(p,10);await p.locator('#ux05-handover-note').fill('Audit vardiya notu');await p.getByRole('button',{name:'Vardiya Devret',exact:true}).click();await p.getByRole('button',{name:'İşi Devral',exact:true}).click();const blocked=await p.evaluate(()=>!!job('WO-AUDIT-001').ux05.handover);await p.getByRole('combobox',{name:'Aktif kullanıcı'}).selectOption('Operatör B');await p.getByRole('button',{name:'İşi Devral',exact:true}).click();let actual=await p.evaluate(()=>({handover:job('WO-AUDIT-001').ux05.handover,state:job('WO-AUDIT-001').state}));return {pass:blocked&&!actual.handover&&actual.state==='paused',actual};
  }));
  await test('T13', 'Partial external dispatch/return/final release/shipment/customer return',()=>isolated(fixture(['İmalat','Kaplama']),async p=>{
    await receiveProduce(p,100);await production(p,'good',60);await logistics(p,'external',40,'AUD-EXT-1');await logistics(p,'external',20,'AUD-EXT-2');await logistics(p,'return',30);await logistics(p,'quality',20);await logistics(p,'shipping',15,'AUD-SHIP-1');await p.evaluate(()=>{go('logistics');RitimUX06.setTab('customerReturn')});await p.locator('#ux6-qty').fill('5');await p.locator('#ux6-reason').fill('Audit hasar');await p.locator('.ux6-form button.full').click();let actual=await p.evaluate(()=>{let x=RitimUX07Ledger.data(order('SIP-AUDIT-001'));return {dispatched:x.dispatched,returned:x.returned,open:x.supplierOpen,approved:x.approved,ready:x.ready,net:x.net,quarantine:x.customerReturn,mainSummary:shipmentSummary(order('SIP-AUDIT-001'))}});return {pass:actual.dispatched===60&&actual.returned===30&&actual.open===30&&actual.ready===5&&actual.net===10&&actual.quarantine===5,actual};
  }));
  await test('T14', 'Main order progress uses net customer shipments',()=>isolated(fixture(['İmalat'],20,20),async p=>{
    await receiveProduce(p,20);await production(p,'good',20);await logistics(p,'quality',20);await logistics(p,'shipping',20,'AUD-SHIP-1');await p.evaluate(()=>openOrder('SIP-AUDIT-001'));let actual=await p.evaluate(()=>({summary:shipmentSummary(order('SIP-AUDIT-001')),net:RitimUX07Ledger.data(order('SIP-AUDIT-001')).net}));return {pass:actual.summary.percent===100,actual,evidence:await snapshot(p,'shipped-order-zero-progress')};
  }));
  await test('T15', 'UX06 final release waits for intermediate internal operations',()=>isolated(fixture(['İmalat','Tesviye'],10,10),async p=>{
    await receiveProduce(p,10);await production(p,'good',10);await logistics(p,'quality',10);let actual=await p.evaluate(()=>({approved:RitimUX07Ledger.data(order('SIP-AUDIT-001')).approved,op:job('WO-AUDIT-001').op}));return {pass:actual.approved===0,actual};
  }));
  await test('T16', 'Outbound external movement removes source physical stock',()=>isolated(fixture(['İmalat','Kaplama'],10,10),async p=>{
    await receiveProduce(p,10);await production(p,'good',10);await logistics(p,'external',10,'AUD-EXT-1');let actual=await p.evaluate(()=>({source:job('WO-AUDIT-001').ux05,sourceGood:job('WO-AUDIT-001').good,externalOpen:RitimUX07Ledger.data(order('SIP-AUDIT-001')).supplierOpen,warnings:RitimUX07.audit().warnings}));return {pass:actual.sourceGood===0||!!actual.source.outbound,actual};
  }));
  await test('T17', 'Legacy shipment function cannot bypass final QA',()=>isolated(fixture(['İmalat','Tesviye'],10,10),async p=>{
    await receiveProduce(p,10);await production(p,'good',10);await p.evaluate(()=>openShip('WO-AUDIT-001'));await p.locator('#shipQty').fill('10');await p.getByRole('button',{name:'Sevkiyatı Kaydet',exact:true}).click();let actual=await p.evaluate(()=>({legacy:state.shipments,state:job('WO-AUDIT-001').state,releases:RitimUX07Ledger.data(order('SIP-AUDIT-001')).approved}));return {pass:actual.legacy.length===0,actual};
  }));
  await test('T18', 'Allocation audit detects per-job overplan and dangling job reference',async()=>{
    let s=fixture();s.ux06={'SIP-AUDIT-001':{receipts:[{qty:250}],allocations:[{job:'WO-AUDIT-001',qty:200},{job:'MISSING-JOB',qty:50}],dispatches:[],returns:[],releases:[],shipments:[],customerReturns:[],entries:[]}};
    return isolated(s,async p=>{let actual=await p.evaluate(()=>RitimUX07.audit().warnings);return {pass:actual.length>0,actual}});
  });
  await test('T19', 'Audit is read-only',()=>isolated(fixture(),async p=>{let actual=await p.evaluate(()=>{let before=JSON.stringify(state);RitimUX07.audit();return {changed:before!==JSON.stringify(state),ux06:state.ux06}});return {pass:!actual.changed,actual}}));
  await test('T20', 'Unassigned work order opens its own operator context',()=>isolated(null,async p=>{await p.evaluate(()=>openJob('DEMO-IE-004'));await p.getByRole('button',{name:'Operatör Ekranı',exact:true}).click();const actual=await p.locator('.ux05-hero .eyebrow').textContent();return {pass:actual.includes('DEMO-IE-004'),actual}}));
  await test('T21', 'Mobile navigation exposes audit and transaction history',()=>isolated(null,async p=>{let actual=await p.locator('.bottomnav button').allTextContents();return {pass:actual.some(t=>/Kontrol/.test(t))&&actual.some(t=>/Hareket/.test(t)),actual};},360));
  await test('T22', 'PDF load and wizard modal Escape',()=>isolated(null,async p=>{await p.evaluate(()=>showDrawing('DEMO-SIP-001'));const pdf=await p.locator('iframe[title="Teknik resim PDF"]').getAttribute('src');const response=await p.request.get(BASE+pdf);await p.keyboard.press('Escape');return {pass:response.status()===200&&await p.locator('.modal').count()===0,actual:{pdf,status:response.status()}}}));
  await test('T23', 'Drawing revision has immutable history',()=>isolated(fixture(),async p=>{await p.evaluate(()=>openOrder('SIP-AUDIT-001'));await p.locator('input[type=file]').setInputFiles({name:'audit-revision.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});await p.waitForFunction(()=>order('SIP-AUDIT-001').drawing.startsWith('data:'));let actual=await p.evaluate(()=>({revision:order('SIP-AUDIT-001').revision,keys:Object.keys(order('SIP-AUDIT-001')),events:state.events.length}));return {pass:actual.events>0&&actual.keys.some(k=>/revisions|drawingHistory/i.test(k)),actual}}));
  await test('T24', 'Apostrophe-containing order ID remains navigable',()=>isolated(null,async p=>{await p.evaluate(()=>{state.orders.push({...state.orders[0],id:"SIP-AUDIT-O'NEIL"});go('orders')});await p.locator('.order-card-v4').last().click();let actual=await p.locator('#page').textContent();return {pass:actual.includes("SIP-AUDIT-O'NEIL")&&!actual.includes('Sipariş bulunamadı'),actual}}));
  await test('T25', 'Storage failure does not report successful material commit',()=>isolated(fixture(),async p=>{await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Audit quota','QuotaExceededError')}});await logistics(p,'material',10,'AUD-QUOTA');let actual=await p.evaluate(()=>({inMemory:RitimUX07Ledger.data(order('SIP-AUDIT-001')).material,persisted:JSON.parse(localStorage.getItem('ritimLiteAnonymousDemoV1')).ux06?.['SIP-AUDIT-001']?.receipts,toast:document.querySelector('.toast')?.textContent}));return {pass:actual.inMemory===0,actual}}));
  await test('T26', 'Wrong-shape persisted state has recovery screen',()=>isolated({user:'Audit',orders:[],jobs:null,events:[],shipments:[]},async p=>({pass:!!await p.locator('#page').textContent(),actual:await p.locator('#app').textContent()})));
  await test('T27', 'Duplicate supplier waybill and unapproved shipment rejected',()=>isolated(fixture(['İmalat','Kaplama'],10,10),async p=>{await receiveProduce(p,10);await production(p,'good',10);await logistics(p,'external',5,'AUD-EXT-1');await logistics(p,'external',1,'AUD-EXT-1');await p.evaluate(()=>{go('logistics');RitimUX06.setTab('shipping')});let actual=await p.evaluate(()=>({dispatches:RitimUX07Ledger.data(order('SIP-AUDIT-001')).d.dispatches.length,shipped:RitimUX07Ledger.data(order('SIP-AUDIT-001')).shipped}));return {pass:actual.dispatches===1&&actual.shipped===0&&await p.locator('.ux6-form button.full').isDisabled(),actual}}));
  await test('T28', 'Keyboard drawing activation',()=>isolated(null,async p=>{await p.evaluate(()=>openOrder('DEMO-SIP-001'));await p.locator('.drawing').focus();await p.keyboard.press('Enter');return {pass:await p.locator('.modal').count()>0}}));
  await test('T29', 'Machine conflict guard preserves assignment and history',()=>isolated(null,async p=>{await p.evaluate(()=>{openJob('DEMO-IE-001');assignMachine('DEMO-IE-001','CNC-02')});let actual=await p.evaluate(()=>({machine:job('DEMO-IE-001').machine,events:state.events.length}));return {pass:actual.machine==='CNC-01',actual}}));
  await test('T30', 'Alternate sales page loads separately',async()=>{const {page,context}=await pageFor(null,390,'ritim_flow_lite_sales_polished.html');try{return {pass:!!await page.locator('#app').textContent(),actual:await page.title(),evidence:await snapshot(page,'alternate-sales-390')}}finally{await context.close()}});
  await test('T31', 'Acceptance production controls at 390px and 360px',async()=>{let actual=[];for(const width of [390,360])await isolated(fixture(),async p=>{await receiveProduce(p);await production(p,'good',60);await production(p,'scrap',3);await production(p,'pending',12);actual.push(await p.evaluate(width=>{let j=job('WO-AUDIT-001');return {width,good:j.good,scrap:j.scrap,pending:j.ux05.pending,received:j.ux05.received,overflow:document.documentElement.scrollWidth>innerWidth+1}},width));await snapshot(p,`acceptance-${width}`)},width);return {pass:actual.every(x=>x.good===60&&x.scrap===3&&x.pending===12&&x.received===100&&!x.overflow),actual}});
  await test('T32', 'Closing job drawing retains selected work order',()=>isolated(null,async p=>{await p.evaluate(()=>openJob('DEMO-IE-001'));await p.getByRole('button',{name:'Tam Ekran',exact:true}).click();await p.getByRole('button',{name:'Kapat',exact:true}).last().click();await p.getByRole('button',{name:'Operasyonlar',exact:true}).click();let actual=await p.locator('#page').textContent();return {pass:!actual.includes('İş bulunamadı'),actual}}));
  await browser.close();
  const report={executedAt:new Date().toISOString(),base:BASE,browser:version,results,layouts,telemetry};
  fs.writeFileSync(path.join(OUT,process.env.AUDIT_TEST_IDS ? 'results-focused.json' : 'results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),telemetry:telemetry.length}));
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
