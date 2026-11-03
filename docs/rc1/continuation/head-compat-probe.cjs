/* Read-only comparison of the local HEAD entry point with the prepared public manifest. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const html=execFileSync('git',['show','HEAD:index.html'],{cwd:root,encoding:'utf8'});
const staticHTML=html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g,'$1</script>');
const refs=[...staticHTML.matchAll(/(?:src|href)="(assets\/(?:js|css)\/[^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/rc1/evidence/asset-manifest.json'),'utf8'));
const paths=new Set(manifest.assets.map(x=>x.target));
console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  headIndexSha256:crypto.createHash('sha256').update(html).digest('hex'),candidate:manifest.sourceDigest,
  entryReferences:refs,missingFromCandidate:refs.filter(ref=>!paths.has(ref)),
  transactionBootstrapReferenced:html.includes('RitimTransactions.open'),
  transactionModuleReferenced:refs.some(ref=>ref.endsWith('/transactions.js')),
  limitation:'Local HEAD is not proof of the currently deployed Pages artifact or actual cache behavior.'},null,2));
