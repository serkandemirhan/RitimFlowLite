const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const required = [
  'p0-domain.test.cjs', 'p0-transfer.test.cjs', 'p0-planning.test.cjs',
  'p1-domain.test.cjs', 'p0-persistence.test.cjs', 'p0-integrity.test.cjs',
  'p0-concurrency.test.cjs',
];
const minimumTests = 292;
const dir = path.join(root,'artifacts','domain');
fs.mkdirSync(dir,{recursive:true});
const testsDir = path.join(root,'tests');
const discovered = fs.existsSync(testsDir) ? fs.readdirSync(testsDir) : [];
const missing = required.filter(file => !discovered.includes(file));
if (missing.length) {
  const message = `Required domain test files missing: ${missing.join(', ')}`;
  fs.writeFileSync(path.join(dir,'domain-tests.tap'),`# ${message}\n`);
  console.error(message);
  process.exitCode = 1;
} else {
  // Include newly added domain suites as well as the required baseline.
  const files = discovered.filter(x => /^p[01].*\.test\.cjs$/.test(x)).sort();
  const result = spawnSync(process.execPath,['--test','--test-reporter=tap',...files.map(x=>'tests/'+x)],{cwd:root,encoding:'utf8'});
  fs.writeFileSync(path.join(dir,'domain-tests.tap'),result.stdout || '');
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error);
  const count = key => {
    const matches = [...(result.stdout || '').matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  const total=count('tests'), pass=count('pass'), fail=count('fail'), skip=count('skipped'), cancelled=count('cancelled');
  const complete = total !== null && total >= minimumTests && pass === total && fail === 0 && skip === 0 && cancelled === 0;
  if (!complete) console.error(`Incomplete domain test run: tests=${total}, pass=${pass}, fail=${fail}, skipped=${skip}, cancelled=${cancelled}; minimum=${minimumTests}`);
  process.exitCode = result.status === 0 && complete ? 0 : (result.status || 1);
}
