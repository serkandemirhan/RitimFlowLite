const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--rc1');
const publicRoot=packaged?require('./build-rc1.cjs').build().publicRoot:root;
for(const file of ['rc1-init-browser.cjs','rc1-coexistence-browser.cjs']) {
  const run=spawnSync(process.execPath,[path.join('tests',file)],{cwd:root,stdio:'inherit',env:{...process.env,RITIM_APP_ROOT:publicRoot},timeout:300000});
  if(run.error||run.status!==0) {if(run.error) console.error(run.error); process.exit(run.status||1);}
}
