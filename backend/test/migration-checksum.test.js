'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checksums}=require('../src/migration-checksum');
const fs=require('node:fs'),path=require('node:path');
test('migration identity tolerates checkout line endings but rejects changed SQL',()=>{
 const sql='CREATE TABLE example (id uuid);\nSELECT 1;\n',crlf=sql.replace(/\n/g,'\r\n');
 assert.deepEqual(new Set(checksums(sql)),new Set(checksums(crlf)));
 for(const variant of [sql,crlf])assert(checksums(sql).includes(crypto.createHash('sha256').update(variant).digest('hex')));
 assert(!checksums(sql).some(h=>checksums(sql.replace('SELECT 1','SELECT 2')).includes(h)));
});
test('normalized Linux checkout accepts only the exact deployed mixed-ending SQL',()=>{
 const deployed=[
  ['071_platform_overview.sql','8385cd9bb3d304ce6b0b59ede4d91d756301b59f90bd8aaa60f07c100ff45e82'],
  ['072_workspace_platform_sections.sql','fd4023d23e8cdc46892ecd9f271cf4f257e661696f042b8521eb8307927e534a'],
  ['073_platform_user_details.sql','b672162c2bb0f0811f70a524dcd7f9d2c1a89d9a705b463af525142ae32fe37b'],
 ];
 for(const [file,recorded] of deployed){
  const lf=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8').replace(/\r\n/g,'\n');
  for(const sql of [lf,lf.replace(/\n/g,'\r\n')])assert(checksums(sql).includes(recorded),file);
  assert(!checksums(lf+'\nSELECT 1;').includes(recorded),'changed SQL must not inherit history');
 }
});
