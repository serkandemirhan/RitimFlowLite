'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checksums}=require('../src/migration-checksum');
test('migration identity tolerates checkout line endings but rejects changed SQL',()=>{
 const sql='CREATE TABLE example (id uuid);\nSELECT 1;\n',crlf=sql.replace(/\n/g,'\r\n');
 assert.deepEqual(checksums(sql),checksums(crlf));
 for(const variant of [sql,crlf])assert(checksums(sql).includes(crypto.createHash('sha256').update(variant).digest('hex')));
 assert(!checksums(sql).some(h=>checksums(sql.replace('SELECT 1','SELECT 2')).includes(h)));
});
