'use strict';
// Reproducible source handoff; credentials, scenario identities and test output stay out.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/cloud-release/today/source');
fs.mkdirSync(out,{recursive:true});
const files=[];
function copy(relative){const from=path.join(root,relative),to=path.join(out,relative),stat=fs.lstatSync(from);if(stat.isSymbolicLink())throw Error('Release cannot contain filesystem links');if(stat.isDirectory()){for(const name of fs.readdirSync(from))copy(path.join(relative,name));return}if(/(?:^|[\\/])(?:node_modules|artifacts|\.git)(?:[\\/]|$)|\.env|\.private\.|\.clixml$|\.pfx$|\.pem$|\.key$/.test(relative))throw Error('Private or generated file in release: '+relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);files.push({file:relative.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(from)).digest('hex')})}
for(const relative of ['api','backend/src','backend/security','backend/migrations','backend/package.json','backend/package-lock.json','assets','integration','scripts/build-cloud.cjs','customers/hasmaksan.html','index.html','package.json','package-lock.json','vercel.json'])copy(relative);
fs.writeFileSync(path.join(out,'.vercelignore'),'node_modules\nbackend/node_modules\nartifacts\n.git\n.env*\nbackend/.env*\n');
fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify({expectedSchema:'062',files:files.sort((a,b)=>a.file.localeCompare(b.file))},null,2));
console.log('Release source prepared: '+files.length+' files; no credentials or test identities.');
