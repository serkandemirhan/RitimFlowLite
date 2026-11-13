'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/cloud');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace(/<title>[^<]*<\/title>/,'<title>Ritim Flow Lite | Üretim Yönetimi</title>');
html=html.replace("const API_MODE=new URL(location.href).searchParams.get('mode')==='api';",'const API_MODE=true;window.RITIM_CLOUD=true;');
if(!html.includes('const API_MODE=true;'))throw Error('Cloud API mode not enabled');
const assets=new Set([...html.matchAll(/(?:src|href)="((?:assets|integration)\/[^"?#]+)(?:[^" ]*)"/g)].map(m=>m[1]));
// The server-rendered team page shares these styles with the application shell.
for(const asset of ['assets/css/workspace-navigation.css','assets/css/workspace-admin-navigation.css'])assets.add(asset);
for(const asset of assets){if(asset.includes('..')||!['.js','.css','.svg','.png','.jpg','.woff2'].includes(path.extname(asset)))throw Error('Unexpected public asset');const target=path.join(out,asset);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,asset),target)}
fs.copyFileSync(path.join(root,'integration/drawing-viewer.mjs'),path.join(out,'integration/drawing-viewer.mjs'));
fs.cpSync(path.join(root,'assets/vendor/pdfjs'),path.join(out,'assets/vendor/pdfjs'),{recursive:true});
for(const name of ['tabler.LICENSE','tabulator.LICENSE','daypilot.LICENSE','daypilot.NOTICE'])fs.copyFileSync(path.join(root,'assets/vendor/ui',name),path.join(out,'assets/vendor/ui',name));
fs.mkdirSync(path.join(out,'customers'),{recursive:true});
fs.copyFileSync(path.join(root,'customers/hasmaksan.html'),path.join(out,'customers/hasmaksan.html'));
for(const asset of ['operator.webmanifest','operator-offline.html','workspace.webmanifest','workspace-offline.html'])fs.copyFileSync(path.join(root,asset),path.join(out,asset));
fs.cpSync(path.join(root,'assets/pwa'),path.join(out,'assets/pwa'),{recursive:true});
const publicPaths=[...assets].map(x=>'/'+x).concat(['/workspace.webmanifest','/workspace-offline.html','/operator.webmanifest','/operator-offline.html','/assets/pwa/operator-192.png','/assets/pwa/operator-512.png','/assets/pwa/operator-maskable-512.png','/assets/pwa/operator-180.png']);
const hash=crypto.createHash('sha256').update(html);for(const asset of assets)hash.update(fs.readFileSync(path.join(root,asset)));
const workerTemplate=fs.readFileSync(path.join(root,'operator-sw.js'),'utf8');hash.update(workerTemplate);for(const asset of publicPaths.filter(x=>!assets.has(x.slice(1))))hash.update(fs.readFileSync(path.join(root,asset.slice(1))));
const worker=workerTemplate.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,20)).replace('__PWA_ASSETS__',JSON.stringify(publicPaths));fs.writeFileSync(path.join(out,'operator-sw.js'),worker);
fs.writeFileSync(path.join(out,'index.html'),html);console.log('Cloud UI packaged:',assets.size,'assets plus local PDF renderer');
