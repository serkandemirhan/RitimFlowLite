'use strict';
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const out='assets/vendor/ui';fs.mkdirSync(out,{recursive:true});
// Scope upstream styles: the legacy demo, auth pages and dedicated operator layout are not reset.
const css=postcss.parse(fs.readFileSync('node_modules/@tabler/core/dist/css/tabler.min.css','utf8'));
css.walkAtRules('import',r=>r.remove());
css.walkRules(r=>{if(r.parent.type==='atrule'&&/keyframes/.test(r.parent.name))return;r.selectors=r.selectors.map(s=>s===':root'||s==='body'?'.ritim-ui':s.startsWith(':root')?s.replace(':root','.ritim-ui'):'.ritim-ui '+s)});
css.walkComments(c=>{if(c.text.includes('sourceMappingURL'))c.remove()});
fs.writeFileSync(out+'/tabler.scoped.css',css.toString());
for(const [from,to]of [
 ['tabulator-tables/dist/js/tabulator.min.js','tabulator.min.js'],
 ['tabulator-tables/dist/css/tabulator_bootstrap5.min.css','tabulator.min.css'],
 ['@daypilot/daypilot-lite-javascript/daypilot-javascript.min.js','daypilot.min.js'],

 ['tabulator-tables/LICENSE','tabulator.LICENSE'],
 ['@daypilot/daypilot-lite-javascript/LICENSE.txt','daypilot.LICENSE'],
 ['@daypilot/daypilot-lite-javascript/NOTICE.txt','daypilot.NOTICE']])fs.copyFileSync(path.join('node_modules',from),path.join(out,to));
console.log('Pinned upstream UI assets and licenses copied.');
