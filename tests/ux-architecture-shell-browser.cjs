'use strict';
// Focused shell test with a stubbed session; not a Keycloak/security E2E.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
test('API shell displays scoped site and the current navigation destination',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../integration/premium-api.js'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/premium.js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/premium.js'?source:'<!doctype html><div id="app"></div><div id="overlay"></div>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.AUDIT_CHROME||undefined});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=orders`);
  await page.evaluate(()=>{window.RitimVisualClarity={mount(){},identity:()=>''};window.RitimWorkspacePolish={mount(){}};
   window.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);window.el=id=>document.getElementById(id);window.jsArg=x=>"'"+String(x).replaceAll("'","\\'")+"'";
   window.render=null;window.renderModal=null;window.wizardContent=null;window.wizardNext=null;window.openWizard=null;window.wizard=null;window.modal="";window.RitimLegacyRecovery={cleanupBrowser:()=>({removed:0})};window.RitimAuthProvider={createBff:()=>({config:async()=>({enabled:true})})};
   const memberships=[{tenantId:'t',siteId:'s1',tenantName:'Fabrika',siteName:'Ankara'},{tenantId:'t',siteId:'s2',tenantName:'Fabrika',siteName:'Bursa'}];
   window.RitimApiAdapter={create:()=>({session:async()=>({identity:{id:'u',displayName:'Test'},memberships}),qualityControls:async()=>({items:[],total:0,nextAfter:null}),selectScope:async(tenantId,siteId)=>{window.__scopes=(window.__scopes||[]).concat(siteId);return {roles:['viewer'],capabilities:['orders.read','quality.write']}},workCenter:async()=>({today:'2026-11-03',category:'late',query:'',counts:{late:0},categories:[{id:'late',label:'Late'}],items:[]}),jobWorklist:async(q)=>({items:q?.queue==='quality'&&window.__qualityJobs?[{id:'j1',orderId:'o1',number:'BEKLEYEN',quantity:10},{id:'j2',orderId:'o1',number:'SORUNLU',quantity:10}]:[],total:0,query:'',status:'active',machines:[],operators:[]}),productionMonitor:async()=>({jobs:[]}),orderSummary:async(id)=>({orderId:id,status:"open",orderedQuantity:10,unallocatedQuantity:0,compensationQuantity:0,qualityPending:0,repairPending:0,shipping:{availableToShip:0,dispatched:0,netDelivered:0,returned:0,inTransit:0},next:{target:"production-orders",label:"Üretim emirlerini incele"},productionOrders:[],jobs:[]}),compensationOptions:async()=>({losses:[],approvals:[]}),orderClosing:async(id)=>({orderId:id,status:"open",canClose:false,reasons:[],netDelivered:0,orderedQuantity:10}),productionOrders:async()=>({items:[],nextAfter:null}),compensationRecords:async()=>({items:[{id:'c1',orderId:'o1',orderNumber:'SIP-1',partName:'Parça',quantity:2,allocated:0,remaining:2,source:'production_event',state:'available',reason:'Belgelenmiş kayıp'}],nextAfter:null}),rmaRead:async()=>({deliveries:[],returns:[]}),async orderChoices(){const r=await this.orders();return {items:r.orders,total:r.orders.length,nextAfter:null}},orders:async()=>({orders:[{id:'o1',orderNumber:'SIP-1',customer:'Fixture',partName:'Parça',partNumber:'P1',orderedQuantity:10,netShipped:0,status:'open'},{id:'o2',orderNumber:'SIP-2',customer:'Fixture 2',partName:'Parça',partNumber:'P2',orderedQuantity:8,netShipped:0,status:'open'}]}),order:async(id)=>({id,orderNumber:id==='o2'?'SIP-2':'SIP-1',customer:'Fixture',partName:'Parça',partNumber:'P1',orderedQuantity:10,netShipped:0,route:[]}),workOrders:async(id)=>({workOrders:window.__qualityJobs&&id==='o1'?[{id:'j1',orderId:id,workOrderNumber:'BEKLEYEN',status:'running'},{id:'j2',orderId:id,workOrderNumber:'SORUNLU',status:'running'},{id:'j3',orderId:id,workOrderNumber:'TAMAM',status:'complete'}]:[]}),quality:async(order,id)=>{if(id==='j2')throw Error('Sunucu hatası');return {outputs:id==='j1'?[{eventId:'e1',unresolved:3}]:[{eventId:'e2',unresolved:0}]}},traceLot:async(id)=>({input:{id,lot_code:'LOT-1'},output:null,inventory:null,relations:{production:[{id:'out1',input_lot_id:'lot1',order_id:'o1',work_order_id:'job1'}],receipts:[],picks:[],quality:[],shipping:[],returns:[]},omitted:['returns'],truncated:false}),search:async(q)=>{if(q==='FAIL')throw Error('Sunucu erişilemiyor');return {results:[{kind:'order',id:'o1',orderId:'o1',label:'SIP-1',detail:'Fixture'},{kind:'lot',id:'lot1',orderId:'o1',label:'LOT-1',detail:'SIP-1'},{kind:'shipping',id:'ship-1',orderId:'o1',label:'ARAMA-SEVK',detail:'SIP-1'}],truncated:false}},shippingRead:async()=>({totals:{availableToShip:1},lots:[{lotId:'l1',availableToShip:1},{lotId:'l2',availableToShip:1}],events:[],shippingOrders:[{id:'ship-1',status:'draft',allocated:0,dispatched:0,inTransit:0,delivered:0}]}),logisticsQueue:async(kind)=>({items:kind==='shipping'?[{id:'ship-1',orderId:'o1',orderNumber:'SIP-1'}]:kind==='outsourcing'?[{id:'f1',orderId:'o1',orderNumber:'SIP-1'}]:[],nextAfter:null}),outsourcingSuppliers:async()=>({suppliers:[{id:'supplier',name:'Tedarikçi'}]}),outsourcingRead:async()=>({supported:true,operation:{name:'Fason'},jobs:[{id:'f1',supplierId:'supplier'},{id:'f2',supplierId:'supplier'}],lots:[],dispatches:[]}),reworkDecisions:async()=>({decisions:[{id:'d1',orderId:'o1',orderNumber:'SIP-1',partName:'Parça',workOrderNumber:'W1',outputLotId:'lot1',quantity:5,allocated:0,available:5,allocations:[]}],nextAfter:null})})};
   window.RitimServerPendingCommands={create:()=>({load:async()=>{},list:()=>[],clearMemory:()=>{}})};
  });
  await page.addScriptTag({path:path.join(__dirname,'../integration/order-grid.js')});await page.addScriptTag({path:path.join(__dirname,'../integration/operational-grid.js')});await page.addScriptTag({path:path.join(__dirname,'../integration/quality-controls.js')});await page.addScriptTag({url:'/premium.js'});await page.evaluate(()=>RitimPremiumAPI.start());
  await page.getByRole('button',{name:'Devam',exact:true}).click({timeout:5000}).catch(async e=>{throw Error(e.message+' BODY: '+await page.locator('body').innerText()+' ERRORS: '+errors.join(';'))});
  await page.locator('.nav-workspace[title="Fabrika / Ankara"]').waitFor({state:'attached'});

  const active=()=>page.locator('.sidebar button[aria-current="page"]').getAttribute('aria-label');
  const navigate=async view=>{await page.evaluate(v=>RitimPremiumAPI.navigate(v),view);assert.equal(new URL(page.url()).searchParams.get('view'),view);assert.equal(await page.locator('#api-alert').count(),1,await page.locator('body').innerText());assert.equal(await page.locator('#api-alert').innerText(),'')};
  assert.equal(await active(),'Sipari\u015fler');
  // Returns belong to logistics; compensation belongs to production.
  await navigate('returns');assert.equal(await active(),'Lojistik');
  await page.getByRole('heading',{name:'\u0130ade kay\u0131tlar\u0131',exact:true}).waitFor();
  await navigate('compensations');assert.equal(await active(),'\u00dcretim');
  await page.getByText('Belgelenmi\u015f kay\u0131p',{exact:true}).waitFor();
  await navigate('orders');assert.equal(await active(),'Sipari\u015fler');
  await page.goBack();await page.waitForURL(/view=compensations/);await page.waitForFunction(()=>document.querySelector('.sidebar button[aria-current="page"]')?.getAttribute('aria-label')==='\u00dcretim');
  await page.goForward();await page.waitForURL(/view=orders/);
  const search=async query=>{await page.locator('.api-search-disclosure').evaluate(n=>n.open=true);await page.locator('#global-search-input').fill(query);await page.getByRole('search').getByRole('button',{name:'Ara',exact:true}).click()};
  await search('SIP');await page.getByRole('button',{name:/LOT-1.*SIP-1/}).waitFor();
  await search('FAIL');await page.getByText('Arama sonu\u00e7lar\u0131 al\u0131namad\u0131.').waitFor();
  assert.equal(await page.getByRole('button',{name:/LOT-1.*SIP-1/}).count(),0);
  assert.equal(await page.locator('#global-search-input').inputValue(),'FAIL');
  await search('SIP');await page.getByRole('button',{name:/LOT-1.*SIP-1/}).click();
  await page.getByRole('heading',{name:'Lot izlenebilirli\u011fi',level:2}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('lot'),'lot1');
  await navigate('quality-list');assert.equal(await active(),'Kalite');
  const qualityNav=page.getByRole('navigation',{name:'Kalite kontrol b\u00f6l\u00fcmleri'});
  await qualityNav.getByRole('button',{name:'Tamamlanan Kontroller'}).click();
  assert.equal(await qualityNav.getByRole('button',{name:'Tamamlanan Kontroller'}).getAttribute('aria-pressed'),'true');
  await qualityNav.getByRole('button',{name:'A\u00e7\u0131k Kontroller'}).click();
  assert.equal(await qualityNav.getByRole('button',{name:'A\u00e7\u0131k Kontroller'}).getAttribute('aria-pressed'),'true');
  await page.locator('.api-mobile-menu').evaluate(x=>x.open=true);
  await page.getByRole('button',{name:'\u0130\u015f yeri de\u011fi\u015ftir'}).click();
  for(const key of ['view','order','record','lot'])assert.equal(new URL(page.url()).searchParams.get(key),null);
  await page.locator('#api-scope').selectOption('1');await page.getByRole('button',{name:'Devam',exact:true}).click();
  await page.locator('.nav-workspace[title="Fabrika / Bursa"]').waitFor({state:'attached'});
  assert.equal(await page.locator('.nav-workspace[title="Fabrika / Ankara"]').count(),0);
  assert.deepEqual(await page.evaluate(()=>__scopes),['s1','s2']);
  await page.locator('.api-search-disclosure').evaluate(n=>n.open=true);
  assert.equal(await page.locator('#global-search-input').inputValue(),'');
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
});
