const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {build,verify,verifyCurrent,inspect,sha} = require('../scripts/build-rc1.cjs');
const config = require('../release/rc1.config.json');
const root = path.resolve(__dirname,'..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(),'ritim-rc1-'));
test('RC1 is deterministic, source-preserving and an exact public allowlist',()=>{
  const base=temp();
  try {
    const hashes=config.assets.map(p=>sha(fs.readFileSync(path.join(root,p))));
    const a=build({base:path.join(base,'a')}), b=build({base:path.join(base,'b')});
    assert.deepEqual(a.manifest,b.manifest);
    assert(verify(a));
    assert.equal(a.manifest.assets.length,37);
    for (const row of a.manifest.assets) {
      const bytes=fs.readFileSync(path.join(a.publicRoot,row.target));
      assert(bytes.equals(fs.readFileSync(path.join(b.publicRoot,row.target))));
      if (!row.source.endsWith('.html')) assert(bytes.equals(fs.readFileSync(path.join(root,row.source))));
    }
    assert.deepEqual(config.assets.map(p=>sha(fs.readFileSync(path.join(root,p)))),hashes);
    assert(!a.manifest.assets.some(x=>/tests|docs|node_modules|\.git|assets\/test$/.test(x.target)));
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
test('RC1 verifies dependency order and rejects missing factories',()=>{
  const base=temp();
  try {
    for (const file of config.assets) {
      fs.mkdirSync(path.dirname(path.join(base,file)),{recursive:true});
      fs.copyFileSync(path.join(root,file),path.join(base,file));
    }
    assert(inspect(base));
    const index=path.join(base,'index.html');
    fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace(/<script src="assets\/js\/persistence\.js[^>]*><\/script>/,''));
    assert.throws(()=>inspect(base),/must load after/);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
test('RC1 detects mixed/corrupt assets and never overwrites an edited candidate',()=>{
  const base=temp();
  try {
    const a=build({base});
    const file=path.join(a.publicRoot,a.manifest.assets.find(x=>x.target.endsWith('.js')).target);
    fs.appendFileSync(file,'/*unexpected*/');
    assert.throws(()=>verify(a),/checksum mismatch/);
    assert.throws(()=>build({base}),/Existing candidate differs/);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
test('RC1 rejects accidental development files in public output',()=>{
  const base=temp();
  try {
    const a=build({base});
    fs.writeFileSync(path.join(a.publicRoot,'private-backup.json'),'{}');
    assert.throws(()=>verify(a),/unexpected\/missing/);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});

test('RC1 archive packaging rejects active legacy mutation code',()=>{
  const base=temp();
  try {
    for (const file of config.assets) {
      fs.mkdirSync(path.dirname(path.join(base,file)),{recursive:true});
      fs.copyFileSync(path.join(root,file),path.join(base,file));
    }
    fs.appendFileSync(path.join(base,'ritim_flow_lite_sales_polished.html'),'<script>function ship(){}</script>');
    assert.throws(()=>inspect(base),/active inline code/);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});

test('RC1 verification never recreates a missing artifact or rewrites its manifest',()=>{
  const base=temp();
  try {
    const a=build({base});
    const before=fs.readFileSync(a.manifestPath,'utf8');
    assert(verifyCurrent({base}));
    const missing=path.join(a.publicRoot,a.manifest.assets[0].target);
    fs.unlinkSync(missing);
    assert.throws(()=>verifyCurrent({base}),/unexpected\/missing/);
    assert(!fs.existsSync(missing));
    assert.equal(fs.readFileSync(a.manifestPath,'utf8'),before);
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
