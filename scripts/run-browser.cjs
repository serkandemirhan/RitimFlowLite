/* Run existing suites sequentially, with strict totals and clean disposable profiles. */
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const packaged = process.argv.includes('--rc1');
const build = packaged ? require('./build-rc1.cjs').build() : null;
const suites = [['p0',16],['p0-transfer',9],['p0-planning',9],['p1',11],['p0-persistence',34],['p0-integrity',11],['p0-concurrency',20]];
const out = path.join(root,'artifacts',packaged ? 'rc1-browser' : 'source-browser',new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
const summary = {target:build?.manifest.sourceDigest || 'working-tree',playwright:require('playwright/package.json').version,browserExecutable:process.env.AUDIT_CHROME || 'Playwright-managed Chromium',suites:[],passed:0,failed:0,applicationErrors:0};
fs.mkdirSync(out,{recursive:true});
for (const [suite,expected] of suites) {
  const evidence = path.join(out,suite);
  // Prevent an old successful JSON from satisfying a crashing new run.
  if (fs.existsSync(evidence)) throw new Error(`Evidence directory already exists: ${evidence}. Archive it before rerunning.`);
  const env = {...process.env,P0_EVIDENCE_DIR:evidence,RITIM_APP_ROOT:build?.publicRoot || root};
  delete env.NODE_PATH;
  delete env.TEST_FILTER;
  const run = spawnSync(process.execPath,[`tests/${suite}-browser.cjs`],{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});
  fs.mkdirSync(evidence,{recursive:true});
  fs.writeFileSync(path.join(evidence,'run.log'),(run.stdout || '')+(run.stderr || ''));
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  let report;
  try {report = JSON.parse(fs.readFileSync(path.join(evidence,'browser-results.json'),'utf8'));} catch (_) {}
  const valid = run.status === 0 && report?.passed === expected && report.failed === 0 && Array.isArray(report.applicationErrors) && report.applicationErrors.length === 0;
  summary.suites.push({suite,expected,exit:run.status,error:run.error?.message,passed:report?.passed,failed:report?.failed,applicationErrors:report?.applicationErrors?.length,valid});
  summary.passed += report?.passed || 0;
  summary.failed += report?.failed || 0;
  summary.applicationErrors += report?.applicationErrors?.length || 0;
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  if (!valid) {process.exitCode = 1; break;}
}
console.log(JSON.stringify(summary,null,2));
