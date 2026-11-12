'use strict';
// Disposable native PostgreSQL cluster. Never connects to the installed Windows service.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {Pool} = require('../../backend/node_modules/pg');
const {roleConnections} = require('../../backend/test-support/roles.cjs');
const {migrate} = require('../../backend/src/migrate');
const {provisionRuntime} = require('../../backend/security/provision-runtime');
const {buildApp} = require('../../backend/src/app');
const root = path.resolve(__dirname, '../..');
const bin = process.env.RITIM_PG_BIN || path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL/18/bin');
const evidence = path.join(root, 'artifacts/native-postgres');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function smoke(databaseUrl) {
  const admin = new Pool({connectionString: databaseUrl});
  const roles = roleConnections(databaseUrl);
  let migration, runtime, app;
  try {
    await roles.createRole(admin, 'ritim_smoke_migration');
    await roles.createRole(admin, 'ritim_smoke_runtime');
    await admin.query('CREATE SCHEMA ritim_smoke AUTHORIZATION ritim_smoke_migration');
    migration = new Pool({connectionString: roles.roleUrl('ritim_smoke_migration'), options: '-c search_path=ritim_smoke'});
    const applied = await migrate(migration);
    const repeat = await migrate(migration);
    if (applied.length !== 64 || repeat.length !== 0) throw Error('Unexpected migration/repeat result');
    const client = await migration.connect();
    try {
      await client.query('BEGIN');
      await provisionRuntime(client, 'ritim_smoke', 'ritim_smoke_runtime', {isolatedDevelopment:true});
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    runtime = new Pool({connectionString: roles.roleUrl('ritim_smoke_runtime'), options: '-c search_path=ritim_smoke'});
    await require('../../backend/src/readiness').checkReadiness(runtime,{isolatedDevelopment:true});
    app = buildApp({pool: runtime, isolatedDevelopment: true});
    const address = await app.listen({host:'127.0.0.1', port:0});
    const checks = {};
    for (const [route, expected] of [['/health/live',200], ['/health/ready',200], ['/api/v1/session',401]]) {
      checks[route] = (await fetch(address + route)).status;
      if (checks[route] !== expected) throw Error('Native API smoke failed: ' + route);
    }
    const version = (await admin.query('SHOW server_version')).rows[0].server_version;
    const result = {serverVersion:version, migrations:applied.length, repeatMigrations:repeat.length, restrictedRuntime:true, checks};
    fs.writeFileSync(path.join(evidence,'runtime-smoke.json'), JSON.stringify(result,null,2)+'\n');
    console.log('Native API smoke: 64 migrations, repeat 0, restricted runtime readiness 200, unauthenticated session 401');
  } finally {
    if (app) await app.close();
    if (runtime) await runtime.end();
    if (migration) await migration.end();
    await admin.end();
  }
}

async function operationsSmoke(databaseUrl, privateDirectory) {
  const ops = require('./database-operations.cjs');
  const url = new URL(databaseUrl);
  const adminIdentity = {user:decodeURIComponent(url.username), password:decodeURIComponent(url.password)};
  const config = {host:url.hostname,port:Number(url.port),database:'ritim_windows_dev',schema:'ritim',isolatedDevelopment:true,
    migration:{user:'ritim_windows_migration',password:crypto.randomBytes(32).toString('hex')},
    runtime:{user:'ritim_windows_runtime',password:crypto.randomBytes(32).toString('hex')}};
  const before = new Pool({connectionString:databaseUrl});
  let originalOwners;
  try {originalOwners=(await before.query('SELECT datname,datdba FROM pg_database ORDER BY datname')).rows;}
  finally {await before.end();}
  await ops.initialize(config,adminIdentity);
  await assert.rejects(ops.initialize(config,adminIdentity),/already exist/);
  assert.equal((await ops.upgrade(config)).length,64);
  assert.deepEqual(await ops.upgrade(config),[]);
  await ops.provision(config);
  await ops.ready(config);
  await assert.rejects(ops.upgrade({...config,migration:adminIdentity}),/non-superuser owner/);
  const source = new Pool({host:config.host,port:config.port,database:config.database,...adminIdentity});
  const tenant=crypto.randomUUID(),site=crypto.randomUUID(),order=crypto.randomUUID();
  try {
    await source.query("INSERT INTO ritim.tenants(id,name) VALUES($1,'Fictional Windows backup test')",[tenant]);
    await source.query("INSERT INTO ritim.sites(tenant_id,id,code,name) VALUES($1,$2,'TEST','Fictional')",[tenant,site]);
    await source.query("INSERT INTO ritim.orders(tenant_id,site_id,id,order_number,customer,part_number,ordered_qty) VALUES($1,$2,$3,'WIN-BACKUP','Fictional','TEST',42)",[tenant,site,order]);
  }finally{await source.end();}
  const file=path.join(privateDirectory,'windows-operations.dump');
  await ops.backup(config,file,bin,adminIdentity);
  await assert.rejects(ops.backup(config,file,bin,adminIdentity),/new absolute/);
  await assert.rejects(ops.restoreTest(config,file,config.database,bin,adminIdentity),/Separate new/);
  const restored='ritim_windows_restore_test';
  await ops.restoreTest(config,file,restored,bin,adminIdentity);
  await assert.rejects(ops.restoreTest(config,file,restored,bin,adminIdentity),/already exists/);
  const restoredPool=new Pool({host:config.host,port:config.port,database:restored,...adminIdentity});
  try {
    assert.equal((await restoredPool.query('SELECT ordered_qty::int quantity FROM ritim.orders WHERE id=$1',[order])).rows[0].quantity,42);
    assert.equal((await restoredPool.query("SELECT relrowsecurity AND relforcerowsecurity AS forced FROM pg_class WHERE oid='ritim.orders'::regclass")).rows[0].forced,true);
    for(const original of originalOwners){
      assert.equal((await restoredPool.query('SELECT datdba FROM pg_database WHERE datname=$1',[original.datname])).rows[0].datdba,original.datdba);
    }
  }finally{await restoredPool.end();}
  const report={status:'PASS',sourceDatabase:config.database,restoreDatabase:restored,migrations:56,repeatMigrations:0,restoredOrderQuantity:42,forcedRls:true,restrictedReadiness:true,existingDatabaseOwnershipPreserved:true,destructiveActionsRejected:true,backupSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  fs.writeFileSync(path.join(evidence,'windows-operations.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Windows database operations PASS: initialize, migrate, provision, restricted readiness, backup/restore, fictional quantity 42 and FORCE RLS preserved; destructive targets refused.');
}

async function main() {
  if (process.platform !== 'win32' || process.versions.node.split('.')[0] !== '22') throw Error('Windows and Node 22 required');
  for (const exe of ['initdb.exe','pg_ctl.exe','pg_dump.exe','pg_restore.exe']) {
    if (!fs.existsSync(path.join(bin,exe))) throw Error('Required PostgreSQL tool missing: '+exe);
  }
  fs.mkdirSync(evidence,{recursive:true});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'ritim-native-pg-'));
  // Protect the folder before writing a password. Password file is deleted immediately after initdb.
  const sid = execFileSync('powershell.exe',['-NoProfile','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();
  if (!/^S-1-\d+(?:-\d+)+$/.test(sid)) throw Error('Unable to determine Windows identity');
  execFileSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
  const password = crypto.randomBytes(32).toString('hex');
  const passwordFile = path.join(directory,'bootstrap-password');
  const data = path.join(directory,'data');
  const port = await freePort();
  let started = false;
  try {
    fs.writeFileSync(passwordFile,password+'\n',{flag:'wx'});
    try {
      execFileSync(path.join(bin,'initdb.exe'),['-D',data,'--username=ritim_test_admin','--pwfile='+passwordFile,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--encoding=UTF8','--locale=C'],{stdio:'pipe',windowsHide:true});
    } finally { fs.rmSync(passwordFile,{force:true}); }
    // Background postgres must not inherit Node's capture pipe on Windows.
    execFileSync(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'ignore',windowsHide:true,timeout:90000});
    started = true;
    const url = new URL(`postgresql://ritim_test_admin@127.0.0.1:${port}/postgres`);
    url.password = password;
    const bootstrap = new Pool({connectionString:url.toString()});
    try { await bootstrap.query('CREATE DATABASE ritim_native_test ENCODING \'UTF8\' TEMPLATE template0'); }
    finally { await bootstrap.end(); }
    url.pathname = '/ritim_native_test';
    // Assert the target before fictional fixtures: new loopback cluster and dedicated database only.
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ritim_native_test') throw Error('Invalid disposable target');
    if(process.argv.includes('--cloud-upgrade')){await require('./verify-cloud-upgrade-sql.cjs')(url.toString());return;}
    if(process.argv.includes('--shipping-workspace-ui')){await require('./verify-header-toolbar.cjs')(url.toString(),{shippingOnly:true});return;}
    if(process.argv.includes('--operator-manager-ui')){await require('./verify-header-toolbar.cjs')(url.toString(),{operatorManagerOnly:true});return;}
    if(process.argv.includes('--quality-workspace')){await require('./verify-header-toolbar.cjs')(url.toString(),{qualityOnly:true});return;}
    if(process.argv.includes('--header-toolbar')){await require('./verify-header-toolbar.cjs')(url.toString());return;}
    if(process.argv.includes('--material-pages')){await require('./verify-material-stock-pages.cjs')(url.toString());return;}
    if (process.argv.includes('--queue-benchmark-only')) { await require('./benchmark-queues.cjs')(url.toString()); return; }
    if (process.argv.includes('--operations-only')) {
      await operationsSmoke(url.toString(),directory);
      return;
    }
    if(process.argv.includes('--lifecycle-only')){await require('./local-lifecycle.cjs')(url.toString());return;}
    const qualityOnly=process.argv.includes('--quality-only');
    const planningOnly=process.argv.includes('--planning-only');
    const files = process.argv.includes('--shipping-workspace')?['test/shipping-workspace.test.js','test/b04b1a-quality.test.js','test/recovery-routes.test.js']:process.argv.includes('--operator-access')?['test/b04a-production.test.js']:process.argv.includes('--team-users')?['test/workspace-administration.test.js','test/workspace-users.test.js']:planningOnly?['test/b03b-planning.test.js']:qualityOnly?['test/b04b1a-quality.test.js']:fs.readdirSync(path.join(root,'backend/test')).filter(x=>x.endsWith('.test.js')).sort().map(x=>'test/'+x);
    const result = spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{
      cwd:path.join(root,'backend'), encoding:'utf8', maxBuffer:32*1024*1024, timeout:300000, windowsHide:true,
      env:{...process.env, PATH:bin+path.delimiter+process.env.PATH, TEST_DATABASE_URL:url.toString()},
    });
    const redact = value => String(value||'').split(password).join('[REDACTED]').replace(/PASSWORD\s+'[^']*'/gi,"PASSWORD '[REDACTED]'");
    fs.writeFileSync(path.join(evidence,qualityOnly?'quality-consistency.tap':'backend.tap'),redact(result.stdout)+redact(result.stderr));
    const totals = (result.stdout||'').split(/\r?\n/).filter(x=>/^# (tests|pass|fail|skipped|cancelled) /.test(x));
    totals.forEach(line=>console.log(line));
    const testCount=Number((result.stdout||'').match(/^# tests (\d+)$/m)?.[1]||0);
    if (result.error) console.log('Backend runner failed: '+result.error.code);
    if(qualityOnly){if(result.status!==0||result.error||testCount<2||!/^# fail 0$/m.test(result.stdout||'')||!/^# skipped 0$/m.test(result.stdout||''))throw Error('Quality regression failed; inspect artifacts/native-postgres/quality-consistency.tap');return;}
    if(planningOnly){if(result.status!==0||result.error||testCount<2||!/^# fail 0$/m.test(result.stdout||'')||!/^# skipped 0$/m.test(result.stdout||''))throw Error('Planning regression failed; inspect artifacts/native-postgres/backend.tap');return;}
    if(process.argv.includes('--team-users')||process.argv.includes('--operator-access')||process.argv.includes('--shipping-workspace')){if(result.status!==0||!/^# fail 0$/m.test(result.stdout||''))throw Error('Managed users regression failed; inspect artifacts/native-postgres/backend.tap');return;}
    await smoke(url.toString());
    if (result.status !== 0 || result.error || testCount<142 || !/^# fail 0$/m.test(result.stdout||'') || !/^# skipped 0$/m.test(result.stdout||'') || !/^# cancelled 0$/m.test(result.stdout||'')) {
      throw Error('Backend regression failed; inspect redacted artifacts/native-postgres/backend.tap');
    }
    await operationsSmoke(url.toString(),directory);
  } finally {
    if (started) execFileSync(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop'],{stdio:'pipe',windowsHide:true});
    // Keep the stopped cluster in its private temp directory for troubleshooting; never reset/reuse it.
    console.log('Disposable native cluster stopped; installed PostgreSQL service was unchanged.');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
