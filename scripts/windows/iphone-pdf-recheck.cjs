'use strict';
// Apply only the pending PDF fix to this test tab. No deployment or backend writes.
const fs=require('fs'),{execFileSync}=require('child_process');
const moduleSource=fs.readFileSync('integration/drawing-viewer.mjs','utf8').replaceAll('../assets/vendor/','https://flow.getritim.com/assets/vendor/');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64');
const pdf=require('../../tests/fixtures/technical-pdf.cjs')().toString('base64');
const css=fs.readFileSync('assets/css/ux-premium-workspace.css','utf8').split(/\r?\n/).filter(line=>/^\.drawing-dialog\[open\]|^#drawing-renderer |^\.drawing-viewport \{|^\.drawing-dialog\.is-expanded\[open\]/.test(line)||line.startsWith('.drawing-dialog.is-expanded .drawing-message {')).join('\n');
const code=`
await js('if(!document.getElementById("api-drawing-dialog")){const d=document.createElement("dialog");d.id="api-drawing-dialog";d.className="drawing-dialog";d.innerHTML="<header><h2>PDF test</h2></header><div id=drawing-renderer></div><a href=#>Download PDF</a>";document.body.append(d)}');
await js('const s=document.createElement("style");s.id="pdf-fix-preview";s.textContent=arguments[0];document.head.append(s);',${JSON.stringify(css)});
const mounted=await wd('/execute/async',{script:'const done=arguments[arguments.length-1];const d=document.getElementById("api-drawing-dialog");d.classList.remove("is-expanded");d.showModal();import(arguments[0]).then(m=>m.mount(document.getElementById("drawing-renderer"),arguments[1],()=>{})).then(()=>done(true)).catch(e=>done({error:e.message}));',args:[${JSON.stringify(moduleUrl)},${JSON.stringify(pdf)}]});
if(mounted!==true)throw Error(JSON.stringify(mounted));await sleep(600);
const measure=()=>js('return {dialog:document.querySelector("#api-drawing-dialog").getBoundingClientRect().height,host:document.querySelector("#drawing-renderer").clientHeight,viewport:document.querySelector(".drawing-viewport").clientHeight,canvas:document.querySelector("canvas").getBoundingClientRect().height,rendered:document.querySelector("canvas").dataset.rendered,overflow:document.documentElement.scrollWidth>innerWidth,page:document.querySelector(".drawing-page").textContent}');
const normal=await measure();await shot('35-pdf-fixed-normal');if(normal.host<=100||normal.viewport<=100||normal.canvas>normal.viewport||normal.rendered!=='true')throw Error('Normal PDF layout failed '+JSON.stringify(normal));
await domClick('[data-action=expand]');await sleep(300);const expanded=await measure();await shot('36-pdf-fixed-expanded');
await domClick('[data-action=next]');await shot('37-pdf-fixed-page-two');
await domClick('[data-action=in]');const zoomed=await measure();await shot('38-pdf-fixed-zoom');
await domClick('[data-action=fit]');await domClick('[data-action=expand]');await sleep(300);const returned=await measure();await shot('39-pdf-fixed-normal-return');
if(returned.host<=100||returned.canvas>returned.viewport||returned.overflow)throw Error('Return layout failed');
fs.writeFileSync(dir+'/pdf-recheck.json',JSON.stringify({status:'PASS_PREVIEW_ONLY',normal,expanded,zoomed,returned,syntheticFixture:true,nativeGesturesTested:false,source:'Pending local CSS and viewer module injected into existing Safari test tab; not deployed'},null,2));
await js('document.getElementById("api-drawing-dialog").close()');console.log(JSON.stringify({normal,expanded,returned}));
`;
try{process.stdout.write(execFileSync(process.execPath,['scripts/windows/iphone-webdriver.cjs'],{input:code,encoding:'utf8',timeout:150000,windowsHide:true,maxBuffer:8000000}));}catch(e){process.stdout.write(e.stdout||'');process.stderr.write(e.stderr||e.message);process.exitCode=1;}
