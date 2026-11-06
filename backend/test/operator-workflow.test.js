'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fileData}=require('../src/operator-workflow');
test('work documents validate actual file bytes, canonical base64 and size',()=>{
 const pdf=Buffer.from('%PDF-1.4\n%%EOF');assert.equal(fileData({filename:'kontrol.pdf',contentBase64:pdf.toString('base64')}).mime,'application/pdf');
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);assert.equal(fileData({filename:'kontrol.png',contentBase64:png.toString('base64')}).mime,'image/png');
 assert.throws(()=>fileData({filename:'fake.pdf',contentBase64:Buffer.from('<script>alert(1)</script>').toString('base64')}));
 assert.throws(()=>fileData({filename:'bad.pdf',contentBase64:'not base64'}));
 assert.throws(()=>fileData({filename:'large.pdf',contentBase64:Buffer.alloc(5242881).toString('base64')}));
});
