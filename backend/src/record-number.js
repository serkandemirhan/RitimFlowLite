'use strict';
const crypto=require('node:crypto');
// Human-facing number; the immutable UUID remains the database identity.
function recordNumber(prefix){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
 return prefix+'-'+date+'-'+crypto.randomBytes(6).toString('hex').toUpperCase();
}
module.exports={recordNumber};
