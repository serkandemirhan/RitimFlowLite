const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const project = path.resolve(__dirname,'..');
const required = [
  'p0-domain.test.cjs','p0-transfer.test.cjs','p0-planning.test.cjs',
  'p1-domain.test.cjs','p0-persistence.test.cjs','p0-integrity.test.cjs','p0-concurrency.test.cjs',
];
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ritim-domain-gate-test-'));
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.mkdirSync(path.join(dir,'tests'));
  fs.copyFileSync(path.join(project,'scripts/run-domain.cjs'),path.join(dir,'scripts/run-domain.cjs'));
  return dir;
}
function run(dir) {return spawnSync(process.execPath,['scripts/run-domain.cjs'],{cwd:dir,encoding:'utf8'});}
test('domain gate fails if a required suite is absent',()=>{
  const dir=fixture();
  try {
    for (const file of required.filter(f=>f!=='p1-domain.test.cjs')) fs.writeFileSync(path.join(dir,'tests',file),'');
    const result=run(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Required domain test files missing: p1-domain\.test\.cjs/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('domain gate fails when suites exist but too few tests run',()=>{
  const dir=fixture();
  try {
    for (const file of required) fs.writeFileSync(path.join(dir,'tests',file),'');
    const result=run(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Incomplete domain test run:.*minimum=292/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
