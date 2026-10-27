/* Characterize two different public builds; never touches application source/data. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {build} = require('../../../scripts/build-rc1.cjs');
const config = require('../../../release/rc1.config.json');
const project = path.resolve(__dirname,'../../..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(),'ritim-rc1-rollout-probe-'));
const input = path.join(sandbox,'input');
for (const asset of config.assets) {
  const dst = path.join(input,asset);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(path.join(project,asset),dst);
}
const base = path.join(sandbox,'dist');
const oldBuild = build({root:input,base});
const modulePath = 'assets/js/quantity-model.js';
fs.appendFileSync(path.join(input,modulePath),'\n/* harmless alternate asset for rollout probe */\n');
const newBuild = build({root:input,base});
const oldAsset=oldBuild.manifest.assets.find(x=>x.source===modulePath);
const newAsset=newBuild.manifest.assets.find(x=>x.source===modulePath);
assert.notEqual(oldAsset.target,newAsset.target);
assert(fs.readFileSync(path.join(oldBuild.publicRoot,'index.html'),'utf8').includes(oldAsset.target));
assert(fs.readFileSync(path.join(newBuild.publicRoot,'index.html'),'utf8').includes(newAsset.target));
assert(!fs.existsSync(path.join(newBuild.publicRoot,oldAsset.target)));
const result={type:'characterization, not release approval',oldSourceDigest:oldBuild.manifest.sourceDigest,
  newSourceDigest:newBuild.manifest.sourceDigest,oldAsset:oldAsset.target,newAsset:newAsset.target,
  oldHTMLReferencesOldAsset:true,newHTMLReferencesNewAsset:true,previousAssetInNewPublicArtifact:false,
  implication:'Current public artifact does not itself retain a changed previous hashed JS file; actual hosting/cache behavior requires acceptance.',
  sourceDataChanged:false};
console.log(JSON.stringify(result,null,2));
