'use strict';
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function checksums(sql){const original=String(sql),lf=original.replace(/\r\n/g,'\n');return [...new Set([hash(original),hash(lf),hash(lf.replace(/\n/g,'\r\n'))])];}
module.exports={checksums};
