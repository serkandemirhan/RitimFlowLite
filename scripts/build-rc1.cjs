/* Deterministic allowlist packaging. Never writes application sources or storage. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const config = require('../release/rc1.config.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const activeHTML = html => html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '');
function inspect(root) {
  const inputs = config.assets.map(source => {
    assert(!source.includes('..') && !path.isAbsolute(source), 'Unsafe asset path');
    assert(fs.lstatSync(path.join(root, source)).isFile(), `Missing/plain file required: ${source}`);
    const bytes = fs.readFileSync(path.join(root, source));
    const hash = sha(bytes);
    const ext = path.extname(source);
    return { source, sha256: hash, bytes: bytes.length,
      target: ['.js', '.css'].includes(ext) ? source.slice(0, -ext.length) + '.' + hash + ext : source };
  });
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...activeHTML(index).matchAll(/<script\b([^>]*?)src="([^"]+)"[^>]*>/g)]
    .map(m => ({source:m[2].split('?')[0], deferred:/\bdefer\b/.test(m[1])}));
  const order = scripts.filter(x => !x.deferred).map(x => x.source);
  // Domain factories capture their dependencies immediately. Deferred DOM modules run last.
  for (const file of inputs.filter(x => x.source.endsWith('.js') && !x.source.includes('/ux-'))) {
    if (!order.includes(file.source)) continue;
    const code = fs.readFileSync(path.join(root, file.source), 'utf8');
    for (const match of code.matchAll(/require\(["']\.\/([^"']+)["']\)/g)) {
      const dep = 'assets/js/' + match[1];
      assert(order.indexOf(dep) >= 0 && order.indexOf(dep) < order.indexOf(file.source),
        `${file.source} must load after ${dep}`);
    }
  }
  const archive = activeHTML(fs.readFileSync(path.join(root, 'ritim_flow_lite_sales_polished.html'), 'utf8'));
  const archiveScripts = [...archive.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1].split('?')[0]);
  assert.deepEqual(archiveScripts, ['assets/js/legacy-archive.js']);
  assert(!/<script\b[^>]*>(?!\s*<\/script>)[\s\S]*?<\/script>/i.test(archive), 'Archive has active inline code');
  const archiveCode = fs.readFileSync(path.join(root,'assets/js/legacy-archive.js'),'utf8');
  assert(!/\b(setItem|removeItem|clear)\s*\(/.test(archiveCode), 'Archive must be read-only');
  for (const entry of ['index.html','ritim_flow_lite_sales_polished.html']) {
    const html = activeHTML(fs.readFileSync(path.join(root, entry),'utf8')).replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, '$1</script>');
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const ref = m[1].split('?')[0];
      if (/^(data:|https?:|blob:)/.test(ref)) continue;
      assert(config.assets.includes(ref), `Undeclared local dependency: ${ref}`);
    }
  }
  return {inputs, scripts};
}
function plan(root) {
  const {inputs,scripts} = inspect(root);
  const sourceDigest = sha(JSON.stringify({version:1,builder:sha(fs.readFileSync(__filename)),inputs}));
  const contents = new Map();
  const map = new Map(inputs.map(x => [x.source,x]));
  const assets = inputs.map(item => {
    let bytes = fs.readFileSync(path.join(root,item.source));
    if (item.source.endsWith('.html')) {
      let html = bytes.toString('utf8');
      html = html.replace(/<(script|link)\b[^>]*>/g, tag => tag.replace(/\b(src|href)="([^"?]+)(?:\?[^"]*)?"/, (all,attr,ref) => {
        const dep = map.get(ref);
        if (!dep) return all;
        const sri = Buffer.from(dep.sha256,'hex').toString('base64');
        return `${attr}="${dep.target}" integrity="sha256-${sri}" crossorigin="anonymous"`;
      }));
      bytes = Buffer.from(html);
    }
    contents.set(item.target,bytes);
    return {...item,sourceSha256:item.sha256,sha256:sha(bytes),bytes:bytes.length};
  });
  return {manifest:{format:1,release:config.name,sourceDigest,assets,scripts},contents};
}
function build({root = path.resolve(__dirname, '..'), base = path.join(root,'dist',config.name)} = {}) {
  const {manifest,contents} = plan(root);
  const dir = path.join(base,manifest.sourceDigest), publicRoot = path.join(dir,'public');
  for (const [target,bytes] of contents) {
    const file = path.join(publicRoot,target);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(bytes),`Existing candidate differs: ${file}`);
    else fs.writeFileSync(file,bytes,{flag:'wx'});
  }
  const manifestPath = path.join(dir,'manifest.json');
  const json = JSON.stringify(manifest,null,2)+'\n';
  if (fs.existsSync(manifestPath)) assert.equal(fs.readFileSync(manifestPath,'utf8'),json);
  else fs.writeFileSync(manifestPath,json,{flag:'wx'});
  verify({publicRoot,manifest});
  return {publicRoot,manifestPath,manifest};
}
function verify({publicRoot,manifest}) {
  const files = fs.readdirSync(publicRoot,{recursive:true}).filter(p => fs.statSync(path.join(publicRoot,p)).isFile()).sort();
  assert.deepEqual(files,manifest.assets.map(x => x.target).sort(),'Public artifact contains unexpected/missing files');
  for (const item of manifest.assets) {
    const bytes = fs.readFileSync(path.join(publicRoot,item.target));
    assert.equal(sha(bytes),item.sha256,`Artifact checksum mismatch: ${item.target}`);
  }
  for (const entry of manifest.assets.filter(x => x.target.endsWith('.html'))) {
    const html = activeHTML(fs.readFileSync(path.join(publicRoot,entry.target),'utf8'));
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
      const ref = m[0].match(/(?:src|href)="([^"]+)"/);
      if (!ref) continue;
      const asset = manifest.assets.find(x => x.target === ref[1]);
      assert(asset,`Unresolved runtime module: ${ref[1]}`);
      assert(m[0].includes(`integrity="sha256-${Buffer.from(asset.sha256,'hex').toString('base64')}"`),'Missing/corrupt SRI');
    }
  }
  return true;
}
function verifyCurrent({root = path.resolve(__dirname, '..'), base = path.join(root,'dist',config.name)} = {}) {
  const {manifest} = plan(root);
  const dir = path.join(base,manifest.sourceDigest), publicRoot = path.join(dir,'public');
  const manifestPath = path.join(dir,'manifest.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath,'utf8')),manifest,'Candidate manifest differs from current inputs');
  verify({publicRoot,manifest});
  return {publicRoot,manifestPath,manifest};
}
module.exports = {build,verify,verifyCurrent,inspect,sha};
if (require.main === module) {
  const result = process.argv.includes('--verify') ? verifyCurrent() : build();
  console.log(JSON.stringify({release:result.manifest.release,sourceDigest:result.manifest.sourceDigest,
    publicRoot:result.publicRoot,assets:result.manifest.assets.length,verified:true},null,2));
}
