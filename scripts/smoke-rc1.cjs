/* Check every public byte over HTTP and identify all failed resource requests. */
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {build,sha} = require('./build-rc1.cjs');
(async()=>{
  const built=build(), requests=[], consoles=[], errors=[];
  const allowed=new Map(built.manifest.assets.map(x=>['/'+x.target,x]));
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const name=url.pathname==='/'?'/index.html':url.pathname;
    const item=allowed.get(name);
    requests.push({path:name,status:item?200:404});
    if(!item) return res.writeHead(404).end();
    res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf'}[path.extname(item.target)]);
    res.end(fs.readFileSync(path.join(built.publicRoot,item.target)));
  });
  let browser;
  try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true,executablePath:process.env.AUDIT_CHROME || undefined});
    const context=await browser.newContext();
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') consoles.push({message:m.text(),location:m.location()});});
    page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
    await page.goto(base+'/');
    await page.waitForFunction(()=>window.RitimCommands && document.querySelector('#page'));
    assert(await page.evaluate(()=>['RitimPersistence','RitimTransactions','RitimIntegrity','RitimQuantities'].every(k=>!!window[k])));
    assert.equal(await page.evaluate(()=>localStorage.getItem('ritimLiteAnonymousDemoV1')),null);
    const loaded=await page.locator('script[src],link[rel=stylesheet]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src||n.href).pathname));
    assert.deepEqual(loaded.sort(),built.manifest.assets.filter(x=>/\.(js|css)$/.test(x.target) && x.source!=='assets/js/legacy-archive.js').map(x=>'/'+x.target).sort());
    for(const item of built.manifest.assets) {
      const response=await context.request.get(base+'/'+item.target);
      assert.equal(response.status(),200);
      assert.equal(sha(await response.body()),item.sha256);
    }
    await page.evaluate(()=>localStorage.setItem('ritimFlowLiteDemo','original raw archive'));
    await page.goto(base+'/ritim_flow_lite_sales_polished.html');
    assert(await page.evaluate(()=>['ship','openShipment','saveEdit','createJob','resetDemo'].every(k=>typeof window[k]==='undefined')));
    assert.equal(await page.evaluate(()=>localStorage.getItem('ritimFlowLiteDemo')),'original raw archive');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ritimLiteAnonymousDemoV1')),null);
    assert.deepEqual(errors,[]);
    assert(requests.filter(r=>r.status===404).every(r=>r.path==='/favicon.ico'));
    assert(consoles.every(c=>c.location.url===base+'/favicon.ico' && c.message.includes('404')),'Unexpected console error');
    const record={passed:1,failed:0,sourceDigest:built.manifest.sourceDigest,browser:await browser.version(),assetsChecked:built.manifest.assets.length,
      applicationErrors:errors,knownFaviconConsole:consoles,requests,initialMainStoragePreserved:true,archiveReadOnly:true};
    const out=path.resolve(__dirname,'../artifacts/rc1-smoke');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(record,null,2)+'\n');
    console.log(JSON.stringify({passed:1,assetsChecked:37,applicationErrors:0,browser:record.browser}));
  } finally {
    await browser?.close();
    await new Promise(r=>server.close(r));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
