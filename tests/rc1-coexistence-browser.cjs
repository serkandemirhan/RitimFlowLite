/* Actual local pre-RC1 git artifact and new app on a disposable shared origin. */
const { chromium }=require('playwright');
const { execFileSync,spawnSync }=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {completed}=require('./p0-fixtures.cjs');
const root=path.resolve(process.env.RITIM_APP_ROOT||path.join(__dirname,'..'));
const legacyCommit='a28d5621f175f2e3f5f101396807d9eba60c4ff7';
const legacyKey='ritimLiteAnonymousDemoV1',demoKey='ritimFlowLite:fictional-demo:v1';
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ritim-old-artifact-'));
 const archive=execFileSync('git',['archive',legacyCommit],{cwd:path.resolve(__dirname,".."),maxBuffer:50*1024*1024});
 const unpack=spawnSync('tar',['-x','-C',temp],{input:archive}); if(unpack.status!==0)throw Error('Unable to extract legacy artifact');
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'); const old=u.pathname.startsWith('/old/');
  let rel=old?u.pathname.slice(5):u.pathname.slice(1);if(!rel)rel='index.html';
  const dir=old?temp:root; const file=path.resolve(dir,rel);
  if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.AUDIT_CHROME?{executablePath:process.env.AUDIT_CHROME}:{})});
 const context=await browser.newContext();let errors=[];
 try {
  const old=await context.newPage(),demo=await context.newPage();
  for(const p of [old,demo])p.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await old.goto(base+'/old/');await old.waitForSelector('#page');
  await old.evaluate(()=>save());
  const oldInitial=await old.evaluate(k=>localStorage.getItem(k),legacyKey);assert(oldInitial);
  assert.equal(await old.evaluate(k=>localStorage.getItem(k),demoKey),null);
  await demo.goto(base+'/');await demo.waitForSelector('#page');
  assert.equal(await demo.evaluate(k=>localStorage.getItem(k),legacyKey),oldInitial);
  let initialized=JSON.parse(await demo.evaluate(k=>localStorage.getItem(k),demoKey));
  assert(initialized.transactionState.commands.some(c=>c.kind==='demo.initialize'));
  await demo.evaluate(()=>changeUser("Yönetici"));
  await demo.evaluate(()=>{openWizard();Object.assign(wizard,{id:'SIP-P0',customer:'Kurgusal Test Firma',part:'Test Parçası',partNo:'TEST',qty:20,jobQty:20,jobId:'WO-P0',machine:'',step:3});renderModal();});
  await demo.getByRole('button',{name:'Siparişi Oluştur',exact:true}).click();
  await demo.waitForFunction(()=>state.orders.some(o=>o.id==='SIP-P0'));
  const fixture=completed(); fixture.jobs[0].machine='';
  const added=await demo.evaluate(async fixture=>commitState(d=>{
    Object.assign(d.jobs.find(j=>j.id==='WO-P0'),fixture.jobs[0]);
    d.ux06={...(d.ux06||{}),...fixture.ux06};return {ok:true};
  },{command:{kind:'test.seedFictionalCompletion',args:{order:'SIP-P0'}},commandId:'complete-fictional'}),fixture);
  assert.equal(added.ok,true,JSON.stringify(added));
  const release=await demo.evaluate(()=>commitState(d=>RitimShipping.release(d,'SIP-P0',{qty:20}),{command:{kind:'shipping.release',args:{order:'SIP-P0',qty:20}},commandId:'qa-fictional'}));
  assert.equal(release.ok,true,JSON.stringify(release));
  const ship=await demo.evaluate(()=>RitimCommands.submit('shipping.ship',{order:'SIP-P0',qty:5,ref:'NEW'},{id:'ship-fictional'}));
  assert.equal(ship.ok,true,JSON.stringify(ship));
  const newBefore=await demo.evaluate(k=>localStorage.getItem(k),demoKey);
  await old.evaluate(()=>{const j=state.jobs.find(j=>j.good>0&&!state.shipments.some(s=>s.job===j.id));if(!j)throw Error('Missing eligible old fictional job');openShip(j.id);el('shipQty').value='1';saveShipment()});
  const oldAfter=await old.evaluate(k=>localStorage.getItem(k),legacyKey);
  assert.notEqual(oldAfter,oldInitial);assert.equal(JSON.parse(oldAfter).shipments.length,JSON.parse(oldInitial).shipments.length+1);
  assert.equal(await demo.evaluate(k=>localStorage.getItem(k),demoKey),newBefore);
  await demo.reload();await demo.waitForSelector('#page');assert.equal(await demo.evaluate(k=>localStorage.getItem(k),demoKey),newBefore);
  assert.equal(await demo.evaluate(k=>localStorage.getItem(k),legacyKey),oldAfter);
  const after=JSON.parse(newBefore);assert.equal(after.ux06['SIP-P0'].shipments.length,1);
  assert(after.transactionState.commands.some(c=>c.id==='ship-fictional'));
  const peer=await context.newPage();peer.on('pageerror',e=>errors.push(e.message));await peer.goto(base+'/');await peer.waitForSelector('#page');
  const dupe=await peer.evaluate(()=>RitimCommands.submit('shipping.ship',{order:'SIP-P0',qty:5,ref:'NEW'},{id:'ship-fictional'}));
  assert.equal(dupe.ok,true,JSON.stringify(dupe));assert.equal(dupe.duplicate,true);
  assert.equal(await peer.evaluate(k=>localStorage.getItem(k),demoKey),newBefore);
  assert.deepEqual(errors,[]);
  console.log('PASS actual local legacy artifact: old shipment cannot overwrite independent demo order, shipment, receipts or reload');
  console.log('PASS new peer tab shares namespace and duplicate command is idempotent');
  console.log('2/2; order created in UI; completed production fixture added through protected transaction; local legacy commit is not proof of deployed Pages version');
 }finally{await context.close();await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
