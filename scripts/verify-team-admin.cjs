'use strict';
// Browser regression with the actual BFF CSP; isolated UI fixtures, no live writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),Fastify=require('../backend/node_modules/fastify');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/team-admin');
(async()=>{
 const app=Fastify();require('../backend/src/supabase-auth').makeSupabaseBff({url:'https://example.supabase.co',publishableKey:'public',appOrigin:'https://app.example',pool:{},verifier:{verify:async()=>{throw Error('No session');}}}).routes(app);
 const response=await app.inject('/auth/team');const csp=response.headers['content-security-policy'];assert(csp.includes("style-src 'self' 'unsafe-inline'"));assert(!csp.includes("script-src 'unsafe-inline'"));await app.close();
 const workspace={id:'test',name:'Ritim Test',version:1,sites:[{id:'site',name:'Test Atölyesi',code:'TEST'}],members:[{id:'admin',name:'Test Yöneticisi',admin:true,assignments:[]},{id:'operator',name:'Test Operatörü',assignments:[{siteId:'site',role:'operator'}]}]};
 const html=require('../backend/src/workspace-admin-page').render(workspace,{tenantId:'test',siteId:'site'},'admin',false,[],true,true);
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/auth/team')){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',csp);res.end(html);return;}const files={'/assets/css/workspace-navigation.css':'assets/css/workspace-navigation.css','/assets/css/workspace-admin-navigation.css':'assets/css/workspace-admin-navigation.css'};if(files[req.url]){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,files[req.url])));return;}res.writeHead(404);res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});
 try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused/.test(m.text()))errors.push(m.text());});
 for(const width of [1440,1100,390]){await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port+'/auth/team#team');await page.locator('.role-badge').first().waitFor();
 const geometry=await page.evaluate(()=>({position:getComputedStyle(document.querySelector('.premium-sidebar')).position,sidebar:document.querySelector('.premium-sidebar').getBoundingClientRect().right,main:document.querySelector('main').getBoundingClientRect().left,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(geometry.position,'fixed');assert(geometry.main>=geometry.sidebar);assert(!geometry.overflow,JSON.stringify(geometry));
 assert(await page.locator('#company').isHidden());await page.getByRole('link',{name:'Firma',exact:true}).click();await page.locator('#company').waitFor({state:'visible'});await page.getByRole('link',{name:'Ekip · 2',exact:true}).click();await page.locator('#team').waitFor({state:'visible'});
 const person=page.locator('.person').filter({hasText:'Test Operatörü'});await person.getByRole('button',{name:'Operatör',exact:true}).click();assert(await page.locator('dialog').isVisible());await page.getByRole('button',{name:'Vazgeç',exact:true}).click();
 await person.getByRole('button',{name:'Test Operatörü · Şifre değiştir',exact:true}).click();await page.locator('dialog input[name=password]').fill('Temporary-test-123');await page.locator('dialog input[name=confirmation]').fill('different');assert.equal(await page.locator('dialog form').evaluate(f=>f.checkValidity()),false);await page.locator('dialog input[name=confirmation]').fill('Temporary-test-123');assert.equal(await page.locator('dialog form').evaluate(f=>f.checkValidity()),true);
 await page.screenshot({path:path.join(out,'password-'+width+'.png')});await page.getByRole('button',{name:'Vazgeç',exact:true}).click();assert.equal(await person.locator('input[name=password]').inputValue(),'');
 if(width===1440){await page.locator('.nav-collapse').click();assert(await page.locator('body').evaluate(b=>b.classList.contains('admin-collapsed')));await page.locator('.nav-collapse').click();}
 await page.screenshot({path:path.join(out,'team-'+width+'.png')});checks.push({width,status:'PASS',...geometry});
 }assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
