'use strict';
const fs=require('node:fs'),path=require('node:path');
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
fs.writeFileSync(path.join(out,'index.html'),html);console.log('Cloud UI packaged:',assets.size,'assets plus local PDF renderer');
